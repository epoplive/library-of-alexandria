/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Browser-side audio lookup.
 *
 * The viewer never synthesizes. All narration audio is pre-rendered by
 * `scripts/gen-audio.mjs` (server-side) and committed to
 * `lessons/<slug>/audio/<hash>.mp3` + indexed by
 * `lessons/<slug>/audio/index.json`. Vite globs everything at build time.
 *
 * Progressive enhancement model:
 *  - v0.1 narrations are rendered with Kokoro CLI (free, server-side)
 *  - v0.6 narrations re-rendered with ElevenLabs (per-lesson donation)
 *  - v1.0 replaces audio with full integrated-audio video
 *
 * The browser doesn't care which tier the file came from — it just
 * plays whichever MP3 is currently on disk for a given narration string.
 */

const DEFAULT_VOICE = 'af_bella';

/**
 * Per-chunk timing entry. gen-audio writes one of these per chunk it
 * synthesized. For single-call narrations there's one entry covering
 * the whole MP3. For long-form narrations split at sentence boundaries
 * before TTS, each chunk gets its own entry. The browser uses these
 * to map currentTime → which chunk is audible, then uses the chunk's
 * char range against the full narration to pick the active sentence.
 */
export interface AudioTiming {
  text: string;
  startMs: number;
  durationMs: number;
}

type AudioIndex = {
  lesson: string;
  entries: {
    hash: string;
    text: string;
    voice_id: string;
    file: string;
    timings?: AudioTiming[];
  }[];
};

const audioIndexes = import.meta.glob<AudioIndex>(
  '/lessons/*/audio/index.json',
  { eager: true, import: 'default' },
);
const audioFileUrls = import.meta.glob<string>(
  '/lessons/*/audio/*.mp3',
  { eager: true, query: '?url', import: 'default' },
);

const prerendered: Map<string, string> = new Map();
const prerenderedTimings: Map<string, AudioTiming[]> = new Map();

for (const indexPath in audioIndexes) {
  const idx = audioIndexes[indexPath];
  const baseDir = indexPath.replace(/\/index\.json$/, '');
  for (const entry of idx.entries) {
    const filePath = `${baseDir}/${entry.file}`;
    const url = audioFileUrls[filePath];
    if (!url) continue;
    const key = `${entry.voice_id}|${entry.text}`;
    prerendered.set(key, url);
    if (entry.timings && entry.timings.length > 0) {
      prerenderedTimings.set(key, entry.timings);
    }
  }
}

export function getPrerenderedUrl(text: string, voice: string = DEFAULT_VOICE): string | null {
  return prerendered.get(`${voice}|${text}`) ?? null;
}

export function getTimings(text: string, voice: string = DEFAULT_VOICE): AudioTiming[] | null {
  return prerenderedTimings.get(`${voice}|${text}`) ?? null;
}

export function prerenderedCount(): number {
  return prerendered.size;
}

export function isCached(text: string, voice: string = DEFAULT_VOICE): boolean {
  return prerendered.has(`${voice}|${text}`);
}

/**
 * Look up the pre-rendered audio URL for a given narration. Returns
 * null when the audio hasn't been rendered yet (run `npm run gen:audio`).
 *
 * Synchronous in spirit — Vite resolved everything at build time — but
 * kept async-returning for API stability with callers written when
 * live synthesis was supported.
 */
export async function synthesize(
  text: string,
  voice: string = DEFAULT_VOICE,
): Promise<string | null> {
  return prerendered.get(`${voice}|${text}`) ?? null;
}

/* Compatibility exports — load progress + prefetch are no-ops since
 * nothing is loaded client-side. Kept so existing callers don't break. */

export type LoadProgress =
  | { status: 'idle' }
  | { status: 'ready' };

export function subscribeToLoadProgress(listener: (s: LoadProgress) => void): () => void {
  listener({ status: 'ready' });
  return () => undefined;
}

export function getLoadProgress(): LoadProgress {
  return { status: 'ready' };
}

export function prefetchModel(): void {
  /* no-op — viewer doesn't load a TTS model */
}

export function clearAudioCache(): void {
  /* no-op — pre-rendered URLs are static module-level data */
}
