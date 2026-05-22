import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { isCached, synthesize } from '@/lib/tts';
import type {
  Beat,
  Scene,
  InteractiveAction,
  BeatOp,
} from '@/lib/scene-timeline';

/* ============================================================
   TimelinePlayer — drives a scene's beats against a clock.

   Two clock sources, picked automatically:
   - VIDEO clock: when scene has a backing video element, beats fire
     when video.currentTime crosses each beat.at.
   - SEQUENCE clock: no video, beats play sequentially — narration
     synthesizes via TTS (or pre-rendered audio), each beat's action
     fires at the start, advance when audio ends.

   The interactive component is driven via an imperative ref the
   parent supplies (`interactiveRef`). Actions in beats are dispatched
   onto that ref's method names.

   The current MVP is the SEQUENCE clock. Video-backed mode lands
   later when we have a video asset.
   ============================================================ */

export interface TimelinePlayerHandle {
  play: () => void;
  pause: () => void;
  seekToBeat: (beatId: string) => void;
  reset: () => void;
}

interface TimelinePlayerProps {
  scene: Scene;
  /**
   * Imperative ref to the LEGACY single-interactive component. Used by
   * `beat.action` (single-action shortcut). For multi-layer scenes use
   * `interactiveRefs` keyed by layer_id and `onApplyOp` instead.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interactiveRef?: RefObject<any>;
  /**
   * Refs for multi-layer scenes — keyed by layer_id. Action ops dispatch
   * onto the matching ref.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interactiveRefs?: Record<string, RefObject<any>>;
  /**
   * Hook the Stage uses to apply transform/visibility ops. Called for
   * every non-action beat op at the moment it fires.
   */
  onApplyOp?: (op: BeatOp) => void;
  /** What to render for the transcript / chrome. */
  children?: (state: PlayerState) => ReactNode;
  /** Default false. When true, user controls the interactive instead of being driven. */
  userMode?: boolean;
  /** Default true. When false, scene loads paused. */
  autoPlay?: boolean;
  /** speaker_id → voice_id. Looked up per beat when synthesizing. */
  voiceMap?: Record<string, string>;
}

export interface PlayerState {
  /** Index of the current beat being played, or -1 if not started. */
  beatIdx: number;
  /** Total beats. */
  totalBeats: number;
  /** True when audio is playing. */
  isPlaying: boolean;
  /** True when scene has finished. */
  isFinished: boolean;
  /** True when waiting for TTS to synthesize the current beat. */
  isPreparing: boolean;
}

