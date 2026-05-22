/* eslint-disable @typescript-eslint/no-explicit-any */
import { KokoroTTS } from 'kokoro-js';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const DEFAULT_VOICE = 'af_bella';

/* ---- Pre-rendered audio lookup ----------------------------- */

/**
 * Vite-time glob of every lesson's pre-rendered audio index. Lessons
 * not yet built will simply have no entries here; we fall back to live
 * synthesis for those.
 */
type AudioIndex = {
  lesson: string;
  entries: { hash: string; text: string; voice_id: string; file: string }[];
};

const audioIndexes = import.meta.glob<AudioIndex>(
  '/lessons/*/audio/index.json',
  { eager: true, import: 'default' },
);
const audioFileUrls = import.meta.glob<string>(
  '/lessons/*/audio/*.mp3',
  { eager: true, query: '?url', import: 'default' },
);

/** Map of "voice|text" → resolved URL of a pre-rendered audio file. */
const prerendered: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const indexPath in audioIndexes) {
    const idx = audioIndexes[indexPath];
    const baseDir = indexPath.replace(/\/index\.json$/, '');
    for (const entry of idx.entries) {
      const filePath = `${baseDir}/${entry.file}`;
      const url = audioFileUrls[filePath];
      if (!url) continue;
      m.set(`${entry.voice_id}|${entry.text}`, url);
    }
  }
  return m;
})();

export function getPrerenderedUrl(text: string, voice: string = DEFAULT_VOICE): string | null {
  return prerendered.get(`${voice}|${text}`) ?? null;
}

export function prerenderedCount(): number {
  return prerendered.size;
}

export type LoadProgress =
  | { status: 'idle' }
  | { status: 'downloading'; progress: number; file?: string }
  | { status: 'ready' }
  | { status: 'error'; error: string };

type ProgressListener = (state: LoadProgress) => void;

const listeners = new Set<ProgressListener>();
let currentState: LoadProgress = { status: 'idle' };
let modelPromise: Promise<KokoroTTS> | null = null;
const audioCache = new Map<string, string>(); // key: voice|text → object URL

function notify(state: LoadProgress) {
  currentState = state;
  for (const l of listeners) l(state);
}

export function subscribeToLoadProgress(listener: ProgressListener): () => void {
  listeners.add(listener);
  listener(currentState);
  return () => listeners.delete(listener);
}

export function getLoadProgress(): LoadProgress {
  return currentState;
}

async function getModel(): Promise<KokoroTTS> {
  if (modelPromise) return modelPromise;
  notify({ status: 'downloading', progress: 0 });
  modelPromise = (async () => {
    try {
      const model = await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (info: any) => {
          if (info?.status === 'progress' && typeof info.progress === 'number') {
            notify({
              status: 'downloading',
              progress: info.progress / 100,
              file: info.file,
            });
          }
        },
      } as any);
      notify({ status: 'ready' });
      return model;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify({ status: 'error', error: msg });
      modelPromise = null;
      throw e;
    }
  })();
  return modelPromise;
}

export function isCached(text: string, voice: string = DEFAULT_VOICE): boolean {
  // Pre-rendered files count as "cached" — playback is effectively instant.
  if (prerendered.has(`${voice}|${text}`)) return true;
  return audioCache.has(`${voice}|${text}`);
}

export async function synthesize(
  text: string,
  voice: string = DEFAULT_VOICE,
): Promise<string> {
  // 1. Prefer pre-rendered audio from disk (committed to repo by gen-audio script).
  const prerenderedUrl = prerendered.get(`${voice}|${text}`);
  if (prerenderedUrl) return prerenderedUrl;

  // 2. Fall back to in-memory cache of previously-synthesized audio this session.
  const key = `${voice}|${text}`;
  const cached = audioCache.get(key);
  if (cached) return cached;

  // 3. Live-synthesize via Kokoro (lazy model load).
  const model = await getModel();
  const audio: any = await (model as any).generate(text, { voice });
  const blob: Blob = typeof audio.toBlob === 'function' ? audio.toBlob() : audio;
  const url = URL.createObjectURL(blob);
  audioCache.set(key, url);
  return url;
}

export function clearAudioCache() {
  for (const url of audioCache.values()) URL.revokeObjectURL(url);
  audioCache.clear();
}

/** Begin downloading the model in the background. Safe to call multiple times. */
export function prefetchModel(): void {
  void getModel().catch(() => {
    /* listener has the error */
  });
}
