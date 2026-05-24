/* ============================================================
   Playback — owns the playhead for a Production.

   Drives a Production's Shots sequentially:
     - resolves each Shot's VO Take URL from the AssetManifest
     - plays the audio, advances on 'ended'
     - tracks shotIndex + shotTime (audio currentTime)
     - dispatches action Cues onto interactive refs as they fire
     - renders <Stage> with the current (shotIndex, shotTime)
     - exposes Play / Pause / Restart controls + a Production-wide
       seek (drag the scrubber across Scene boundaries)

   Audio is per-Shot, never concatenated. The viewer never
   synthesizes — Takes are pre-rendered server-side and committed
   to the AssetManifest. The chrome reads each Take's `timings`
   off the AssetManifest to drive transcript highlight.
   ============================================================ */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AssetManifest,
  Production,
  Shot,
  Cue,
  Take,
} from '@/lib/lattice';
import { Stage, type StageProps } from './Stage';
import { resolveSlot } from './asset-resolve';
import { Chrome } from './Chrome';

interface PlaybackProps {
  production: Production;
  manifest: AssetManifest;
  interactives?: StageProps['interactives'];
  interactiveRefs?: StageProps['interactiveRefs'];
  aspect?: StageProps['aspect'];
  /** Default true. */
  autoPlay?: boolean;
  /** Optional render-prop for chrome (replaces the default chrome). */
  chrome?: (state: PlaybackState) => ReactNode;
  className?: string;
}

export interface PlaybackState {
  shotIndex: number;
  totalShots: number;
  shotTime: number;
  shot: Shot | null;
  /** Active audio Take for the current Shot (carries timings for sync). */
  activeTake: Take | null;
  /** Declared per-Shot durations across the whole Production. Drives the
   *  global scrubber. Falls back to 4s for silent shots without
   *  duration overrides. */
  shotDurations: number[];
  isPlaying: boolean;
  isFinished: boolean;
  /** True while VO audio is being fetched / decoded. */
  isPreparing: boolean;
  /** Player ops the chrome can call. */
  play: () => void;
  pause: () => void;
  restart: () => void;
  seekToShot: (i: number) => void;
  /** Drag-the-scrubber seek. Argument is seconds from the start of the
   *  Production. Resolves to a (shot, localTime) pair internally. */
  seekToTime: (globalSec: number) => void;
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
  const allShots: Shot[] = useMemo(
    () => production.scenes.flatMap((s) => s.shots),
    [production],
  );
  const shotDurations: number[] = useMemo(
    () =>
      allShots.map((s) => s.duration ?? s.vo?.duration_override ?? 4),
    [allShots],
  );

  const [shotIndex, setShotIndex] = useState(0);
  const [shotTime, setShotTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [activeTake, setActiveTake] = useState<Take | null>(null);
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
    (idx: number, startAt = 0) => {
      stopAudio();
      firedActionsRef.current = new Set();
      setShotIndex(idx);
      setShotTime(startAt);
      setActiveTake(null);
      if (idx >= allShots.length) {
        setIsPlaying(false);
        return;
      }
      const next = allShots[idx];
      if (!next.vo) {
        setIsPlaying(true);
        const dur = (shotDurations[idx] - startAt) * 1000;
        const t = setTimeout(() => playShot(idx + 1), Math.max(0, dur));
        return () => clearTimeout(t);
      }
      const resolved = resolveSlot(next.vo.audio, manifest);
      if (!resolved.url) {
        setIsPlaying(true);
        const dur = (shotDurations[idx] - startAt) * 1000;
        const t = setTimeout(() => playShot(idx + 1), Math.max(0, dur));
        return () => clearTimeout(t);
      }
      setActiveTake(resolved.take);
      setIsPreparing(true);
      const audio = new Audio(resolved.url);
      audioRef.current = audio;
      audio.addEventListener('loadedmetadata', () => {
        setIsPreparing(false);
        if (startAt > 0) audio.currentTime = startAt;
      });
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
    [allShots, manifest, shotDurations, stopAudio],
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

  const seekToTime = useCallback(
    (globalSec: number) => {
      let remaining = Math.max(0, globalSec);
      for (let i = 0; i < shotDurations.length; i++) {
        if (remaining < shotDurations[i] || i === shotDurations.length - 1) {
          playShot(i, Math.min(remaining, shotDurations[i]));
          return;
        }
        remaining -= shotDurations[i];
      }
    },
    [playShot, shotDurations],
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
    activeTake,
    shotDurations,
    isPlaying,
    isFinished,
    isPreparing,
    play,
    pause,
    restart,
    seekToShot,
    seekToTime,
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
      {chrome ? chrome(state) : <Chrome state={state} />}
    </div>
  );
}
