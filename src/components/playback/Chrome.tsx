/* ============================================================
   Chrome — the one player UI for the lattice.

   Reads PlaybackState and renders:
     - Stage slot owned by the chrome layout
     - localStorage-backed narration mode toggle: teleprompter panel or subtitle overlay
     - Production-wide hierarchical scrubber driven by TimelineIndex
     - play / pause toggle + state readout

   Designed to be the only player chrome the lesson uses.
   Section.tsx / TimelinePlayer / NarrationPlayer all retire to this.
   ============================================================ */

import {
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ShotId } from '@/lib/lattice';
import {
  sentenceIndexFromTimings,
  splitSentences,
} from '@/lib/narration-context';
import {
  actSpansAsPct,
  keyframeMarkersAsPct,
  sceneTicksAsPct,
  scrubberPctForTime,
  scrubberTimeForPct,
  shotTicksAsPct,
} from '@/lib/scrubber-geometry';
import type {
  ActSpan,
  KeyframeMarker,
  SceneSpan,
  ShotSpan,
  TimelineIndex,
} from '@/lib/timeline-index';
import type { PlaybackState } from './Playback';

export type NarrationMode = 'teleprompter' | 'subtitle';

const NARRATION_MODE_KEY = 'loa.chrome.narration_mode';

export function Chrome({ state, children }: { state: PlaybackState; children: ReactNode }) {
  const [narrationMode, setNarrationMode] = useState<NarrationMode>(readNarrationMode);
  const lineText = transcriptLineText(state);
  const sentences = useMemo(() => splitSentences(lineText), [lineText]);
  const activeTake = state.activeTake;
  const timings = activeTake === null || activeTake.timings === undefined
    ? null
    : activeTake.timings;
  const speaker_label = speakerLabelForShot(state);

  // Sentence-level highlight. shotTime is in seconds; timings use ms.
  // sentenceIndexFromTimings expects (currentTimeSec, progress, sentences, timings).
  const declaredShotDuration = state.shotDurations[state.shotIndex];
  const shotDuration = declaredShotDuration === undefined ? 0 : declaredShotDuration;
  const progress = shotDuration > 0 ? state.shotTime / shotDuration : 0;
  const activeSentenceIdx = useMemo(
    () =>
      state.isPlaying || progress > 0
        ? sentenceIndexFromTimings(state.shotTime, progress, sentences, timings)
        : -1,
    [state.shotTime, state.isPlaying, progress, sentences, timings],
  );

  const activeSentenceDisplayIdx = activeSentenceIdx >= 0 ? activeSentenceIdx : 0;
  const activeSentence = sentences[activeSentenceDisplayIdx];
  const subtitleSentence = activeSentence === undefined ? null : activeSentence;
  const currentShotSpan = state.timelineIndex.shots[state.shotIndex];
  const currentGlobalSec = currentShotSpan === undefined
    ? state.timelineIndex.total_duration_s
    : currentShotSpan.start_s + state.shotTime;

  const setMode = (mode: NarrationMode): void => {
    setNarrationMode(mode);
    writeNarrationMode(mode);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="relative flex-1 min-h-0">
        {children}
        {narrationMode === 'subtitle' && (
          <SubtitleOverlay
            sentence={subtitleSentence}
            sentenceKey={`${state.shotIndex}:${activeSentenceDisplayIdx}:${subtitleSentence}`}
            speaker_label={speaker_label}
          />
        )}
      </div>
      <div className="flex flex-col gap-3 px-3 md:px-5 pb-3">
        <NarrationModeToggle mode={narrationMode} onChange={setMode} />
        {narrationMode === 'teleprompter' && (
          <TranscriptPanel
            sentences={sentences}
            activeIdx={activeSentenceIdx}
            speaker_label={speaker_label}
          />
        )}
        <HierarchicalScrubber
          timelineIndex={state.timelineIndex}
          currentSec={currentGlobalSec}
          currentShotIndex={state.shotIndex}
          onSeek={state.seekToTime}
        />
        <Controls
          state={state}
          currentSec={currentGlobalSec}
          totalSec={state.timelineIndex.total_duration_s}
        />
      </div>
    </div>
  );
}

export function readNarrationMode(): NarrationMode {
  if (typeof window === 'undefined') return 'teleprompter';
  const raw = window.localStorage.getItem(NARRATION_MODE_KEY);
  if (raw === 'subtitle' || raw === 'teleprompter') return raw;
  return 'teleprompter';
}

export function writeNarrationMode(mode: NarrationMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NARRATION_MODE_KEY, mode);
}

