import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPrerenderedUrl } from '@/lib/tts';
import { useNarrationSetter } from '@/lib/narration-context';

interface NarrationPlayerProps {
  text: string;
  /** Stable key (e.g. lesson slug + page) — resetting it stops/clears the current audio. */
  sceneKey: string;
  voice?: string;
}

type PlayState =
  | 'idle'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'error'
  | 'unavailable';

/**
 * Plays the pre-rendered MP3 for a narration string. The browser never
 * synthesizes — if no file is on disk for this text, the play button
 * is disabled with an "audio pending" label.
 *
 * Progressive enhancement: as the lesson moves from v0.1 → v0.6 → v1.0,
 * the MP3 files on disk get replaced with better takes (Kokoro → ElevenLabs
 * → eventually a video with integrated audio). This component doesn't
 * care which tier the file came from.
 */
export function NarrationPlayer({ text, sceneKey, voice }: NarrationPlayerProps) {
  const url = getPrerenderedUrl(text, voice);
  const [state, setState] = useState<PlayState>(url ? 'idle' : 'unavailable');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const setNarration = useNarrationSetter();

  // Reset on scene change
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setProgress(0);
    setDuration(0);
    setState(url ? 'idle' : 'unavailable');
    setNarration({ progress: 0, currentTimeSec: 0, isPlaying: false, sceneKey });
  }, [sceneKey, text, voice, url, setNarration]);

  useEffect(() => {
    setNarration({ progress });
  }, [progress, setNarration]);

  useEffect(() => {
    setNarration({ isPlaying: state === 'playing' });
  }, [state, setNarration]);

  function play() {
    if (state === 'playing' || state === 'unavailable') return;
    if (!url) {
      setState('unavailable');
      return;
    }
    if (audioRef.current) {
      audioRef.current.play().catch(() => setState('error'));
      setState('playing');
      return;
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
    audio.addEventListener('timeupdate', () => {
      if (audio.duration > 0) setProgress(audio.currentTime / audio.duration);
      setNarration({ currentTimeSec: audio.currentTime });
    });
    audio.addEventListener('ended', () => {
      setState('ready');
      setProgress(1);
    });
    audio.addEventListener('error', () => setState('error'));
    audio.play().then(
      () => setState('playing'),
      () => setState('error'),
    );
  }

  function pause() {
    audioRef.current?.pause();
    setState('paused');
  }

  function restart() {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => undefined);
      setState('playing');
    } else {
      play();
    }
  }

  const showLabel =
    state === 'unavailable'
      ? 'Audio pending'
      : state === 'playing'
        ? 'Playing'
        : state === 'paused'
          ? 'Paused'
          : state === 'error'
            ? 'Audio error'
            : 'Narration';

  const disabled = state === 'unavailable';

  return (
    <div className="flex items-center gap-3 bg-paper-card border border-ink-subtle/15 rounded-full pl-1.5 pr-4 py-1.5 shadow-card max-w-[420px] min-w-[200px]">
      <button
        type="button"
        onClick={() => {
          if (state === 'playing') pause();
          else play();
        }}
        disabled={disabled}
        aria-label={state === 'playing' ? 'Pause' : 'Play'}
        className="w-9 h-9 rounded-full bg-accent text-paper flex items-center justify-center hover:bg-accent-hover transition shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {state === 'playing' ? (
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
            <motion.div
              key="progress"
              animate={{ width: `${progress * 100}%` }}
              className="h-full bg-accent"
              transition={{ duration: 0.1 }}
            />
          </AnimatePresence>
        </div>
      </div>

      {progress > 0.05 && !disabled && (
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

/** Compatibility no-op — viewer doesn't load a TTS model. */
export function useTTSPrefetch() {
  /* no-op */
}
