/* ============================================================
   Element renderers — one R3F component per Element kind.

   Every renderer takes the resolved state for that element (layout,
   visible, mask, material, uniforms) + the element's static spec
   (text content, source SlotRef, etc.). It renders into the R3F
   scene graph. Cue-driven animation happens via prop changes; the
   parent recomputes the resolved state on each playhead tick.

   v0.1 ships: text-overlay, math, image-plane, video-plane, shape,
   interactive-group. sprite, model-3d, chroma-keyed-talent come
   when scenes call for them.
   ============================================================ */

import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Html, useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  Element as LatticeElement,
  AssetManifest,
  CastId,
  CastMember,
  CharacterElement,
  ChromaKeyedTalentElement,
  InteractiveGroupElement,
  TextOverlayElement,
  MathElement,
  ImagePlaneElement,
  VideoPlaneElement,
  ShapeElement,
} from '@/lib/lattice';
import { resolveCharacterPose } from '@/lib/character-pose-resolver';
import type {
  InteractiveContract,
  InteractiveRegistryEntry,
  InteractivesRegistry,
} from '@/lib/interactives';
import type { ResolvedElementState } from './cues';
import { resolveSlot } from './asset-resolve';

/* ---- Shared types ----------------------------------------- */

export interface InteractiveComponentProps {
  ref?: React.Ref<unknown>;
  props?: InteractiveGroupElement['props'];
}

export type RuntimeInteractivesRegistry = InteractivesRegistry<InteractiveComponentProps>;
export type DeprecatedInteractivesRecord = {
  [component_id: string]: React.ComponentType<InteractiveComponentProps>;
};
export type ElementInteractivesRegistry = RuntimeInteractivesRegistry | DeprecatedInteractivesRecord;

export interface ElementContext {
  manifest: AssetManifest;
  /** Stage viewport dimensions in scene units (used to translate
   *  0..1 layout coords into world-space positions). The Stage
   *  parents an Orthographic camera framed to these bounds. */
  viewport: { width: number; height: number };
  /** Cast roster used by character Elements to resolve pose Slots. */
  characters: CastMember[];
  /** Cast member currently speaking, driven by Playback dialogue state. */
  activeSpeakerCastId: CastId | null;
  /** Registry of custom interactive components (component_id → component + contract). */
  interactives?: ElementInteractivesRegistry;
  /** Optional ref bag for interactive Elements — Stage caller can pass
   *  refs in to dispatch action Cues onto them. */
  interactiveRefs?: Record<string, React.RefObject<unknown>>;
  /** Mastery context for Take resolution on Slots with mastery tiers. */
  mastery_level?: number;
}

interface RenderProps<E extends LatticeElement> {
  element: E;
  state: ResolvedElementState;
  ctx: ElementContext;
}

type CharacterPoseElement = CharacterElement | ChromaKeyedTalentElement;

let warnedChromaKeyedTalentAlias = false;
let warnedInteractivesRecordAlias = false;

/* ---- Coord translator -------------------------------------- */

/** Translate a 0..1 layout position into Three.js world-space.
 *  Stage uses an orthographic camera with origin at viewport center,
 *  +x right, +y up. Our layout uses 0..1 with y=0 at top. */
function layoutToWorld(
  state: ResolvedElementState,
  viewport: { width: number; height: number },
): { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] } {
  const [lx, ly, lz] = state.layout.position;
  const x = (lx - 0.5) * viewport.width;
  const y = (0.5 - ly) * viewport.height;
  const z = lz;
  const scale: [number, number, number] = Array.isArray(state.layout.scale)
    ? [state.layout.scale[0], state.layout.scale[1], state.layout.scale[2]]
    : [state.layout.scale, state.layout.scale, state.layout.scale];
  return {
    position: [x, y, z],
    rotation: [state.layout.rotation[0], state.layout.rotation[1], state.layout.rotation[2]],
    scale,
  };
}

function elementSize(
  state: ResolvedElementState,
  viewport: { width: number; height: number },
): [number, number] {
  const w = (state.layout.size?.width ?? 0.5) * viewport.width;
  const h = (state.layout.size?.height ?? 0.2) * viewport.height;
  return [w, h];
}

/* ---- text-overlay ----------------------------------------- */