interface NarrationModeToggleProps {
  mode: NarrationMode;
  onChange: (mode: NarrationMode) => void;
}

function NarrationModeToggle({ mode, onChange }: NarrationModeToggleProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div
        className="inline-flex rounded-lg border border-ink-subtle/15 bg-paper-card p-0.5 shadow-sm"
        role="group"
        aria-label="Narration mode"
      >
        <button
          type="button"
          aria-pressed={mode === 'teleprompter'}
          onClick={() => onChange('teleprompter')}
          className={modeButtonClass(mode === 'teleprompter')}
        >
          Teleprompter
        </button>
        <button
          type="button"
          aria-pressed={mode === 'subtitle'}
          onClick={() => onChange('subtitle')}
          className={modeButtonClass(mode === 'subtitle')}
        >
          Subtitle
        </button>
      </div>
    </div>
  );
}

function modeButtonClass(active: boolean): string {
  const base = 'px-3 py-1.5 rounded-md font-mono text-[10px] uppercase tracking-[0.18em] transition';
  if (active) {
    return `${base} bg-ink text-paper shadow-sm`;
  }
  return `${base} text-ink-subtle hover:text-ink hover:bg-paper-tint`;
}

interface SubtitleOverlayProps {
  sentence: string | null;
  sentenceKey: string;
  speaker_label: string | null;
}

