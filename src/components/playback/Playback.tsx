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
  CastId,
  Production,
  Shot,
  Cue,
  SlotRef,
  Take,
} from '@/lib/lattice';
import { selectTake } from '@/lib/lattice';
import type { ContentMap } from '@/lib/lesson-workflow/project-schema';
import { buildTimelineIndex, type TimelineIndex } from '@/lib/timeline-index';
import { Stage, type StageProps } from './Stage';
import { resolveSlot } from './asset-resolve';
import { Chrome } from './Chrome';

interface PlaybackProps {
  production: Production;
  manifest: AssetManifest;
  contentMap?: ContentMap;
  interactives?: StageProps['interactives'];
  interactiveRefs?: StageProps['interactiveRefs'];
  aspect?: StageProps['aspect'];
  /** Default true. */
  autoPlay?: boolean;
  /** Optional render-prop for chrome (replaces the default chrome). */
  chrome?: (state: PlaybackState, children: ReactNode) => ReactNode;
  className?: string;
}

export interface PlaybackState {
  shotIndex: number;
  totalShots: number;
  shotTime: number;
  shot: Shot | null;
  /** Active audio Take for the current Shot (carries timings for sync). */
  activeTake: Take | null;
  activeSpeakerCastId: CastId | null;
  activeSegment: PlaybackActiveSegment | null;
  characters: Production['characters'];
  /** Declared per-Shot durations across the whole Production. Drives the
   *  global scrubber. Falls back to 4s for silent shots without
   *  duration overrides. */
  shotDurations: number[];
  /** Segment durations for the active Shot. Empty for silent shots. */
  shotSegmentDurations: number[];
  timelineIndex: TimelineIndex;
  isPlaying: boolean;
  isFinished: boolean;
  /** True while VO audio is being fetched / decoded. */
  isPreparing: boolean;
  /** Player ops the chrome can call. */
  play: () => void;
  pause: () => void;
  restart: () => void;
  seekToShot: (i: number) => void;
  seekToShotSegment: (shotIdx: number, segmentIdx: number) => void;
  /** Drag-the-scrubber seek. Argument is seconds from the start of the
   *  Production. Resolves to a (shot, localTime) pair internally. */
  seekToTime: (globalSec: number) => void;
}

export type PlaybackSegmentKind = 'vo' | 'dialogue';

export interface PlaybackActiveSegment {
  kind: PlaybackSegmentKind;
  index: number;
  line: string;
  cast_id: CastId;
}

export interface PlaybackAudioSegment extends PlaybackActiveSegment {
  audio: SlotRef;
  duration: number;
}

interface OrderedSegmentInput extends PlaybackActiveSegment {
  audio: SlotRef;
  duration: number | null;
}

export interface ShotSegmentSeekTarget {
  shotIndex: number;
  shotTime: number;
  segmentIndex: number;
  segmentTime: number;
}

const DEFAULT_SILENT_SHOT_DURATION = 4;

export function playbackShotDuration(shot: Shot, manifest: AssetManifest): number {
  const inputs = orderedSegmentInputs(shot, manifest);
  if (inputs.length === 0) {
    if (shot.duration !== undefined) {
      return shot.duration;
    }
    return DEFAULT_SILENT_SHOT_DURATION;
  }

  const dialogue = shot.dialogue;
  const hasDialogue = dialogue !== undefined && dialogue.length > 0;
  if (!hasDialogue && shot.duration !== undefined) {
    return shot.duration;
  }

  const known = inputs.filter((segment) => segment.duration !== null);
  if (known.length === inputs.length) {
    return known.reduce((sum, segment) => {
      if (segment.duration === null) {
        throw new Error('playback.segment_duration.unreachable');
      }
      return sum + segment.duration;
    }, 0);
  }

  if (shot.duration !== undefined) {
    return shot.duration;
  }

  if (inputs.length === 1) {
    return DEFAULT_SILENT_SHOT_DURATION;
  }

  throw new Error(`playback.segment_duration.ambiguous: ${shot.id}`);
}

export function orderedPlaybackSegments(
  shot: Shot,
  manifest: AssetManifest,
  shotDuration: number,
): PlaybackAudioSegment[] {
  const inputs = orderedSegmentInputs(shot, manifest);
  const durations = materializeSegmentDurations(inputs, shotDuration, shot.id);
  return inputs.map((segment, index) => ({
    kind: segment.kind,
    index: segment.index,
    line: segment.line,
    cast_id: segment.cast_id,
    audio: segment.audio,
    duration: durations[index],
  }));
}

export function activeStateForPlaybackSegment(segment: PlaybackAudioSegment): {
  activeSpeakerCastId: CastId;
  activeSegment: PlaybackActiveSegment;
} {
  return {
    activeSpeakerCastId: segment.cast_id,
    activeSegment: {
      kind: segment.kind,
      index: segment.index,
      line: segment.line,
      cast_id: segment.cast_id,
    },
  };
}