function TextOverlayRenderer({ element, state, ctx }: RenderProps<TextOverlayElement>) {
  const w = layoutToWorld(state, ctx.viewport);
  const style = element.style ?? {};
  const align = style.align ?? 'center';
  const sizeClass = SIZE_CLASSES[style.size ?? 'lg'];
  const fontClass = FONT_CLASSES[style.font ?? 'display'];

  if (style.render_3d) {
    // 3D text via drei's <Text> — left for later when we need actual depth
    // For now fall back to HTML overlay.
  }

  return (
    <group position={w.position} rotation={w.rotation} scale={w.scale}>
      <Html
        center
        transform={false}
        wrapperClass="lattice-text-overlay"
        style={{
          textAlign: align,
          color: style.color ?? 'inherit',
          fontWeight: style.weight ?? 500,
          opacity: state.layout.opacity,
          pointerEvents: 'none',
          width: `${(state.layout.size?.width ?? 0.84) * 100}%`,
        }}
      >
        <div className={`${fontClass} ${sizeClass} leading-tight tracking-tight whitespace-pre-line`}>
          {element.text}
        </div>
      </Html>
    </group>
  );
}

const SIZE_CLASSES: Record<NonNullable<TextOverlayElement['style']>['size'] & string, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  '4xl': 'text-4xl',
  '5xl': 'text-5xl',
  '6xl': 'text-6xl',
};
const FONT_CLASSES: Record<NonNullable<TextOverlayElement['style']>['font'] & string, string> = {
  display: 'font-display',
  sans: 'font-sans',
  mono: 'font-mono',
};

/* ---- math (KaTeX via HTML overlay) ----------------------- */

function MathRenderer({ element, state, ctx }: RenderProps<MathElement>) {
  const w = layoutToWorld(state, ctx.viewport);
  return (
    <group position={w.position} rotation={w.rotation} scale={w.scale}>
      <Html
        center
        transform={false}
        style={{ opacity: state.layout.opacity, pointerEvents: 'none' }}
      >
        {/* Defer to a KaTeX HTML mount. Light-weight: just render the latex
            inline; a parent KaTeX renderer can pick it up. */}
        <span className={element.display ? 'block' : 'inline'} data-katex={element.latex}>
          {element.latex}
        </span>
      </Html>
    </group>
  );
}

/* ---- shape ------------------------------------------------ */

function ShapeRenderer({ element, state, ctx }: RenderProps<ShapeElement>) {
  const w = layoutToWorld(state, ctx.viewport);
  const [width, height] = elementSize(state, ctx.viewport);
  const color = (state.material.color as string) ?? element.color ?? '#5b21b6';
  return (
    <mesh
      position={w.position}
      rotation={w.rotation}
      scale={w.scale}
      visible={state.visible}
    >
      {element.shape === 'circle' ? (
        <circleGeometry args={[Math.min(width, height) / 2, 64]} />
      ) : (
        <planeGeometry args={[width, height]} />
      )}
      <meshBasicMaterial color={color} transparent opacity={state.layout.opacity} />
    </mesh>
  );
}

/* ---- image-plane ----------------------------------------- */

function ImagePlaneRenderer({ element, state, ctx }: RenderProps<ImagePlaneElement>) {
  const w = layoutToWorld(state, ctx.viewport);
  const [width, height] = elementSize(state, ctx.viewport);
  const resolved = resolveSlot(element.source, ctx.manifest, { mastery_level: ctx.mastery_level });
  if (!resolved.url) {
    // Placeholder rectangle
    return (
      <mesh position={w.position} rotation={w.rotation} scale={w.scale} visible={state.visible}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color="#1f2937" transparent opacity={state.layout.opacity * 0.6} />
      </mesh>
    );
  }
  return (
    <Suspense fallback={null}>
      <ImagePlaneTextured
        url={resolved.url}
        position={w.position}
        rotation={w.rotation}
        scale={w.scale}
        width={width}
        height={height}
        visible={state.visible}
        opacity={state.layout.opacity}
      />
    </Suspense>
  );
}

function ImagePlaneTextured(props: {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
}) {
  const tex = useTexture(props.url);
  return (
    <mesh
      position={props.position}
      rotation={props.rotation}
      scale={props.scale}
      visible={props.visible}
    >
      <planeGeometry args={[props.width, props.height]} />
      <meshBasicMaterial map={tex} transparent opacity={props.opacity} />
    </mesh>
  );
}

