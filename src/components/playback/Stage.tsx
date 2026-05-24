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

import { useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type {
  AssetManifest,
  CastId,
  Cue,
  Production,
  Shot,
  TransitionEdge,
} from '@/lib/lattice';
import { normalizeProduction } from '@/lib/lattice-normalize';
import { resolveShotState, type ResolvedElementState, type ResolvedShotState } from './cues';
import { renderElement, type ElementContext } from './elements';
import { resolveTransitionEnvelope } from './transition-envelope';

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

const warnedTransitionFallbacks = new Set<TransitionEdge['kind']>();

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

  // Stable signal of which action cues have fired by now
  useMemo(() => {
    if (activeResolved && onActions) onActions(activeResolved.pendingActions);
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
