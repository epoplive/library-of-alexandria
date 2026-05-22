import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface NarrationState {
  /** 0..1 of the current scene's audio. 0 when not playing. */
  progress: number;
  isPlaying: boolean;
  /** Stable key for the active scene — flips when navigating. */
  sceneKey: string;
}

interface NarrationContextValue extends NarrationState {
  setProgress: (p: number) => void;
  setIsPlaying: (b: boolean) => void;
  setSceneKey: (k: string) => void;
}

const ctx = createContext<NarrationContextValue | null>(null);

export function NarrationProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sceneKey, setSceneKey] = useState('');

  const value = useMemo<NarrationContextValue>(
    () => ({ progress, isPlaying, sceneKey, setProgress, setIsPlaying, setSceneKey }),
    [progress, isPlaying, sceneKey],
  );

  return <ctx.Provider value={value}>{children}</ctx.Provider>;
}

export function useNarration(): NarrationState {
  const v = useContext(ctx);
  if (!v) return { progress: 0, isPlaying: false, sceneKey: '' };
  return { progress: v.progress, isPlaying: v.isPlaying, sceneKey: v.sceneKey };
}

export function useNarrationControls() {
  const v = useContext(ctx);
  if (!v) {
    const noop = () => undefined;
    return {
      setProgress: noop,
      setIsPlaying: noop,
      setSceneKey: noop,
    };
  }
  return {
    setProgress: v.setProgress,
    setIsPlaying: v.setIsPlaying,
    setSceneKey: v.setSceneKey,
  };
}

/** Split a narration script into sentences for highlight tracking. */
export function splitSentences(text: string): string[] {
  // Greedy split on sentence-ending punctuation followed by whitespace.
  const re = /([^.!?]+[.!?]+)(\s+|$)/g;
  const out: string[] = [];
  let m;
  let lastEnd = 0;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1].trim());
    lastEnd = re.lastIndex;
  }
  const rest = text.slice(lastEnd).trim();
  if (rest) out.push(rest);
  return out.length ? out : [text];
}

/** Given current 0..1 progress + sentence count, which sentence is active. */
export function currentSentenceIndex(progress: number, total: number): number {
  if (total === 0) return -1;
  return Math.min(total - 1, Math.floor(progress * total));
}

// Small helper for components that just want the current sentence index
export function useActiveSentence(text: string): number {
  const { progress } = useNarration();
  const sentences = useMemo(() => splitSentences(text), [text]);
  return useMemo(() => currentSentenceIndex(progress, sentences.length), [progress, sentences.length]);
}

export function useNarrationSetter() {
  const v = useContext(ctx);
  return useCallback(
    (patch: Partial<Pick<NarrationContextValue, 'progress' | 'isPlaying' | 'sceneKey'>>) => {
      if (!v) return;
      if (patch.progress !== undefined) v.setProgress(patch.progress);
      if (patch.isPlaying !== undefined) v.setIsPlaying(patch.isPlaying);
      if (patch.sceneKey !== undefined) v.setSceneKey(patch.sceneKey);
    },
    [v],
  );
}
