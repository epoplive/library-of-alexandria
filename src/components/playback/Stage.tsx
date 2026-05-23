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
  Cue,
  Production,
  Shot,
} from '@/lib/lattice';
import { resolveShotState } from './cues';
import { renderElement, type ElementContext } from './elements';

export interface StageProps {
  production: Production;
  manifest: AssetManifest;
  shotIndex: number;
  shotTime: number;
  interactives?: ElementContext['interactives'];
  interactiveRefs?: ElementContext['interactiveRefs'];
  aspect?: '16:9' | '4:3' | '1:1' | '9:16';
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

export function Stage({
  production,
  manifest,
  shotIndex,
  shotTime,
  interactives,
  interactiveRefs,
  aspect = '16:9',
  mastery_level,
  background = '#0f172a',
  letterboxColor = '#000',
  onActions,
  className = '',
}: StageProps) {
  const [aspectW, aspectH] = ASPECTS[aspect];

  const allShots: Shot[] = useMemo(
    () => production.scenes.flatMap((s) => s.shots),
    [production],
  );
  const shot = allShots[shotIndex];

  const resolved = useMemo(
    () => (shot ? resolveShotState(shot.elements, shot.cues, shotTime) : null),
    [shot, shotTime],
  );

  // Stable signal of which action cues have fired by now
  useMemo(() => {
    if (resolved && onActions) onActions(resolved.pendingActions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved?.pendingActions.length]);

  if (!shot || !resolved) {
    return (
      <div className={`w-full h-full flex items-center justify-center ${className}`} style={{ background: letterboxColor }}>
        <p className="font-mono text-xs text-ink-subtle">No Shot at index {shotIndex}</p>
      </div>
    );
  }

  const ctx: ElementContext = {
    manifest,
    viewport: { width: aspectW, height: aspectH },
    interactives,
    interactiveRefs,
    mastery_level,
  };

  const allElements = [...shot.elements, ...resolved.spawned];

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
          {allElements
            .filter((el) => resolved.elements[el.id]?.visible)
            .sort(
              (a, b) =>
                (resolved.elements[a.id]?.layout.z_order ?? 0) -
                (resolved.elements[b.id]?.layout.z_order ?? 0),
            )
            .map((el) => renderElement(el, resolved.elements[el.id], ctx))}
        </Canvas>
      </div>
    </div>
  );
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
