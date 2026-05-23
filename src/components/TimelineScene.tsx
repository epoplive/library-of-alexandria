import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Stage, type InteractiveSlot } from './Stage';
import { TimelinePlayer } from './TimelinePlayer';
import type {
  BeatOp,
  Layer,
  Layout,
  Mask,
  Scene,
} from '@/lib/scene-timeline';

/* ============================================================
   TimelineScene — bridges Stage + TimelinePlayer for a Scene
   with layers[].

   - Holds the layer override state (layout / mask / visibility).
   - Subscribes to TimelinePlayer.onApplyOp to translate beat ops
     into Stage state changes.
   - Forwards interactive layer refs and elements through so
     beat actions can dispatch to the right component.
   ============================================================ */

interface TimelineSceneProps {
  scene: Scene;
  /**
   * For scenes with interactive layers — React elements per layer_id.
   * The parent owns refs to those elements.
   */
  interactiveSlots?: Record<string, InteractiveSlot>;
  /**
   * Imperative refs per interactive layer_id. Beat `action` ops
   * dispatch onto the matching ref's methods.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interactiveRefs?: Record<string, RefObject<any>>;
  /** Asset resolver — passed through to Stage. */
  resolveAsset?: (asset_id: string) => string | undefined;
  /** speaker_id → voice_id for TTS routing. */
  voiceMap?: Record<string, string>;
  /** Aspect-ratio class for the stage container. Default 'aspect-video'. */
  stageClassName?: string;
  /** Default true. When false, player starts paused. */
  autoPlay?: boolean;
  /** Optional chrome below the stage (transcript, ledger, etc.). */
  children?: ReactNode;
}

export function TimelineScene({
  scene,
  interactiveSlots,
  interactiveRefs,
  resolveAsset,
  voiceMap,
  stageClassName = 'aspect-video',
  autoPlay = false,
  children,
}: TimelineSceneProps) {
  const layers: Layer[] = scene.layers ?? [];

  const [layoutOverrides, setLayoutOverrides] = useState<Record<string, Layout>>({});
  const [maskOverrides, setMaskOverrides] = useState<Record<string, Mask | null>>({});
  const [visibilityOverrides, setVisibilityOverrides] = useState<Record<string, boolean>>({});
  const transitionRef = useRef<Record<string, NonNullable<BeatOp & { transition?: unknown }>>>({});

  const onApplyOp = useCallback((op: BeatOp) => {
    if (op.kind === 'transform') {
      setLayoutOverrides((prev) => ({
        ...prev,
        [op.layer_id]: { ...(prev[op.layer_id] ?? {}), ...(op.layout ?? {}) },
      }));
      if (op.mask !== undefined) {
        setMaskOverrides((prev) => ({ ...prev, [op.layer_id]: op.mask ?? null }));
      }
    } else if (op.kind === 'visibility') {
      setVisibilityOverrides((prev) => ({ ...prev, [op.layer_id]: op.visible }));
    }
    // `action` ops are dispatched by TimelinePlayer onto interactiveRefs;
    // nothing for Stage to do here.
  }, []);

  const transitionOverrides = useMemo(() => {
    // The per-layer transition override map currently isn't being kept
    // separately — the Stage applies a sensible default ease curve.
    // This stub keeps the prop typed for future per-beat transition control.
    return {};
  }, [transitionRef]);

  // Default mode: Watch (timeline drives the scene). Could later add a
  // Play mode for interactive-heavy scenes.
  return (
    <div className="flex flex-col gap-4">
      <div className={`${stageClassName} w-full`}>
        <Stage
          layers={layers}
          interactiveSlots={interactiveSlots}
          resolveAsset={resolveAsset}
          layoutOverrides={layoutOverrides}
          maskOverrides={maskOverrides}
          visibilityOverrides={visibilityOverrides}
          transitionOverrides={transitionOverrides}
        />
      </div>
      <TimelinePlayer
        scene={scene}
        interactiveRefs={interactiveRefs}
        onApplyOp={onApplyOp}
        voiceMap={voiceMap}
        autoPlay={autoPlay}
      />
      {children}
    </div>
  );
}