/* ---- video-plane ---------------------------------------- */

function VideoPlaneRenderer({ element, state, ctx }: RenderProps<VideoPlaneElement>) {
  const w = layoutToWorld(state, ctx.viewport);
  const [width, height] = elementSize(state, ctx.viewport);
  const resolved = resolveSlot(element.source, ctx.manifest, { mastery_level: ctx.mastery_level });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<THREE.VideoTexture | null>(null);

  const url = resolved.url;
  useMemo(() => {
    if (!url) {
      videoRef.current = null;
      textureRef.current = null;
      return;
    }
    const v = document.createElement('video');
    v.src = url;
    v.crossOrigin = 'anonymous';
    v.loop = element.loop ?? false;
    v.muted = element.muted ?? true;
    v.autoplay = true;
    v.playsInline = true;
    void v.play().catch(() => undefined);
    const tex = new THREE.VideoTexture(v);
    tex.colorSpace = THREE.SRGBColorSpace;
    videoRef.current = v;
    textureRef.current = tex;
  }, [url, element.loop, element.muted]);

  useEffect(() => {
    return () => {
      videoRef.current?.pause();
      textureRef.current?.dispose();
    };
  }, []);

  if (!textureRef.current) {
    return (
      <mesh position={w.position} rotation={w.rotation} scale={w.scale} visible={state.visible}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={state.layout.opacity * 0.4} />
      </mesh>
    );
  }
  return (
    <mesh position={w.position} rotation={w.rotation} scale={w.scale} visible={state.visible}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={textureRef.current} transparent opacity={state.layout.opacity} />
    </mesh>
  );
}

/* ---- character ------------------------------------------ */

function CharacterRenderer({ element, state, ctx }: RenderProps<CharacterPoseElement>) {
  const cast = castMemberFor(element, ctx.characters);
  const pose = resolveCharacterPose(element, {
    activeSpeakerCastId: ctx.activeSpeakerCastId,
    cast,
  });
  const resolved = resolveSlot(
    { slot_id: pose.slot_id },
    ctx.manifest,
    { mastery_level: ctx.mastery_level },
  );
  if (resolved.url === null) {
    throw new Error(`character.pose_slot.unresolved: ${element.cast_id}.${pose.pose_name} -> ${pose.slot_id}`);
  }

  const w = layoutToWorld(state, ctx.viewport);
  const [width, height] = elementSize(state, ctx.viewport);
  return (
    <Suspense fallback={null}>
      <CharacterTextured
        url={resolved.url}
        poseName={pose.pose_name}
        position={w.position}
        rotation={w.rotation}
        scale={w.scale}
        width={width}
        height={height}
        opacity={state.layout.opacity}
        visible={state.visible}
        bobAmplitude={ctx.viewport.height * 0.005}
      />
    </Suspense>
  );
}

function CharacterTextured(props: {
  url: string;
  poseName: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  width: number;
  height: number;
  opacity: number;
  visible: boolean;
  bobAmplitude: number;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  const tex = useTexture(props.url);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (group === null) {
      return;
    }
    const idleOffset = props.poseName === 'idle'
      ? Math.sin(clock.elapsedTime * Math.PI) * props.bobAmplitude
      : 0;
    group.position.set(props.position[0], props.position[1] + idleOffset, props.position[2]);
  });

  return (
    <group
      ref={groupRef}
      position={props.position}
      rotation={props.rotation}
      scale={props.scale}
      visible={props.visible}
    >
      <mesh>
        <planeGeometry args={[props.width, props.height]} />
        <meshBasicMaterial map={tex} transparent opacity={props.opacity} />
      </mesh>
    </group>
  );
}

function castMemberFor(element: CharacterPoseElement, characters: CastMember[]): CastMember {
  const cast = characters.find((member) => member.id === element.cast_id);
  if (cast === undefined) {
    throw new Error(`character.cast.missing: ${element.cast_id}`);
  }
  return cast;
}

/* ---- interactive-group ---------------------------------- */

