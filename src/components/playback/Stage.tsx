/* ============================================================
   Stage — R3F-based primitive that renders a Production's
   current Shot.

   Inputs:
     - production: the Production data
     - manifest:   the AssetManifest (Slot → Take registry)
     - shotIndex:  which Shot to render (caller controls the playhead)
     - shotTime:   seconds into the current Shot (drives Cues)
     - interactives: registry of custom components for
                     interactive-group Elements
     - interactiveRefs: refs the Stage forwards to interactive Elements
     - aspect:     '16:9' (default) | '4:3' | '1:1' | '9:16'
                   The Stage scales to fit available space at this
                   aspect, letterboxing as needed.

   Stage uses an orthographic camera framed to a virtual viewport
   (width 16, height 9 by default). Layout coordinates are 0..1
   relative to this viewport, with y inverted (0 = top).

   Action Cues fire via the `onActions` callback once per render
   (Stage passes the set of action Cues whose `at <= shotTime`;
   the caller is responsible for de-duping vs prior tick).
   ============================================================ */

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useTexture } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  AssetManifest,
  BoxRect,
  CastId,
  Cue,
  GradientBackground,
  ImagePanBackground,
  ParallaxLayer,
  Production,
  Scene,
  SceneBackground,
  Shot,
  ShotAddress,
  TransitionEdge,
} from '@/lib/lattice';
import { normalizeProduction } from '@/lib/lattice-normalize';
import {
  findActiveScene,
  gradientDriftOffset,
  imagePanFrame,
  sceneElapsedSeconds,
} from '@/lib/scene-background-renderer';
import { getInteractive } from '@/lib/interactives';
import { resolveShotState, type ResolvedElementState, type ResolvedShotState } from './cues';
import { renderElement, type ElementContext, type RuntimeInteractivesRegistry } from './elements';
import { resolveSlot } from './asset-resolve';
import { resolveTransitionEnvelope, type TransitionEnvelopeState } from './transition-envelope';

export interface StageProps {
  production: Production;
  manifest: AssetManifest;
  shotIndex: number;
  shotTime: number;
  interactives?: ElementContext['interactives'];
  interactiveRefs?: ElementContext['interactiveRefs'];
  aspect?: '16:9' | '4:3' | '1:1' | '9:16';
  activeSpeakerCastId?: CastId | null;
  mastery_level?: number;
  /** Background color for the Stage frame (inside the letterbox). */
  background?: string;
  /** Letterbox color (outside the Stage frame). */
  letterboxColor?: string;
  /** Called with the action cues fired by this render. The caller
   *  diffs against prior tick to dispatch onto interactive refs. */
  onActions?: (actions: Array<Extract<Cue, { kind: 'action' }>>) => void;
  className?: string;
}

const ASPECTS: Record<NonNullable<StageProps['aspect']>, [number, number]> = {
  '16:9': [16, 9],
  '4:3': [4, 3],
  '1:1': [1, 1],
  '9:16': [9, 16],
};

type LayerOffset = readonly [number, number];

interface TransitionLayerVisuals {
  prev: { opacity: number; offset: LayerOffset };
  next: { opacity: number; offset: LayerOffset };
}

interface BackgroundLayerSpec {
  layerKey: string;
  scene: Scene;
  elapsed_s: number;
  opacity: number;
}

const warnedTransitionFallbacks = new Set<TransitionEdge['kind']>();
const warnedInteractiveActionDiagnostics = new Set<string>();
let warnedParallaxBackground = false;