function SubtitleOverlay({ sentence, sentenceKey, speaker_label }: SubtitleOverlayProps) {
  return (
    <div className="chrome-subtitle pointer-events-none absolute bottom-[6%] left-[6%] right-[6%] z-20 flex justify-center">
      <AnimatePresence mode="wait">
        {sentence !== null && (
          <motion.div
            key={sentenceKey}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="max-w-4xl rounded-lg bg-ink/80 px-4 py-3 text-center text-paper shadow-xl backdrop-blur-sm"
          >
            <p className="text-base md:text-lg leading-[1.55] font-medium">
              {speaker_label === null ? sentence : (
                <>
                  <span className="font-semibold">{speaker_label}: </span>
                  {sentence}
                </>
              )}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface TranscriptPanelProps {
  sentences: string[];
  activeIdx: number;
  speaker_label: string | null;
}

function TranscriptPanel({ sentences, activeIdx, speaker_label }: TranscriptPanelProps) {
  if (sentences.length === 0) return null;
  const inFocus = activeIdx >= 0 ? activeIdx : 0;
  const prev = inFocus > 0 ? sentences[inFocus - 1] : null;
  const current = sentences[inFocus];
  const next = inFocus + 1 < sentences.length ? sentences[inFocus + 1] : null;

  return (
    <div className="bg-paper-card border border-ink-subtle/10 rounded-2xl shadow-card overflow-hidden">
      <div className="px-6 py-4 flex flex-col gap-2 min-h-[7.5rem]">
        <p className="h-5 text-ink-subtle/55 text-sm leading-snug line-clamp-1 italic">
          {prev}
        </p>
        <p className="text-ink text-base md:text-lg leading-[1.6] font-medium">
          {speaker_label === null ? current : (
            <>
              <span className="font-semibold">{speaker_label}: </span>
              {current}
            </>
          )}
        </p>
        <p className="h-5 text-ink-subtle/55 text-sm leading-snug line-clamp-1 italic">
          {next}
        </p>
      </div>
    </div>
  );
}

function transcriptLineText(state: PlaybackState): string {
  if (state.activeSegment !== null) {
    return state.activeSegment.line;
  }
  const shot = state.shot;
  if (shot === null) {
    return '';
  }
  const vo = shot.vo;
  if (vo !== undefined) {
    return vo.line.text;
  }
  const dialogue = shot.dialogue;
  if (dialogue !== undefined && dialogue.length > 0) {
    return dialogue[0].line.text;
  }
  return '';
}

function speakerLabelForShot(state: PlaybackState): string | null {
  const activeSpeakerCastId = state.activeSpeakerCastId;
  const shot = state.shot;
  if (activeSpeakerCastId === null || shot === null) {
    return null;
  }
  if (!shotHasMultipleSpeakers(shot)) {
    return null;
  }
  const cast = state.characters.find((member) => member.id === activeSpeakerCastId);
  if (cast === undefined) {
    throw new Error(`chrome.speaker_label.cast_missing: ${activeSpeakerCastId}`);
  }
  return cast.name;
}

function shotHasMultipleSpeakers(shot: NonNullable<PlaybackState['shot']>): boolean {
  const speakerIds = new Set<string>();
  const vo = shot.vo;
  if (vo !== undefined) {
    speakerIds.add(vo.cast_id);
  }
  const dialogue = shot.dialogue;
  if (dialogue !== undefined) {
    for (const segment of dialogue) {
      speakerIds.add(segment.cast_id);
    }
  }
  return speakerIds.size > 1;
}

interface HierarchicalScrubberProps {
  timelineIndex: TimelineIndex;
  currentSec: number;
  currentShotIndex: number;
  onSeek: (globalSec: number) => void;
}

interface ScrubberTooltip {
  label: string;
  left_pct: number;
}

function HierarchicalScrubber({
  timelineIndex,
  currentSec,
  currentShotIndex,
  onSeek,
}: HierarchicalScrubberProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const dragStartedAtRef = useRef(0);
  const dragMovedRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<ScrubberTooltip | null>(null);
  const [pinnedTooltip, setPinnedTooltip] = useState<ScrubberTooltip | null>(null);
  const [revealedShotId, setRevealedShotId] = useState<ShotId | null>(null);

  const actPct = useMemo(() => actSpansAsPct(timelineIndex), [timelineIndex]);
  const scenePct = useMemo(() => sceneTicksAsPct(timelineIndex), [timelineIndex]);
  const shotPct = useMemo(() => shotTicksAsPct(timelineIndex), [timelineIndex]);
  const primaryKeyframes = useMemo(
    () => keyframeMarkersAsPct(timelineIndex, { include_secondary: false }),
    [timelineIndex],
  );
  const allKeyframes = useMemo(
    () => keyframeMarkersAsPct(timelineIndex, { include_secondary: true }),
    [timelineIndex],
  );
  const actById = useMemo(() => spansById(timelineIndex.acts), [timelineIndex.acts]);
  const sceneById = useMemo(() => spansById(timelineIndex.scenes), [timelineIndex.scenes]);
  const shotById = useMemo(() => shotSpansById(timelineIndex.shots), [timelineIndex.shots]);
  const keyframeById = useMemo(
    () => keyframesById(timelineIndex.keyframes),
    [timelineIndex.keyframes],
  );
  const currentShot = timelineIndex.shots[currentShotIndex];
  const currentShotId = currentShot === undefined ? null : currentShot.id;
  const currentPct = scrubberPctForTime(timelineIndex, currentSec);
  const activeTooltip = pinnedTooltip !== null ? pinnedTooltip : hoverTooltip;
  const secondaryKeyframes = allKeyframes.filter((marker) => {
    if (marker.importance !== 'secondary') {
      return false;
    }
    const keyframe = keyframeById.get(marker.id);
    if (keyframe === undefined) {
      throw new Error(`chrome.keyframe_missing: ${marker.id}`);
    }
    return keyframe.shot_id === revealedShotId;
  });

  const seekFromClient = (clientX: number): void => {
    const track = trackRef.current;
    if (track === null) return;
    const rect = track.getBoundingClientRect();
    const ratio = rect.width > 0
      ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      : 0;
    onSeek(scrubberTimeForPct(timelineIndex, ratio * 100));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    draggingRef.current = true;
    dragStartedAtRef.current = event.clientX;
    dragMovedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.target === event.currentTarget && event.pointerType !== 'mouse') {
      setPinnedTooltip(null);
    }
    seekFromClient(event.clientX);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return;
    if (Math.abs(event.clientX - dragStartedAtRef.current) > 3) {
      dragMovedRef.current = true;
    }
    seekFromClient(event.clientX);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    draggingRef.current = false;
    clearLongPressTimer(longPressTimerRef);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const seekTierStart = (globalSec: number): void => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    onSeek(globalSec);
  };

  const pinIfTouch = (
    event: ReactPointerEvent<HTMLElement>,
    tooltip: ScrubberTooltip,
  ): void => {
    if (event.pointerType !== 'mouse') {
      setPinnedTooltip(tooltip);
    }
  };

  const revealShotIfLongPress = (
    event: ReactPointerEvent<HTMLElement>,
    shotId: ShotId,
    tooltip: ScrubberTooltip,
  ): void => {
    pinIfTouch(event, tooltip);
    if (event.pointerType !== 'mouse') {
      clearLongPressTimer(longPressTimerRef);
      longPressTimerRef.current = setTimeout(() => setRevealedShotId(shotId), 450);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={trackRef}
        role="slider"
        aria-label="Playback scrubber"
        aria-valuemin={0}
        aria-valuemax={timelineIndex.total_duration_s}
        aria-valuenow={currentSec}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="chrome-scrubber relative h-24 overflow-visible rounded-xl border border-ink-subtle/15 bg-paper-card shadow-sm cursor-pointer touch-none"
      >
        <div className="absolute inset-x-0 top-0 h-7 rounded-t-xl bg-paper-tint" />
        <div className="absolute inset-x-0 top-7 bottom-0 rounded-b-xl bg-ink-subtle/10" />

        {actPct.map((act, index) => {
          const span = actById.get(act.id);
          if (span === undefined) {
            throw new Error(`chrome.act_missing: ${act.id}`);
          }
          const tooltip = { label: act.title, left_pct: act.left_pct };
          return (
            <button
              key={act.id}
              type="button"
              aria-label={`Seek to act ${act.title}`}
              onClick={() => seekTierStart(span.start_s)}
              onPointerDown={(event) => pinIfTouch(event, tooltip)}
              onMouseEnter={() => setHoverTooltip(tooltip)}
              onMouseLeave={() => setHoverTooltip(null)}
              className={`absolute inset-y-0 z-0 overflow-hidden px-2 text-left transition ${
                index % 2 === 0 ? 'bg-accent/10 hover:bg-accent/20' : 'bg-ink-subtle/10 hover:bg-ink-subtle/20'
              }`}
              style={spanStyle(act.left_pct, act.width_pct)}
            >
              <span className="block truncate pt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
                {act.title}
              </span>
            </button>
          );
        })}

        <div className="pointer-events-none absolute inset-x-0 top-7 h-px bg-ink-subtle/12" />
        <div className="absolute inset-x-0 top-8 h-6 z-10">
          {scenePct.map((scene) => {
            const span = sceneById.get(scene.id);
            if (span === undefined) {
              throw new Error(`chrome.scene_missing: ${scene.id}`);
            }
            const tooltip = { label: scene.title, left_pct: scene.left_pct };
            return (
              <button
                key={scene.id}
                type="button"
                aria-label={`Seek to scene ${scene.title}`}
                onClick={() => seekTierStart(span.start_s)}
                onPointerDown={(event) => pinIfTouch(event, tooltip)}
                onMouseEnter={() => setHoverTooltip(tooltip)}
                onMouseLeave={() => setHoverTooltip(null)}
                className="absolute top-0 h-full border-l border-ink-subtle/35 hover:bg-paper/40 transition"
                style={spanStyle(scene.left_pct, scene.width_pct)}
              >
                <span className="sr-only">{scene.title}</span>
              </button>
            );
          })}
        </div>

        <div className="absolute inset-x-0 top-14 h-7 z-20 border-y border-ink-subtle/10">
          {shotPct.map((shot, index) => {
            const span = shotById.get(shot.id);
            if (span === undefined) {
              throw new Error(`chrome.shot_missing: ${shot.id}`);
            }
            const tooltip = {
              label: `shot ${index + 1}/${shotPct.length}`,
              left_pct: shot.left_pct,
            };
            const isActive = currentShotId === shot.id;
            return (
              <button
                key={`${shot.scene_id}.${shot.id}`}
                type="button"
                aria-label={`Seek to shot ${index + 1}`}
                onClick={() => seekTierStart(span.start_s)}
                onPointerDown={(event) => revealShotIfLongPress(event, shot.id, tooltip)}
                onPointerUp={() => clearLongPressTimer(longPressTimerRef)}
                onMouseEnter={() => {
                  setRevealedShotId(shot.id);
                  setHoverTooltip(tooltip);
                }}
                onMouseLeave={() => {
                  setRevealedShotId(null);
                  setHoverTooltip(null);
                }}
                className={`absolute top-0 h-full border-l transition ${
                  isActive
                    ? 'border-accent bg-accent/18'
                    : 'border-paper/80 hover:bg-ink-subtle/20'
                }`}
                style={spanStyle(shot.left_pct, shot.width_pct)}
              >
                <span className="sr-only">{tooltip.label}</span>
              </button>
            );
          })}
        </div>

        <div className="absolute inset-x-0 bottom-2 h-4 z-30">
          {primaryKeyframes.map((marker) => {
            const keyframe = keyframeById.get(marker.id);
            if (keyframe === undefined) {
              throw new Error(`chrome.keyframe_missing: ${marker.id}`);
            }
            const tooltip = {
              label: marker.label === undefined ? marker.id : marker.label,
              left_pct: marker.left_pct,
            };
            return (
              <KeyframeButton
                key={marker.id}
                markerId={marker.id}
                leftPct={marker.left_pct}
                primary={true}
                tooltip={tooltip}
                onSeek={() => seekTierStart(keyframe.at_s)}
                onPointerDown={pinIfTouch}
                onHover={setHoverTooltip}
              />
            );
          })}
          {secondaryKeyframes.map((marker) => {
            const keyframe = keyframeById.get(marker.id);
            if (keyframe === undefined) {
              throw new Error(`chrome.keyframe_missing: ${marker.id}`);
            }
            const tooltip = {
              label: marker.label === undefined ? marker.id : marker.label,
              left_pct: marker.left_pct,
            };
            return (
              <KeyframeButton
                key={marker.id}
                markerId={marker.id}
                leftPct={marker.left_pct}
                primary={false}
                tooltip={tooltip}
                onSeek={() => seekTierStart(keyframe.at_s)}
                onPointerDown={pinIfTouch}
                onHover={setHoverTooltip}
              />
            );
          })}
        </div>

        <div
          className="pointer-events-none absolute top-6 bottom-1 z-40 w-0.5 rounded-full bg-accent shadow-[0_0_0_1px_rgba(255,255,255,0.75)]"
          style={{ left: `calc(${pct(currentPct)} - 1px)` }}
        />
        <div
          className="pointer-events-none absolute top-[1.35rem] z-40 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-paper bg-accent shadow"
          style={{ left: pct(currentPct) }}
        />

        {activeTooltip !== null && (
          <div
            className="pointer-events-none absolute -top-7 z-50 -translate-x-1/2 rounded bg-ink px-2 py-1 text-[11px] leading-none text-paper shadow"
            style={{ left: pct(activeTooltip.left_pct) }}
          >
            {activeTooltip.label}
          </div>
        )}
      </div>
    </div>
  );
}

interface KeyframeButtonProps {
  markerId: string;
  leftPct: number;
  primary: boolean;
  tooltip: ScrubberTooltip;
  onSeek: () => void;
  onPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    tooltip: ScrubberTooltip,
  ) => void;
  onHover: (tooltip: ScrubberTooltip | null) => void;
}

function KeyframeButton({
  markerId,
  leftPct,
  primary,
  tooltip,
  onSeek,
  onPointerDown,
  onHover,
}: KeyframeButtonProps) {
  return (
    <button
      type="button"
      aria-label={`Seek to keyframe ${tooltip.label}`}
      onClick={onSeek}
      onPointerDown={(event) => onPointerDown(event, tooltip)}
      onMouseEnter={() => onHover(tooltip)}
      onMouseLeave={() => onHover(null)}
      className={`absolute top-0 z-30 -translate-x-1/2 transition ${
        primary ? 'opacity-100' : 'opacity-80'
      }`}
      style={{ left: pct(leftPct) }}
    >
      <span className="sr-only">{markerId}</span>
      <span
        className={`block h-3 w-3 rotate-[-45deg] border-l-2 border-b-2 ${
          primary ? 'border-accent' : 'border-ink-subtle'
        }`}
      />
    </button>
  );
}

function spansById<T extends ActSpan | SceneSpan>(spans: T[]): Map<string, T> {
  const byId = new Map<string, T>();
  for (const span of spans) {
    byId.set(span.id, span);
  }
  return byId;
}

function shotSpansById(spans: ShotSpan[]): Map<ShotId, ShotSpan> {
  const byId = new Map<ShotId, ShotSpan>();
  for (const span of spans) {
    byId.set(span.id, span);
  }
  return byId;
}

function keyframesById(keyframes: KeyframeMarker[]): Map<string, KeyframeMarker> {
  const byId = new Map<string, KeyframeMarker>();
  for (const keyframe of keyframes) {
    byId.set(keyframe.id, keyframe);
  }
  return byId;
}

function clearLongPressTimer(timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>): void {
  if (timerRef.current !== null) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function pct(value: number): string {
  return `${value}%`;
}

function spanStyle(left_pct: number, width_pct: number): { left: string; width: string } {
  return {
    left: pct(left_pct),
    width: pct(width_pct),
  };
}

interface ControlsProps {
  state: PlaybackState;
  currentSec: number;
  totalSec: number;
}

function Controls({ state, currentSec, totalSec }: ControlsProps) {
  return (
    <div className="flex items-center gap-3 self-center">
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
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle tabular-nums">
        {state.isPreparing ? 'preparing' : `${fmt(currentSec)} / ${fmt(totalSec)}`}
        {' · '}
        {state.isFinished
          ? 'done'
          : `shot ${state.shotIndex + 1}/${state.totalShots}`}
      </p>
    </div>
  );
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
