/* ============================================================
   Asset Manifest loader — populates VO Slot Takes from the
   lesson's pre-rendered audio index.

   gen-audio.mjs writes lessons/<slug>/audio/index.json with entries
   like { hash, text, voice_id, file, timings }. A Production's VO
   Slots reference the line text via shot.vo.line.text; we use that
   + the narrator's voice_id to look up the corresponding MP3 and
   attach it as a v0.1 Take on the Slot.

   This bridges the existing per-line audio pipeline to the new
   Slot/Take registry without changing gen-audio yet — gen-audio
   will be updated to write directly to the AssetManifest in a
   subsequent extraction.
   ============================================================ */

import type { AssetManifest, Production, Take } from './lattice';

interface AudioIndexEntry {
  hash: string;
  text: string;
  voice_id: string;
  file: string;
  speaker_id?: string;
  timings?: Array<{ text: string; startMs: number; durationMs: number }>;
}

interface AudioIndex {
  lesson: string;
  entries: AudioIndexEntry[];
}

/** Vite-time glob of every lesson's audio index. */
const audioIndexes = import.meta.glob<AudioIndex>(
  '/lessons/*/audio/index.json',
  { eager: true, import: 'default' },
);
const audioFileUrls = import.meta.glob<string>(
  '/lessons/*/audio/*.mp3',
  { eager: true, query: '?url', import: 'default' },
);

/**
 * Read the lesson's audio index and resolve VO Slots in the
 * manifest to their rendered MP3 Takes. Each match attaches a v0.1
 * Take with status:'ready'.
 *
 * The lesson slug determines which audio dir to read. The Production
 * supplies the line text + the speaking Cast's voice_id; we look up
 * the matching audio entry by (voice_id, text) — same key gen-audio
 * uses internally.
 */
export function hydrateManifestFromAudio(
  manifest: AssetManifest,
  production: Production,
  lessonSlug: string,
): AssetManifest {
  const indexPath = `/lessons/${lessonSlug}/audio/index.json`;
  const idx = audioIndexes[indexPath];
  if (!idx) return manifest;

  const baseDir = `/lessons/${lessonSlug}/audio`;
  const byKey: Map<string, AudioIndexEntry> = new Map();
  for (const entry of idx.entries) {
    byKey.set(`${entry.voice_id}|${entry.text}`, entry);
  }

  // Walk every Shot's VO and try to attach a v0.1 Take to its Slot
  const nextSlots = { ...manifest.slots };
  for (const scene of production.scenes) {
    for (const shot of scene.shots) {
      if (!shot.vo) continue;
      const cast = production.characters.find((c) => c.id === shot.vo!.cast_id);
      if (!cast) continue;
      const lookupKey = `${cast.voice_profile.voice_id}|${shot.vo.line.text}`;
      const entry = byKey.get(lookupKey);
      if (!entry) continue;
      const url = audioFileUrls[`${baseDir}/${entry.file}`];
      if (!url) continue;
      const slot = nextSlots[shot.vo.audio.slot_id];
      if (!slot) continue;
      // Skip if already attached
      if (slot.takes.find((t) => t.tier === 'v0.1' && t.status === 'ready')) continue;
      const take: Take = {
        tier: 'v0.1',
        artifact: { url, path: url, hash: entry.hash },
        status: 'ready',
        provenance: {
          provider: cast.voice_profile.service,
          voice_id: cast.voice_profile.voice_id,
          model: cast.voice_profile.voice_model,
        },
      };
      nextSlots[shot.vo.audio.slot_id] = { ...slot, takes: [...slot.takes, take] };
    }
  }
  return { ...manifest, slots: nextSlots, updated_at: new Date().toISOString() };
}
