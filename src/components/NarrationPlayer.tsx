import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  isCached,
  prefetchModel,
  prerenderedCount,
  subscribeToLoadProgress,
  synthesize,
  type LoadProgress,
} from '@/lib/tts';
import { splitSentences, useNarrationSetter } from '@/lib/narration-context';

interface NarrationPlayerProps {
  text: string;
  /** Stable key (e.g. lesson slug + page) — resetting it stops/clears the current audio. */
  sceneKey: string;
  voice?: string;
}

type PlayState =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'error';

/**
 * Long-narration handling.
 *
 * Kokoro's live `generate()` has a token cap; passing ~500+ char strings
 * produces a truncated MP3 (so a 3-minute paragraph silently becomes a
 * 30-second clip with the rest dropped). To work around that without
 * pre-rendering every Section narration, we split text into sentences,
 * synthesize each one, and chain playback. Progress is computed across
 * the full chunk list so the transcript highlight stays in sync with
 * whichever sentence is actually audible.
 *
 * When a single pre-rendered MP3 exists for the full text (gen-audio
 * has run + the file matches), we skip chunking and play the prerendered
 * file directly — that's the cheapest path.
 */
export function NarrationPlayer({ text, sceneKey, voice }: NarrationPlayerProps) {
  const [state, setState] = useState<PlayState>('idle');
  const [load, setLoad] = useState<LoadProgress>({ status: 'idle' });
  const [progress, setProgress] = useState(0); // 0..1 across the WHOLE narration
  const [duration, setDuration] = useState(0); // total seconds across all chunks
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<{ text: string; url: string; duration: number }[]>([]);
  const chunkIdxRef = useRef(0);
  const setNarration = useNarrationSetter();

  const fullPrerendered = isCached(text, voice);

  // Pre-split text into sentences once; the chunked path uses these.
  const sentences = useMemo(() => splitSentences(text), [text]);

  // Subscribe to model load progress
  useEffect(() => {
    return subscribeToLoadProgress(setLoad);
  }, []);

  // Reset on scene change — stop audio, clear refs
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    chunksRef.current = [];
    chunkIdxRef.current = 0;
    setProgress(0);
    setDuration(0);
    setState('idle');
    setNarration({ progress: 0, isPlaying: false, sceneKey });
  }, [sceneKey, text, voice, setNarration]);

  // Publish progress to context (drives transcript highlight)
  useEffect(() => {
    setNarration({ progress });
  }, [progress, setNarration]);

  // Publish play state to context
  useEffect(() => {
    setNarration({ isPlaying: state === 'playing' });
  }, [state, setNarration]);

  function progressForChunk(idx: number, currentTimeWithinChunk: number): number {
    const chunks = chunksRef.current;
    if (chunks.length === 0) return 0;
    const totalDur = chunks.reduce((a, c) => a + c.duration, 0);
    if (totalDur === 0) return idx / chunks.length;
    let elapsed = 0;
    for (let i = 0; i < idx; i++) elapsed += chunks[i].duration;
    elapsed += Math.min(currentTimeWithinChunk, chunks[idx].duration);
    return Math.min(1, elapsed / totalDur);
  }

  function playChunk(idx: number) {
    const chunks = chunksRef.current;
    if (idx >= chunks.length) {
      setState('ready');
      setProgress(1);
      return;
    }
    chunkIdxRef.current = idx;
    const audio = new Audio(chunks[idx].url);
    audioRef.current = audio;
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration)) {
        chunks[idx].duration = audio.duration;
        setDuration(chunks.reduce((a, c) => a + c.duration, 0));
      }
    });
    audio.addEventListener('timeupdate', () => {
      setProgress(progressForChunk(idx, audio.currentTime));
    });
    audio.addEventListener('ended', () => {
      if (chunkIdxRef.current === idx) playChunk(idx + 1);
    });
    audio.addEventListener('error', () => {
      // Skip this chunk, advance — surface as error only if NO chunks have played
      if (chunkIdxRef.current === idx) playChunk(idx + 1);
    });
    audio.play().catch(() => setState('error'));
  }

  async function play() {
    if (state === 'playing') return;

    // Resume if we already have chunks loaded for this scene.
    if (chunksRef.current.length > 0 && audioRef.current) {
      try {
        await audioRef.current.play();
        setState('playing');
      } catch {
        setState('error');
      }
      return;
    }

    setState('preparing');
    try {
      // Path A — full text already pre-rendered. Skip chunking; play single file.
      if (fullPrerendered) {
        const url = await synthesize(text, voice);
        chunksRef.current = [{ text, url, duration: 0 }];
        playChunk(0);
        setState('playing');
        return;
      }

      // Path B — live Kokoro. Synthesize each sentence and chain.
      // Synthesize in parallel; first-sentence-ready starts playback while
      // the rest finish in the background.
      const urls = await Promise.all(
        sentences.map((s) => synthesize(s, voice)),
      );
      chunksRef.current = sentences.map((s, i) => ({ text: s, url: urls[i], duration: 0 }));
      playChunk(0);
      setState('playing');
    } catch {
      setState('error');
    }
  }

  function pause() {
    audioRef.current?.pause();
    setState('paused');
  }

  function restart() {
    // Hard reset to chunk 0, replay from top
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setProgress(0);
    chunkIdxRef.current = 0;
    if (chunksRef.current.length > 0) {
      playChunk(0);
      setState('playing');
    } else {
      void play();
    }
  }

  const downloading = load.status === 'downloading';
  const downloadPct = downloading ? Math.round((load.progress ?? 0) * 100) : 0;
  const showLabel =
    state === 'preparing'
      ? downloading
        ? `Downloading voice · ${downloadPct}%`
        : 'Synthesizing…'
      : state === 'playing'
        ? 'Playing'
        : state === 'paused'
          ? 'Paused'
          : state === 'error'
            ? 'Audio error'
            : 'Narration';

  return (
    <div className="flex items-center gap-3 bg-paper-card border border-ink-subtle/15 rounded-full pl-1.5 pr-4 py-1.5 shadow-card max-w-[420px] min-w-[200px]">
      <button
        type="button"
        onClick={() => {
          if (state === 'playing') pause();
          else if (state === 'paused' || state === 'ready' || state === 'idle') play();
          else if (state === 'error') play();
        }}
        disabled={state === 'preparing'}
        aria-label={state === 'playing' ? 'Pause' : 'Play'}
        className="w-9 h-9 rounded-full bg-accent text-paper flex items-center justify-center hover:bg-accent-hover transition shrink-0 disabled:opacity-60"
      >
        {state === 'preparing' ? (
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
        ) : state === 'playing' ? (
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
            {showLabel}
          </p>
          {duration > 0 && (
            <p className="font-mono text-[10px] text-ink-subtle tabular-nums shrink-0">
              {formatTime(progress * duration)} / {formatTime(duration)}
            </p>
          )}
        </div>
        <div className="h-1 bg-paper-tint rounded-full overflow-hidden">
          <AnimatePresence>
            {downloading && state === 'preparing' ? (
              <motion.div
                key="download"
                animate={{ width: `${downloadPct}%` }}
                className="h-full bg-signal-info"
              />
            ) : (
              <motion.div
                key="progress"
                animate={{ width: `${progress * 100}%` }}
                className="h-full bg-accent"
                transition={{ duration: 0.1 }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {progress > 0.05 && state !== 'preparing' && (
        <button
          type="button"
          onClick={restart}
          aria-label="Restart narration"
          className="text-ink-subtle hover:text-ink shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M1 4v6h6" />
            <path d="M3.5 15a9 9 0 1 0 2.5-9.5L1 10" />
          </svg>
        </button>
      )}
    </div>
  );
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec)) return '0:00';
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/**
 * Call once on lesson mount to start downloading the Kokoro model in
 * the background — but only if there's no pre-rendered audio yet.
 * Lessons with full pre-rendered narration never need Kokoro client-side.
 */
export function useTTSPrefetch() {
  useEffect(() => {
    if (prerenderedCount() > 0) return; // skip the 80MB download
    prefetchModel();
  }, []);
}