export function seekTargetForShotSegment(
  shots: Shot[],
  manifest: AssetManifest,
  shotDurations: number[],
  shotIdx: number,
  segmentIdx: number,
): ShotSegmentSeekTarget {
  if (!Number.isInteger(shotIdx) || shotIdx < 0 || shotIdx >= shots.length) {
    throw new Error(`playback.seek.shot_out_of_bounds: ${shotIdx}`);
  }
  const shot = shots[shotIdx];
  const shotDuration = shotDurations[shotIdx];
  if (shotDuration === undefined) {
    throw new Error(`playback.seek.shot_duration_missing: ${shotIdx}`);
  }
  const segments = orderedPlaybackSegments(shot, manifest, shotDuration);
  if (!Number.isInteger(segmentIdx) || segmentIdx < 0 || segmentIdx >= segments.length) {
    throw new Error(`playback.seek.segment_out_of_bounds: ${shotIdx}.${segmentIdx}`);
  }
  let shotTime = 0;
  for (let i = 0; i < segmentIdx; i += 1) {
    shotTime += segments[i].duration;
  }
  return {
    shotIndex: shotIdx,
    shotTime,
    segmentIndex: segmentIdx,
    segmentTime: 0,
  };
}

export function seekTargetForShotTime(
  segments: PlaybackAudioSegment[],
  shotTime: number,
): Omit<ShotSegmentSeekTarget, 'shotIndex'> | null {
  if (segments.length === 0) {
    return null;
  }

  let elapsedBeforeSegment = 0;
  let remaining = Math.max(0, shotTime);
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (remaining < segment.duration || i === segments.length - 1) {
      const segmentTime = Math.min(remaining, segment.duration);
      return {
        shotTime: elapsedBeforeSegment + segmentTime,
        segmentIndex: i,
        segmentTime,
      };
    }
    elapsedBeforeSegment += segment.duration;
    remaining -= segment.duration;
  }
  throw new Error('playback.seek.unreachable');
}

function orderedSegmentInputs(shot: Shot, manifest: AssetManifest): OrderedSegmentInput[] {
  const segments: OrderedSegmentInput[] = [];
  const vo = shot.vo;
  if (vo !== undefined) {
    segments.push({
      kind: 'vo',
      index: 0,
      line: vo.line.text,
      cast_id: vo.cast_id,
      audio: vo.audio,
      duration: declaredSegmentDuration(vo, manifest),
    });
  }

  const dialogue = shot.dialogue;
  if (dialogue !== undefined) {
    for (let i = 0; i < dialogue.length; i += 1) {
      const segment = dialogue[i];
      segments.push({
        kind: 'dialogue',
        index: segments.length,
        line: segment.line.text,
        cast_id: segment.cast_id,
        audio: segment.audio,
        duration: declaredSegmentDuration(segment, manifest),
      });
    }
  }
  return segments;
}

function declaredSegmentDuration(
  segment: { duration_override?: number; audio: SlotRef },
  manifest: AssetManifest,
): number | null {
  if (segment.duration_override !== undefined) {
    if (segment.duration_override < 0) {
      throw new Error(`playback.segment_duration.negative: ${segment.audio.slot_id}`);
    }
    return segment.duration_override;
  }

  const slot = manifest.slots[segment.audio.slot_id];
  if (slot === undefined) {
    return null;
  }
  const take = selectTake(slot);
  if (take === null) {
    return null;
  }
  return durationFromTakeTimings(take);
}

function durationFromTakeTimings(take: Take): number | null {
  const timings = take.timings;
  if (timings === undefined || timings.length === 0) {
    return null;
  }

  let endMs = 0;
  for (const timing of timings) {
    const timingEnd = timing.startMs + timing.durationMs;
    if (timingEnd > endMs) {
      endMs = timingEnd;
    }
  }
  return endMs / 1000;
}

function materializeSegmentDurations(
  segments: OrderedSegmentInput[],
  shotDuration: number,
  shotId: string,
): number[] {
  if (segments.length === 0) {
    return [];
  }
  if (segments.length === 1) {
    return [shotDuration];
  }

  const durations: number[] = [];
  const unknownIndexes: number[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const duration = segments[i].duration;
    if (duration === null) {
      durations.push(0);
      unknownIndexes.push(i);
    } else {
      durations.push(duration);
    }
  }

  if (unknownIndexes.length === 0) {
    return durations;
  }

  if (unknownIndexes.length === 1) {
    const knownTotal = durations.reduce((sum, duration) => sum + duration, 0);
    const residual = shotDuration - knownTotal;
    if (residual < 0) {
      throw new Error(`playback.segment_duration.exceeds_shot: ${shotId}`);
    }
    durations[unknownIndexes[0]] = residual;
    return durations;
  }

  throw new Error(`playback.segment_duration.ambiguous: ${shotId}`);
}

