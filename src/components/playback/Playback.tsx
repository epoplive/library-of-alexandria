/* ============================================================
   Playback — owns the playhead for a Production.

   Drives a Production's Shots sequentially:
     - resolves each Shot's VO Take URL from the AssetManifest
     - plays the audio, advances on 'ended'
     - tracks shotIndex + shotTime (audio currentTime)
     - dispatches action Cues onto interactive refs as they fire
     - renders <Stage> with the current (shotIndex, shotTime)
     - exposes Play / Pause / Restart controls

   Audio is per-Shot, never concatenated. The viewer never
   synthesizes — Takes are pre-rendered server-side and committed
   to the AssetManifest.
   ============================================================ */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AssetManifest,
  Production,
  Shot,
  Cue,
} from '@/lib/lattice';
import { Stage, type StageProps } from './Stage';
import { resolveSlot } from './asset-resolve';

interface PlaybackProps {
  production: Production;
  manifest: AssetManifest;
  interactives?: StageProps['interactives'];
  interactiveRefs?: StageProps['interactiveRefs'];
  aspect?: StageProps['aspect'];
  /** Default true. */
  autoPlay?: boolean;
  /** Optional render-prop for chrome (play/pause button, transcript). */
  chrome?: (state: PlaybackState) => ReactNode;
  className?: string;
}

export interface PlaybackState {
  shotIndex: number;
  totalShots: number;
  shotTime: number;
  shot: Shot | null;
  isPlaying: boolean;
  isFinished: boolean;
  /** True while VO audio is being fetched / decoded. */
  isPreparing: boolean;
  /** Player ops the chrome can call. */
  play: () => void;
  pause: () => void;
  restart: () => void;
  seekToShot: (i: number) => void;
}

export function Playback({
  production,
  manifest,
  interactives,
  interactiveRefs,
  aspect,
  autoPlay = true,
  chrome,
  className = '',
}: PlaybackProps) {
  const allShots: Shot[] = production.scenes.flatMap((s) => s.shots);
  const [shotIndex, setShotIndex] = useState(0);
  const [shotTime, setShotTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const firedActionsRef = useRef<Set<string>>(new Set());

  const isFinished = shotIndex >= allShots.length;
  const shot = !isFinished ? allShots[shotIndex] : null;

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const playShot = useCallback(
    (idx: number) => {
      stopAudio();
      firedActionsRef.current = new Set();
      setShotIndex(idx);
      setShotTime(0);
      if (idx >= allShots.length) {
        setIsPlaying(false);
        return;
      }
      const next = allShots[idx];
      if (!next.vo) {
        // Silent shot — use duration override or 4s default; advance on timer
        setIsPlaying(true);
        const dur = (next.duration ?? 4) * 1000;
        const t = setTimeout(() => playShot(idx + 1), dur);
        return () => clearTimeout(t);
      }
      const resolved = resolveSlot(next.vo.audio, manifest);
      if (!resolved.url) {
        // No Take ready — wait the duration override then advance
        setIsPlaying(true);
        const dur = (next.duration ?? next.vo.duration_override ?? 4) * 1000;
        const t = setTimeout(() => playShot(idx + 1), dur);
        return () => clearTimeout(t);
      }
      setIsPreparing(true);
      const audio = new Audio(resolved.url);
      audioRef.current = audio;
      audio.addEventListener('loadedmetadata', () => setIsPreparing(false));
      audio.addEventListener('timeupdate', () => setShotTime(audio.currentTime));
      audio.addEventListener('ended', () => {
        setShotTime(audio.duration);
        playShot(idx + 1);
      });
      audio.addEventListener('error', () => {
        setIsPreparing(false);
        playShot(idx + 1);
      });
      audio.play().then(
        () => setIsPlaying(true),
        () => setIsPlaying(false),
      );
    },
    [allShots, manifest, stopAudio],
  );

  const play = useCallback(() => {
    if (isPlaying) return;
    if (isFinished) {
      playShot(0);
      return;
    }
    if (audioRef.current) {
      audioRef.current.play().catch(() => undefined);
      setIsPlaying(true);
      return;
    }
    playShot(shotIndex);
  }, [isFinished, isPlaying, playShot, shotIndex]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const restart = useCallback(() => {
    stopAudio();
    playShot(0);
  }, [playShot, stopAudio]);

  const seekToShot = useCallback(
    (i: number) => {
      playShot(Math.max(0, Math.min(allShots.length - 1, i)));
    },
    [allShots.length, playShot],
  );

  // Auto-play once on mount when the audio context is allowed
  useEffect(() => {
    if (autoPlay) playShot(0);
    return () => stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dispatch action cues as they cross the playhead
  const handleActions = useCallback(
    (actions: Array<Extract<Cue, { kind: 'action' }>>) => {
      for (const a of actions) {
        const key = `${shotIndex}:${a.id ?? `${a.element_id}.${a.method}@${a.at ?? 0}`}`;
        if (firedActionsRef.current.has(key)) continue;
        firedActionsRef.current.add(key);
        const ref = interactiveRefs?.[a.element_id];
        const handle = ref?.current as Record<string, unknown> | null;
        const fn = handle?.[a.method];
        if (typeof fn === 'function') {
          try {
            (fn as (...args: unknown[]) => unknown).apply(handle, a.args ?? []);
          } catch (e) {
            console.error('action cue dispatch failed', a, e);
          }
        }
      }
    },
    [shotIndex, interactiveRefs],
  );

  const state: PlaybackState = {
    shotIndex,
    totalShots: allShots.length,
    shotTime,
    shot,
    isPlaying,
    isFinished,
    isPreparing,
    play,
    pause,
    restart,
    seekToShot,
  };

  return (
    <div className={`flex flex-col gap-3 h-full ${className}`}>
      <div className="flex-1 min-h-0">
        <Stage
          production={production}
          manifest={manifest}
          shotIndex={shotIndex}
          shotTime={shotTime}
          interactives={interactives}
          interactiveRefs={interactiveRefs}
          aspect={aspect ?? production.default_aspect ?? '16:9'}
          onActions={handleActions}
        />
      </div>
      {chrome ? chrome(state) : <DefaultControls state={state} />}
    </div>
  );
}

function DefaultControls({ state }: { state: PlaybackState }) {
  return (
    <div className="flex items-center gap-3 bg-paper-card border border-ink-subtle/15 rounded-full pl-1.5 pr-4 py-1.5 shadow-card w-fit mx-auto">
      <button
        type="button"
        onClick={() => (state.isPlaying ? state.pause() : state.play())}
        className="w-9 h-9 rounded-full bg-accent text-paper flex items-center justify-center hover:bg-accent-hover transition shrink-0"
        aria-label={state.isPlaying ? 'Pause' : 'Play'}
      >
        {state.isPlaying ? (
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
      <div className="flex gap-1">
        {Array.from({ length: state.totalShots }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => state.seekToShot(i)}
            aria-label={`Shot ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              i === state.shotIndex
                ? 'w-6 bg-accent'
                : i < state.shotIndex
                  ? 'w-3 bg-accent/40 hover:bg-accent/60'
                  : 'w-3 bg-ink-subtle/20 hover:bg-ink-subtle/40'
            }`}
          />
        ))}
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle tabular-nums">
        {state.isPreparing ? 'preparing' : state.isFinished ? 'done' : `shot ${state.shotIndex + 1}/${state.totalShots}`}
      </p>
    </div>
  );
}
