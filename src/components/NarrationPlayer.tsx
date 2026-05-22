import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  isCached,
  prefetchModel,
  subscribeToLoadProgress,
  synthesize,
  type LoadProgress,
} from '@/lib/tts';
import { useNarrationSetter } from '@/lib/narration-context';

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

export function NarrationPlayer({ text, sceneKey, voice }: NarrationPlayerProps) {
  const [state, setState] = useState<PlayState>('idle');
  const [load, setLoad] = useState<LoadProgress>({ status: 'idle' });
  const [progress, setProgress] = useState(0); // 0..1
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const setNarration = useNarrationSetter();

  // Subscribe to model load progress
  useEffect(() => {
    return subscribeToLoadProgress(setLoad);
  }, []);

  // Reset on scene change — stop audio, clear ref
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    urlRef.current = null;
    setProgress(0);
    setDuration(0);
    setState(isCached(text, voice) ? 'idle' : 'idle');
    setNarration({ progress: 0, isPlaying: false, sceneKey });
  }, [sceneKey, text, voice, setNarration]);

  // Publish progress to context
  useEffect(() => {
    setNarration({ progress });
  }, [progress, setNarration]);

  // Publish play state to context
  useEffect(() => {
    setNarration({ isPlaying: state === 'playing' });
  }, [state, setNarration]);

  async function play() {
    if (state === 'playing') return;

    // If we already have audio loaded for this scene, just resume.
    if (audioRef.current && urlRef.current) {
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
      const url = await synthesize(text, voice);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.addEventListener('timeupdate', () => {
        if (audio.duration > 0) setProgress(audio.currentTime / audio.duration);
      });
      audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
      audio.addEventListener('ended', () => {
        setState('ready');
        setProgress(1);
      });
      audio.addEventListener('error', () => setState('error'));
      await audio.play();
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
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play();
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

/** Call once on lesson mount to start downloading the model in the background. */
export function useTTSPrefetch() {
  useEffect(() => {
    prefetchModel();
  }, []);
}