export function Playback({
  production,
  manifest,
  contentMap,
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
      allShots.map((s) => playbackShotDuration(s, manifest)),
    [allShots, manifest],
  );
  const timelineIndex = useMemo(
    () => buildTimelineIndex(production, shotDurations, contentMap),
    [production, shotDurations, contentMap],
  );

  const [shotIndex, setShotIndex] = useState(0);
  const [shotTime, setShotTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [activeTake, setActiveTake] = useState<Take | null>(null);
  const [activeSpeakerCastId, setActiveSpeakerCastId] = useState<CastId | null>(null);
  const [activeSegment, setActiveSegment] = useState<PlaybackActiveSegment | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedActionsRef = useRef<Set<string>>(new Set());

  const isFinished = shotIndex >= allShots.length;
  const shot = !isFinished ? allShots[shotIndex] : null;
  const shotSegmentDurations = useMemo(() => {
    if (shot === null) {
      return [];
    }
    const shotDuration = shotDurations[shotIndex];
    if (shotDuration === undefined) {
      throw new Error(`playback.shot_duration_missing: ${shotIndex}`);
    }
    return orderedPlaybackSegments(shot, manifest, shotDuration).map((segment) => segment.duration);
  }, [shot, manifest, shotDurations, shotIndex]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const playShot = useCallback(
    (idx: number, startAt = 0) => {
      stopAudio();
      firedActionsRef.current = new Set();
      setShotIndex(idx);
      setShotTime(startAt);
      setActiveTake(null);
      setActiveSpeakerCastId(null);
      setActiveSegment(null);
      setIsPreparing(false);
      if (idx >= allShots.length) {
        setIsPlaying(false);
        return;
      }
      const next = allShots[idx];
      const shotDuration = shotDurations[idx];
      if (shotDuration === undefined) {
        throw new Error(`playback.shot_duration_missing: ${idx}`);
      }
      const segments = orderedPlaybackSegments(next, manifest, shotDuration);
      const segmentTarget = seekTargetForShotTime(segments, startAt);
      if (segmentTarget === null) {
        setIsPlaying(true);
        const dur = (shotDuration - startAt) * 1000;
        timeoutRef.current = setTimeout(() => playShot(idx + 1), Math.max(0, dur));
        return;
      }

      const segmentStartTime = (segmentIdx: number): number => {
        let elapsed = 0;
        for (let i = 0; i < segmentIdx; i += 1) {
          elapsed += segments[i].duration;
        }
        return elapsed;
      };

      const playSegment = (segmentIdx: number, segmentStartAt: number): void => {
        const segment = segments[segmentIdx];
        if (segment === undefined) {
          throw new Error(`playback.segment_missing: ${idx}.${segmentIdx}`);
        }
        const segmentStart = segmentStartTime(segmentIdx);
        setShotTime(segmentStart + segmentStartAt);
        const activeState = activeStateForPlaybackSegment(segment);
        setActiveSpeakerCastId(activeState.activeSpeakerCastId);
        setActiveSegment(activeState.activeSegment);

        const resolved = resolveSlot(segment.audio, manifest);
        if (resolved.url === null) {
          throw new Error(`playback.segment.audio.unresolved: ${segment.audio.slot_id}`);
        }
        setActiveTake(resolved.take);
        setIsPreparing(true);

        const audio = new Audio(resolved.url);
        audioRef.current = audio;
        audio.addEventListener('loadedmetadata', () => {
          setIsPreparing(false);
          if (segmentStartAt > 0) {
            audio.currentTime = segmentStartAt;
          }
        });
        audio.addEventListener('timeupdate', () => setShotTime(segmentStart + audio.currentTime));
        audio.addEventListener('ended', () => {
          setShotTime(segmentStart + segment.duration);
          setActiveTake(null);
          setActiveSpeakerCastId(null);
          setActiveSegment(null);
          if (segmentIdx + 1 < segments.length) {
            playSegment(segmentIdx + 1, 0);
            return;
          }
          playShot(idx + 1);
        });
        audio.addEventListener('error', () => {
          setIsPreparing(false);
          throw new Error(`playback.segment.audio.error: ${segment.audio.slot_id}`);
        });
        audio.play().then(
          () => setIsPlaying(true),
          () => setIsPlaying(false),
        );
      };

      playSegment(segmentTarget.segmentIndex, segmentTarget.segmentTime);
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

  const seekToShotSegment = useCallback(
    (shotIdx: number, segmentIdx: number) => {
      const target = seekTargetForShotSegment(
        allShots,
        manifest,
        shotDurations,
        shotIdx,
        segmentIdx,
      );
      playShot(target.shotIndex, target.shotTime);
    },
    [allShots, manifest, playShot, shotDurations],
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
    activeSpeakerCastId,
    activeSegment,
    characters: production.characters,
    shotDurations,
    shotSegmentDurations,
    timelineIndex,
    isPlaying,
    isFinished,
    isPreparing,
    play,
    pause,
    restart,
    seekToShot,
    seekToShotSegment,
    seekToTime,
  };

  const stage = (
    <Stage
      production={production}
      manifest={manifest}
      shotIndex={shotIndex}
      shotTime={shotTime}
      activeSpeakerCastId={activeSpeakerCastId}
      interactives={interactives}
      interactiveRefs={interactiveRefs}
      aspect={aspect ?? production.default_aspect ?? '16:9'}
      onActions={handleActions}
    />
  );

  return (
    <div className={`h-full ${className}`}>
      {chrome ? chrome(state, stage) : <Chrome state={state}>{stage}</Chrome>}
    </div>
  );
}