function InteractiveGroupRenderer({ element, state, ctx }: RenderProps<InteractiveGroupElement>) {
  const w = layoutToWorld(state, ctx.viewport);
  const [width, height] = elementSize(state, ctx.viewport);
  const entry = resolveInteractiveEntry(ctx.interactives, element.component_id);

  if (entry === null) {
    return (
      <group position={w.position} rotation={w.rotation} scale={w.scale}>
        <Html
          center
          style={{ pointerEvents: 'none', opacity: 0.4, color: '#94a3b8' }}
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.18em]">
            ⬜ interactive: {element.component_id}
          </div>
        </Html>
      </group>
    );
  }

  const Component = entry.component;
  const ref = ctx.interactiveRefs === undefined ? undefined : ctx.interactiveRefs[element.id];
  return (
    <group position={w.position} rotation={w.rotation} scale={w.scale} visible={state.visible}>
      <Html
        center
        transform={false}
        style={{ width: `${width}px`, height: `${height}px`, pointerEvents: 'auto' }}
      >
        <Component ref={ref} props={element.props} />
      </Html>
    </group>
  );
}

interface ResolvedInteractiveEntry {
  component: React.ComponentType<InteractiveComponentProps>;
  contract?: InteractiveContract;
}

function resolveInteractiveEntry(
  registry: ElementInteractivesRegistry | undefined,
  component_id: string,
): ResolvedInteractiveEntry | null {
  if (registry === undefined) {
    return null;
  }
  const candidate = registry[component_id];
  if (candidate === undefined) {
    return null;
  }
  if (isInteractiveRegistryEntry(candidate)) {
    return {
      component: candidate.component,
      contract: candidate.contract,
    };
  }
  warnInteractivesRecordAlias();
  return { component: candidate };
}

function isInteractiveRegistryEntry(
  candidate: InteractiveRegistryEntry<InteractiveComponentProps> | React.ComponentType<InteractiveComponentProps>,
): candidate is InteractiveRegistryEntry<InteractiveComponentProps> {
  return typeof candidate === 'object'
    && candidate !== null
    && 'component' in candidate
    && 'contract' in candidate;
}

/* ---- Dispatch ------------------------------------------- */

export function renderElement(
  element: LatticeElement,
  state: ResolvedElementState,
  ctx: ElementContext,
): ReactNode {
  switch (element.kind) {
    case 'text-overlay':
      return <TextOverlayRenderer key={element.id} element={element} state={state} ctx={ctx} />;
    case 'math':
      return <MathRenderer key={element.id} element={element} state={state} ctx={ctx} />;
    case 'shape':
      return <ShapeRenderer key={element.id} element={element} state={state} ctx={ctx} />;
    case 'image-plane':
      return <ImagePlaneRenderer key={element.id} element={element} state={state} ctx={ctx} />;
    case 'video-plane':
      return <VideoPlaneRenderer key={element.id} element={element} state={state} ctx={ctx} />;
    case 'character':
      return <CharacterRenderer key={element.id} element={element} state={state} ctx={ctx} />;
    case 'chroma-keyed-talent':
      warnChromaKeyedTalentAlias();
      return <CharacterRenderer key={element.id} element={element} state={state} ctx={ctx} />;
    case 'interactive-group':
      return <InteractiveGroupRenderer key={element.id} element={element} state={state} ctx={ctx} />;
    case 'sprite':
    case 'model-3d':
      // v0.1 placeholder — render a labeled rectangle so author-mode is informative.
      return (
        <group key={element.id} position={layoutToWorld(state, ctx.viewport).position}>
          <Html center style={{ pointerEvents: 'none', opacity: 0.45 }}>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle bg-paper-card border border-ink-subtle/20 px-2 py-1 rounded">
              ⬜ {element.kind}: {element.id}
            </div>
          </Html>
        </group>
      );
    default:
      const exhaustive: never = element;
      return exhaustive;
  }
}

function warnChromaKeyedTalentAlias(): void {
  if (warnedChromaKeyedTalentAlias) {
    return;
  }
  warnedChromaKeyedTalentAlias = true;
  console.warn('chroma-keyed-talent is deprecated; use character Element kind.');
}

function warnInteractivesRecordAlias(): void {
  if (warnedInteractivesRecordAlias) {
    return;
  }
  warnedInteractivesRecordAlias = true;
  console.warn('plain interactive component records are deprecated; use defineInteractivesRegistry entries with contracts.');
}