export function TimelinePlayer({
  scene,
  interactiveRef,
  interactiveRefs,
  onApplyOp,
  children,
  userMode = false,
  autoPlay = false,
  voiceMap,
}: TimelinePlayerProps) {
  const [beatIdx, setBeatIdx] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPreparing, setIsPreparing] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Stable ref so the play() closure always sees the right beat
  const currentIdxRef = useRef(beatIdx);
  currentIdxRef.current = beatIdx;

  const beats = scene.beats;
  const isFinished = beatIdx >= 0 && beatIdx >= beats.length;

  // Fire an action onto the legacy single-interactive ref
  const dispatch = useCallback(
    (action: InteractiveAction) => {
      const r = interactiveRef?.current;
      if (!r) return;
      const method = r[action.method];
      if (typeof method !== 'function') {
        console.warn(`TimelinePlayer: ${action.method} not on ref`);
        return;
      }
      try {
        method.apply(r, action.args ?? []);
      } catch (e) {
        console.error(`TimelinePlayer: ${action.method} threw`, e);
      }
    },
    [interactiveRef],
  );

  // Apply a beat op — action ops dispatch onto the matching layer ref;
  // transform/visibility ops are forwarded to the Stage via onApplyOp.
  const applyOp = useCallback(
    (op: BeatOp) => {
      if (op.kind === 'action') {
        const r = interactiveRefs?.[op.layer_id]?.current;
        if (!r) {
          console.warn(`TimelinePlayer: no ref for layer ${op.layer_id}`);
          return;
        }
        const method = r[op.method];
        if (typeof method !== 'function') {
          console.warn(`TimelinePlayer: ${op.method} not on layer ${op.layer_id}`);
          return;
        }
        try {
          method.apply(r, op.args ?? []);
        } catch (e) {
          console.error(`TimelinePlayer: ${op.method} threw`, e);
        }
        return;
      }
      onApplyOp?.(op);
    },
    [interactiveRefs, onApplyOp],
  );

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }, []);

  const playBeat = useCallback(
    async (idx: number) => {
      if (idx >= beats.length) {
        setIsPlaying(false);
        return;
      }
      const beat = beats[idx];
      setBeatIdx(idx);
      // Fire all beat ops at beat start (before narration audio)
      if (beat.action) dispatch(beat.action);
      if (beat.ops) for (const op of beat.ops) applyOp(op);
      // Play narration (or skip if none)
      if (!beat.narration || userMode) {
        // No audio — wait beat.duration (or 2s default) then advance
        const ms = (beat.duration ?? 2) * 1000;
        const waitId = setTimeout(() => {
          if (currentIdxRef.current === idx) playBeat(idx + 1);
        }, ms);
        return () => clearTimeout(waitId);
      }
      const voice = beat.speaker_id ? voiceMap?.[beat.speaker_id] : undefined;
      try {
        setIsPreparing(!isCached(beat.narration, voice));
        const url = await synthesize(beat.narration, voice);
        setIsPreparing(false);
        if (currentIdxRef.current !== idx) return; // user moved on
        stopAudio();
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.addEventListener('ended', () => {
          if (currentIdxRef.current === idx) playBeat(idx + 1);
        });
        audio.addEventListener('error', () => {
          if (currentIdxRef.current === idx) playBeat(idx + 1);
        });
        await audio.play().catch(() => {
          /* user gesture not granted; surface via state */
          setIsPlaying(false);
        });
      } catch {
        setIsPreparing(false);
        if (currentIdxRef.current === idx) playBeat(idx + 1);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [beats, dispatch, applyOp, stopAudio, userMode, voiceMap],
  );

  const play = useCallback(() => {
    if (userMode) return;
    if (isFinished) {
      // Restart from the top
      stopAudio();
      setBeatIdx(-1);
      setIsPlaying(true);
      playBeat(0);
      return;
    }
    if (audioRef.current) {
      audioRef.current.play().catch(() => undefined);
      setIsPlaying(true);
      return;
    }
    setIsPlaying(true);
    playBeat(beatIdx < 0 ? 0 : beatIdx);
  }, [isFinished, beatIdx, playBeat, stopAudio, userMode]);

  const pause = useCallback(() => {
    if (audioRef.current) audioRef.current.pause();
    setIsPlaying(false);
  }, []);

  const reset = useCallback(() => {
    stopAudio();
    setBeatIdx(-1);
    setIsPlaying(false);
    setIsPreparing(false);
  }, [stopAudio]);

  // Auto-play on mount when requested
  useEffect(() => {
    if (autoPlay && !userMode) play();
    return () => stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop audio + reset when the scene id changes (user navigates between scenes)
  useEffect(() => {
    reset();
    if (autoPlay && !userMode) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, userMode]);

  const state: PlayerState = {
    beatIdx,
    totalBeats: beats.length,
    isPlaying,
    isFinished,
    isPreparing,
  };

  // The chrome UI (transport bar, beat dots) is rendered by the parent via children
  return (
    <>
      <TimelineControls
        state={state}
        beats={beats}
        userMode={userMode}
        onPlay={play}
        onPause={pause}
        onReset={reset}
        onSeek={(i) => {
          stopAudio();
          playBeat(i);
        }}
      />
      {children?.(state)}
    </>
  );
}

function TimelineControls({
  state,
  beats,
  userMode,
  onPlay,
  onPause,
  onReset,
  onSeek,
}: {
  state: PlayerState;
  beats: Beat[];
  userMode: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onSeek: (i: number) => void;
}) {
  if (userMode) return null;
  const { isPlaying, isPreparing, isFinished, beatIdx } = state;
  const currentBeat = beatIdx >= 0 && beatIdx < beats.length ? beats[beatIdx] : null;

  return (
    <div className="flex items-center gap-3 bg-paper-card border border-ink-subtle/15 rounded-full pl-1.5 pr-4 py-1.5 shadow-card min-w-[260px] max-w-[460px]">
      <button
        type="button"
        onClick={isPlaying ? onPause : onPlay}
        disabled={isPreparing}
        className="w-9 h-9 rounded-full bg-accent text-paper flex items-center justify-center hover:bg-accent-hover transition shrink-0 disabled:opacity-60"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPreparing ? (
          <motion.svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          >
            <path d="M21 12a9 9 0 1 1-6.2-8.5" />
          </motion.svg>
        ) : isPlaying ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="2" y="1" width="3" height="10" rx="0.5" />
            <rect x="7" y="1" width="3" height="10" rx="0.5" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2 1 L10 6 L2 11 Z" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted truncate">
            {isPreparing
              ? 'Synthesizing…'
              : isFinished
                ? 'Scene complete'
                : currentBeat?.id
                  ? `Beat ${beatIdx + 1}/${beats.length}`
                  : 'Demo'}
          </p>
        </div>
        <div className="flex gap-[3px]">
          {beats.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onSeek(i)}
              aria-label={`Jump to beat ${i + 1}`}
              className={`h-1 flex-1 rounded-full transition ${
                i === beatIdx
                  ? 'bg-accent'
                  : i < beatIdx
                    ? 'bg-accent/40 hover:bg-accent/60'
                    : 'bg-ink-subtle/15 hover:bg-ink-subtle/30'
              }`}
            />
          ))}
        </div>
      </div>

      {isFinished && (
        <button
          type="button"
          onClick={onReset}
          aria-label="Restart scene"
          className="text-ink-subtle hover:text-ink shrink-0"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M1 4v6h6" />
            <path d="M3.5 15a9 9 0 1 0 2.5-9.5L1 10" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ============================================================
   Hook variant — for cases where the controls UI is custom.
   ============================================================ */

interface UseTimelineArgs {
  scene: Scene;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interactiveRef: RefObject<any>;
  userMode?: boolean;
}

export function useTimeline({ scene, interactiveRef, userMode = false }: UseTimelineArgs) {
  const ref = useRef<TimelinePlayerHandle>(null);
  useImperativeHandle(ref, () => ({
    play: () => undefined,
    pause: () => undefined,
    seekToBeat: () => undefined,
    reset: () => undefined,
  }));
  return useMemo(
    () => ({
      element: (
        <TimelinePlayer
          scene={scene}
          interactiveRef={interactiveRef}
          userMode={userMode}
        />
      ),
      handle: ref,
    }),
    [scene, interactiveRef, userMode],
  );
}
