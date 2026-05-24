/* ============================================================
   Chrome — the one player UI for the lattice.

   Reads PlaybackState and renders:
     - transcript panel: current Shot's VO line with sentence-level
       highlight synced to audio.currentTime via the active Take's
       timings
     - Production-wide scrubber: drag across Scene boundaries; on drag
       computes the target (shotIndex, localTime) and calls seekToTime
     - shot dots: jump-to-shot affordance
     - play / pause toggle + state readout

   Designed to be the only player chrome the lesson uses.
   Section.tsx / TimelinePlayer / NarrationPlayer all retire to this.
   ============================================================ */

import { useMemo, useRef } from 'react';
import type { PlaybackState } from './Playback';
import {
  sentenceIndexFromTimings,
  splitSentences,
} from '@/lib/narration-context';

export function Chrome({ state }: { state: PlaybackState }) {
  const lineText = state.shot?.vo?.line.text ?? '';
  const sentences = useMemo(() => splitSentences(lineText), [lineText]);
  const timings = state.activeTake?.timings ?? null;

  // Sentence-level highlight. shotTime is in seconds; timings use ms.
  // sentenceIndexFromTimings expects (currentTimeSec, progress, sentences, timings).
  const shotDuration = state.shotDurations[state.shotIndex] ?? 0;
  const progress = shotDuration > 0 ? state.shotTime / shotDuration : 0;
  const activeSentenceIdx = useMemo(
    () =>
      state.isPlaying || progress > 0
        ? sentenceIndexFromTimings(state.shotTime, progress, sentences, timings)
        : -1,
    [state.shotTime, state.isPlaying, progress, sentences, timings],
  );

  const totalSec = useMemo(
    () => state.shotDurations.reduce((a, b) => a + b, 0),
    [state.shotDurations],
  );
  const cumulativeBefore = useMemo(() => {
    let c = 0;
    const out: number[] = [];
    for (const d of state.shotDurations) {
      out.push(c);
      c += d;
    }
    return out;
  }, [state.shotDurations]);
  const currentGlobalSec =
    (cumulativeBefore[state.shotIndex] ?? totalSec) + state.shotTime;

  return (
    <div className="flex flex-col gap-3 px-3 md:px-5 pb-3">
      <TranscriptPanel
        sentences={sentences}
        activeIdx={activeSentenceIdx}
        sceneTitle={sceneTitleForShot(state)}
      />
      <Scrubber
        totalSec={totalSec}
        currentSec={currentGlobalSec}
        shotDurations={state.shotDurations}
        cumulativeBefore={cumulativeBefore}
        shotIndex={state.shotIndex}
        onSeek={state.seekToTime}
        onSeekShot={state.seekToShot}
      />
      <Controls state={state} currentSec={currentGlobalSec} totalSec={totalSec} />
    </div>
  );
}

function sceneTitleForShot(state: PlaybackState): string | undefined {
  // The Shot doesn't know its Scene directly; chrome is currently only
  // used by single-Scene Productions. Multi-Scene title resolution lives
  // in p1-port-sections — until then, return undefined.
  void state;
  return undefined;
}

interface TranscriptPanelProps {
  sentences: string[];
  activeIdx: number;
  sceneTitle?: string;
}

function TranscriptPanel({ sentences, activeIdx, sceneTitle }: TranscriptPanelProps) {
  if (sentences.length === 0) return null;
  const inFocus = activeIdx >= 0 ? activeIdx : 0;
  const prev = inFocus > 0 ? sentences[inFocus - 1] : null;
  const current = sentences[inFocus] ?? null;
  const next = inFocus + 1 < sentences.length ? sentences[inFocus + 1] : null;

  return (
    <div className="bg-paper-card border border-ink-subtle/10 rounded-2xl shadow-card overflow-hidden">
      {sceneTitle && (
        <div className="px-5 py-2 border-b border-ink-subtle/10 bg-paper-tint">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
            {sceneTitle}
          </p>
        </div>
      )}
      <div className="px-6 py-4 flex flex-col gap-2 min-h-[7.5rem]">
        <p className="h-5 text-ink-subtle/55 text-sm leading-snug line-clamp-1 italic">
          {prev}
        </p>
        <p className="text-ink text-base md:text-lg leading-[1.6] font-medium">
          {current}
        </p>
        <p className="h-5 text-ink-subtle/55 text-sm leading-snug line-clamp-1 italic">
          {next}
        </p>
      </div>
    </div>
  );
}

interface ScrubberProps {
  totalSec: number;
  currentSec: number;
  shotDurations: number[];
  cumulativeBefore: number[];
  shotIndex: number;
  onSeek: (globalSec: number) => void;
  onSeekShot: (i: number) => void;
}

function Scrubber({
  totalSec,
  currentSec,
  shotDurations,
  cumulativeBefore,
  shotIndex,
  onSeek,
  onSeekShot,
}: ScrubberProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const pct = totalSec > 0 ? (currentSec / totalSec) * 100 : 0;

  const seekFromClient = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(ratio * totalSec);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    seekFromClient(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    seekFromClient(e.clientX);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={trackRef}
        role="slider"
        aria-label="Playback scrubber"
        aria-valuemin={0}
        aria-valuemax={totalSec}
        aria-valuenow={currentSec}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative h-2 rounded-full bg-ink-subtle/15 cursor-pointer touch-none"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent/70"
          style={{ width: `${pct}%` }}
        />
        {cumulativeBefore.map((c, i) =>
          i === 0 ? null : (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 w-px h-2 bg-paper"
              style={{ left: `${(c / totalSec) * 100}%` }}
            />
          ),
        )}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-accent border-2 border-paper shadow"
          style={{ left: `calc(${pct}% - 7px)` }}
        />
      </div>
      <div className="flex gap-1 items-center justify-center">
        {shotDurations.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSeekShot(i)}
            aria-label={`Shot ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              i === shotIndex
                ? 'w-5 bg-accent'
                : i < shotIndex
                  ? 'w-2.5 bg-accent/40 hover:bg-accent/60'
                  : 'w-2.5 bg-ink-subtle/25 hover:bg-ink-subtle/45'
            }`}
          />
        ))}
      </div>
    </div>
  );
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