export function Stage({
  production,
  manifest,
  shotIndex,
  shotTime,
  interactives,
  interactiveRefs,
  aspect = '16:9',
  activeSpeakerCastId,
  mastery_level,
  background = '#0f172a',
  letterboxColor = '#000',
  onActions,
  className = '',
}: StageProps) {
  const [aspectW, aspectH] = ASPECTS[aspect];

  const normalizedProduction = useMemo(
    () => normalizeProduction(production),
    [production],
  );

  const envelopeState = useMemo(
    () => resolveTransitionEnvelope(normalizedProduction, shotIndex, shotTime),
    [normalizedProduction, shotIndex, shotTime],
  );
  const shot = envelopeState === null ? null : envelopeState.activeShot;

  const activeResolved = useMemo(
    () => (shot ? resolveShotState(shot.elements, shot.cues, shotTime) : null),
    [shot, shotTime],
  );

  const transitionResolved = useMemo(() => {
    if (envelopeState === null || envelopeState.envelope === undefined) {
      return null;
    }
    const envelope = envelopeState.envelope;
    return {
      envelope,
      prevResolved: resolveShotState(
        envelope.prevShot.elements,
        envelope.prevShot.cues,
        envelope.prevShotTime,
      ),
      nextResolved: resolveShotState(
        envelope.nextShot.elements,
        envelope.nextShot.cues,
        envelope.nextShotTime,
      ),
      visuals: transitionVisuals(envelope.edge, envelope.progress, aspectW, aspectH),
    };
  }, [envelopeState, aspectW, aspectH]);

  const backgroundLayers = useMemo(
    () => backgroundLayerSpecs(normalizedProduction, shotIndex, shotTime, envelopeState),
    [normalizedProduction, shotIndex, shotTime, envelopeState],
  );

  // Stable signal of which action cues have fired by now
  useMemo(() => {
    if (activeResolved) {
      assertInteractiveActionContracts(
        activeResolved.pendingActions,
        shot,
        activeResolved.spawned,
        interactives,
      );
      if (onActions) onActions(activeResolved.pendingActions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResolved?.pendingActions.length, shotIndex]);

  if (!shot || !activeResolved) {
    return (
      <div className={`w-full h-full flex items-center justify-center ${className}`} style={{ background: letterboxColor }}>
        <p className="font-mono text-xs text-ink-subtle">No Shot at index {shotIndex}</p>
      </div>
    );
  }

  const ctx: ElementContext = {
    manifest,
    viewport: { width: aspectW, height: aspectH },
    characters: production.characters,
    activeSpeakerCastId: activeSpeakerCastId ?? null,
    interactives,
    interactiveRefs,
    mastery_level,
  };

  return (
    <div
      className={`relative w-full h-full flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: letterboxColor }}
    >
      <div
        className="relative"
        style={{
          aspectRatio: `${aspectW} / ${aspectH}`,
          width: '100%',
          maxWidth: '100%',
          maxHeight: '100%',
          background,
        }}
      >
        <Canvas
          orthographic
          camera={{ position: [0, 0, 10], zoom: 1, near: 0.01, far: 100 }}
          dpr={[1, 2]}
          style={{ width: '100%', height: '100%' }}
        >
          <ambientLight intensity={1} />
          <CameraFrame width={aspectW} height={aspectH} />
          {backgroundLayers.map((layer) => (
            <SceneBackgroundLayer
              key={layer.layerKey}
              background={layer.scene.background}
              manifest={manifest}
              viewport={{ width: aspectW, height: aspectH }}
              elapsed_s={layer.elapsed_s}
              opacity={layer.opacity}
              mastery_level={mastery_level}
            />
          ))}
          {transitionResolved === null
            ? renderShotLayer({
                shot,
                resolved: activeResolved,
                ctx,
                opacity: 1,
                offset: [0, 0],
                layerKey: 'active',
              })
            : (
              <>
                {renderShotLayer({
                  shot: transitionResolved.envelope.prevShot,
                  resolved: transitionResolved.prevResolved,
                  ctx,
                  opacity: transitionResolved.visuals.prev.opacity,
                  offset: transitionResolved.visuals.prev.offset,
                  layerKey: 'transition-prev',
                })}
                {renderShotLayer({
                  shot: transitionResolved.envelope.nextShot,
                  resolved: transitionResolved.nextResolved,
                  ctx,
                  opacity: transitionResolved.visuals.next.opacity,
                  offset: transitionResolved.visuals.next.offset,
                  layerKey: 'transition-next',
                })}
              </>
            )}
        </Canvas>
      </div>
    </div>
  );
}

function backgroundLayerSpecs(
  production: Production,
  shotIndex: number,
  shotTime: number,
  envelopeState: TransitionEnvelopeState | null,
): BackgroundLayerSpec[] {
  if (envelopeState === null) {
    return [];
  }

  const envelope = envelopeState.envelope;
  if (envelope !== undefined) {
    const prevScene = findActiveScene(production, envelope.edge.from);
    const nextScene = findActiveScene(production, envelope.edge.to);
    if (prevScene.id !== nextScene.id) {
      return [
        {
          layerKey: 'background-transition-prev',
          scene: prevScene,
          elapsed_s: sceneElapsedSeconds(production, envelope.edge.from, envelope.prevShotTime),
          opacity: 1 - envelope.progress,
        },
        {
          layerKey: 'background-transition-next',
          scene: nextScene,
          elapsed_s: sceneElapsedSeconds(production, envelope.edge.to, envelope.nextShotTime),
          opacity: envelope.progress,
        },
      ];
    }
  }

  const activeAddress = shotAddressAtIndex(production, shotIndex);
  if (activeAddress === null) {
    return [];
  }
  const activeScene = findActiveScene(production, activeAddress);
  return [{
    layerKey: 'background-active',
    scene: activeScene,
    elapsed_s: sceneElapsedSeconds(production, activeAddress, shotTime),
    opacity: 1,
  }];
}

function shotAddressAtIndex(production: Production, targetIndex: number): ShotAddress | null {
  let shotIndex = 0;
  for (const scene of production.scenes) {
    for (const shot of scene.shots) {
      if (shotIndex === targetIndex) {
        return { scene_id: scene.id, shot_id: shot.id };
      }
      shotIndex += 1;
    }
  }
  return null;
}

function renderShotLayer(args: {
  shot: Shot;
  resolved: ResolvedShotState;
  ctx: ElementContext;
  opacity: number;
  offset: LayerOffset;
  layerKey: string;
}) {
  const allElements = [...args.shot.elements, ...args.resolved.spawned];
  const rendered = allElements
    .map((element, originalIndex) => ({
      element,
      originalIndex,
      state: args.resolved.elements[element.id],
    }))
    .filter((entry): entry is { element: Shot['elements'][number]; originalIndex: number; state: ResolvedElementState } =>
      entry.state !== undefined && entry.state.visible,
    )
    .sort((a, b) => {
      const za = a.state.layout.z_order;
      const zb = b.state.layout.z_order;
      if (za !== zb) {
        return za - zb;
      }
      return a.originalIndex - b.originalIndex;
    })
    .map((entry) => renderElement(
      entry.element,
      stateWithOpacity(entry.state, args.opacity),
      args.ctx,
    ));

  return (
    <group key={args.layerKey} position={[args.offset[0], args.offset[1], 0]}>
      {rendered}
    </group>
  );
}

function stateWithOpacity(state: ResolvedElementState, opacity: number): ResolvedElementState {
  if (opacity === 1) {
    return state;
  }
  return {
    ...state,
    layout: {
      ...state.layout,
      opacity: state.layout.opacity * opacity,
    },
  };
}

function assertInteractiveActionContracts(
  actions: Array<Extract<Cue, { kind: 'action' }>>,
  shot: Shot | null,
  spawned: Shot['elements'],
  interactives: ElementContext['interactives'],
): void {
  if (shot === null || !hasContractRegistry(interactives)) {
    return;
  }

  const componentIds = interactiveComponentIds(shot, spawned);
  for (const action of actions) {
    const componentId = componentIds[action.element_id];
    if (componentId === undefined) {
      continue;
    }
    const entry = getInteractive(interactives, componentId);
    if (entry === undefined) {
      continue;
    }
    if (entry.contract.methods[action.method] !== undefined) {
      continue;
    }
    const key = `${componentId}:${action.id === undefined ? `${action.element_id}.${action.method}.${action.at}` : action.id}`;
    if (warnedInteractiveActionDiagnostics.has(key)) {
      continue;
    }
    warnedInteractiveActionDiagnostics.add(key);
    console.error({
      code: 'interactive.action.unknown_method',
      component_id: componentId,
      method: action.method,
      known_methods: Object.keys(entry.contract.methods),
    });
  }
}

function hasContractRegistry(
  interactives: ElementContext['interactives'],
): interactives is RuntimeInteractivesRegistry {
  if (interactives === undefined) {
    return false;
  }
  const keys = Object.keys(interactives);
  if (keys.length === 0) {
    return true;
  }
  const first = interactives[keys[0]];
  return typeof first === 'object'
    && first !== null
    && 'component' in first
    && 'contract' in first;
}

function interactiveComponentIds(
  shot: Shot,
  spawned: Shot['elements'],
): { [element_id: string]: string } {
  const componentIds: { [element_id: string]: string } = {};
  for (const element of shot.elements) {
    if (element.kind === 'interactive-group') {
      componentIds[element.id] = element.component_id;
    }
  }
  for (const element of spawned) {
    if (element.kind === 'interactive-group') {
      componentIds[element.id] = element.component_id;
    }
  }
  return componentIds;
}

function SceneBackgroundLayer(props: {
  background: SceneBackground | undefined;
  manifest: AssetManifest;
  viewport: { width: number; height: number };
  elapsed_s: number;
  opacity: number;
  mastery_level?: number;
}) {
  const background = props.background;
  if (background === undefined) {
    return null;
  }

  switch (background.kind) {
    case 'none':
      return null;
    case 'gradient':
      return (
        <GradientBackgroundMesh
          background={background}
          viewport={props.viewport}
          elapsed_s={props.elapsed_s}
          opacity={props.opacity}
        />
      );
    case 'image-pan':
      return (
        <ImagePanBackgroundMesh
          background={background}
          manifest={props.manifest}
          viewport={props.viewport}
          elapsed_s={props.elapsed_s}
          opacity={props.opacity}
          mastery_level={props.mastery_level}
        />
      );
    case 'parallax': {
      warnParallaxBackgroundFallback();
      const layer = deepestParallaxLayer(background.layers);
      if (layer === null) {
        return null;
      }
      return (
        <SlotBackgroundMesh
          slot_id={layer.slot_id}
          manifest={props.manifest}
          viewport={props.viewport}
          opacity={props.opacity}
          offset={parallaxLayerOffset(layer)}
          mastery_level={props.mastery_level}
        />
      );
    }
  }
  const exhaustive: never = background;
  return exhaustive;
}

function GradientBackgroundMesh(props: {
  background: GradientBackground;
  viewport: { width: number; height: number };
  elapsed_s: number;
  opacity: number;
}) {
  const texture = useMemo(
    () => makeGradientTexture(props.background),
    [props.background],
  );
  const elapsedRef = useRef(props.elapsed_s);
  elapsedRef.current = props.elapsed_s;

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(() => {
    const offset = gradientDriftOffset(props.background, elapsedRef.current);
    texture.offset.set(offset.x, offset.y);
  });

  return (
    <mesh position={[0, 0, -10]}>
      <planeGeometry args={[props.viewport.width, props.viewport.height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={props.opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function ImagePanBackgroundMesh(props: {
  background: ImagePanBackground;
  manifest: AssetManifest;
  viewport: { width: number; height: number };
  elapsed_s: number;
  opacity: number;
  mastery_level?: number;
}) {
  const resolved = resolveSlot(
    { slot_id: props.background.slot_id },
    props.manifest,
    { mastery_level: props.mastery_level },
  );

  if (resolved.url === null) {
    return (
      <DebugGridBackground
        slot_id={props.background.slot_id}
        viewport={props.viewport}
        opacity={props.opacity}
      />
    );
  }

  return (
    <Suspense fallback={null}>
      <ImagePanTexturedBackground
        url={resolved.url}
        background={props.background}
        viewport={props.viewport}
        elapsed_s={props.elapsed_s}
        opacity={props.opacity}
      />
    </Suspense>
  );
}

function ImagePanTexturedBackground(props: {
  url: string;
  background: ImagePanBackground;
  viewport: { width: number; height: number };
  elapsed_s: number;
  opacity: number;
}) {
  const sourceTexture = useTexture(props.url);
  const texture = useMemo(() => {
    const clone = sourceTexture.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.wrapS = THREE.ClampToEdgeWrapping;
    clone.wrapT = THREE.ClampToEdgeWrapping;
    clone.needsUpdate = true;
    return clone;
  }, [sourceTexture]);
  const elapsedRef = useRef(props.elapsed_s);
  elapsedRef.current = props.elapsed_s;

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(() => {
    const frame = imagePanFrame(props.background, elapsedRef.current);
    applyTextureBox(texture, zoomedBox(frame.box, frame.zoom));
  });

  return (
    <mesh position={[0, 0, -10]}>
      <planeGeometry args={[props.viewport.width, props.viewport.height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={props.opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function SlotBackgroundMesh(props: {
  slot_id: string;
  manifest: AssetManifest;
  viewport: { width: number; height: number };
  opacity: number;
  offset: { x: number; y: number };
  mastery_level?: number;
}) {
  const resolved = resolveSlot(
    { slot_id: props.slot_id },
    props.manifest,
    { mastery_level: props.mastery_level },
  );

  if (resolved.url === null) {
    return (
      <DebugGridBackground
        slot_id={props.slot_id}
        viewport={props.viewport}
        opacity={props.opacity}
      />
    );
  }

  return (
    <Suspense fallback={null}>
      <StaticTexturedBackground
        url={resolved.url}
        viewport={props.viewport}
        opacity={props.opacity}
        offset={props.offset}
      />
    </Suspense>
  );
}

function StaticTexturedBackground(props: {
  url: string;
  viewport: { width: number; height: number };
  opacity: number;
  offset: { x: number; y: number };
}) {
  const sourceTexture = useTexture(props.url);
  const texture = useMemo(() => {
    const clone = sourceTexture.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.wrapS = THREE.ClampToEdgeWrapping;
    clone.wrapT = THREE.ClampToEdgeWrapping;
    clone.needsUpdate = true;
    return clone;
  }, [sourceTexture]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh
      position={[
        props.offset.x * props.viewport.width,
        -props.offset.y * props.viewport.height,
        -10,
      ]}
    >
      <planeGeometry args={[props.viewport.width, props.viewport.height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={props.opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function DebugGridBackground(props: {
  slot_id: string;
  viewport: { width: number; height: number };
  opacity: number;
}) {
  const texture = useMemo(
    () => makeDebugGridTexture(props.slot_id),
    [props.slot_id],
  );

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={[0, 0, -10]}>
      <planeGeometry args={[props.viewport.width, props.viewport.height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={props.opacity * 0.72}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function makeGradientTexture(background: GradientBackground): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('2d canvas context unavailable for gradient background');
  }

  if (background.stops.length === 0) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, size, size);
  } else if (background.stops.length === 1) {
    ctx.fillStyle = background.stops[0].color;
    ctx.fillRect(0, 0, size, size);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    for (const stop of background.stops) {
      gradient.addColorStop(stop.offset, stop.color);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function makeDebugGridTexture(slot_id: string): THREE.CanvasTexture {
  const size = 512;
  const step = 32;
  const hue = hashHue(slot_id);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('2d canvas context unavailable for debug background');
  }

  ctx.fillStyle = `hsl(${hue}, 48%, 24%)`;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = `hsla(${hue}, 88%, 72%, 0.42)`;
  ctx.lineWidth = 1;
  for (let x = 0; x <= size; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0; y <= size; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function applyTextureBox(texture: THREE.Texture, box: BoxRect): void {
  texture.repeat.set(box.width, box.height);
  texture.offset.set(box.x, 1 - box.y - box.height);
  texture.needsUpdate = true;
}

function zoomedBox(box: BoxRect, zoom: number): BoxRect {
  const width = box.width / zoom;
  const height = box.height / zoom;
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

function deepestParallaxLayer(layers: ParallaxLayer[]): ParallaxLayer | null {
  if (layers.length === 0) {
    return null;
  }
  let deepest = layers[0];
  for (let i = 1; i < layers.length; i += 1) {
    if (layers[i].depth > deepest.depth) {
      deepest = layers[i];
    }
  }
  return deepest;
}

function parallaxLayerOffset(layer: ParallaxLayer): { x: number; y: number } {
  if (layer.offset === undefined) {
    return { x: 0, y: 0 };
  }
  return layer.offset;
}

function hashHue(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  return hash;
}

function warnParallaxBackgroundFallback(): void {
  if (warnedParallaxBackground) {
    return;
  }
  warnedParallaxBackground = true;
  console.warn('parallax backgrounds render the deepest layer only in Stage v0.1.');
}

function transitionVisuals(
  edge: TransitionEdge,
  progress: number,
  width: number,
  height: number,
): TransitionLayerVisuals {
  switch (edge.kind) {
    case 'cut':
      return {
        prev: { opacity: 0, offset: [0, 0] },
        next: { opacity: 1, offset: [0, 0] },
      };
    case 'fade':
    case 'cross-dissolve':
      return fadeVisuals(progress);
    case 'slide': {
      const movement = movementVector(edge.direction, width, height);
      return {
        prev: { opacity: 1, offset: [0, 0] },
        next: {
          opacity: 1,
          offset: [-movement[0] * (1 - progress), -movement[1] * (1 - progress)],
        },
      };
    }
    case 'push': {
      const movement = movementVector(edge.direction, width, height);
      return {
        prev: {
          opacity: 1,
          offset: [movement[0] * progress, movement[1] * progress],
        },
        next: {
          opacity: 1,
          offset: [-movement[0] * (1 - progress), -movement[1] * (1 - progress)],
        },
      };
    }
    case 'wipe':
    case 'iris':
    case 'shader':
      warnTransitionFallback(edge.kind);
      return fadeVisuals(progress);
  }
  const exhaustive: never = edge.kind;
  return exhaustive;
}

function fadeVisuals(progress: number): TransitionLayerVisuals {
  return {
    prev: { opacity: 1 - progress, offset: [0, 0] },
    next: { opacity: progress, offset: [0, 0] },
  };
}

function movementVector(
  direction: TransitionEdge['direction'],
  width: number,
  height: number,
): LayerOffset {
  const resolvedDirection = direction === undefined ? 'left' : direction;
  switch (resolvedDirection) {
    case 'left':
      return [-width, 0];
    case 'right':
      return [width, 0];
    case 'up':
      return [0, height];
    case 'down':
      return [0, -height];
  }
  const exhaustive: never = resolvedDirection;
  return exhaustive;
}

function warnTransitionFallback(kind: TransitionEdge['kind']): void {
  if (warnedTransitionFallbacks.has(kind)) {
    return;
  }
  warnedTransitionFallbacks.add(kind);
  console.warn(`${kind} transitions are not implemented in Stage yet; falling back to fade.`);
}

/** Configure the orthographic camera's zoom so the (width × height)
 *  virtual viewport fills the Canvas exactly. */
function CameraFrame({ width, height }: { width: number; height: number }) {
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    if (!('isOrthographicCamera' in camera) || !camera.isOrthographicCamera) return;
    const targetZoom = Math.min(size.width / width, size.height / height);
    if (Math.abs(camera.zoom - targetZoom) > 0.001) {
      camera.zoom = targetZoom;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
