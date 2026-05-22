/* ============================================================
   Production schema — OFFLINE side.

   This is what the gen-pipeline agent consumes to produce ONE final
   video that gets uploaded to YouTube. The agent reads it, generates
   reference images for characters, runs i2v on shots, synthesizes
   voice lines, stitches everything, uploads, and writes the resulting
   YouTube ID back into the lesson manifest (`video.source.id`).

   This file lives at `lessons/<slug>/production.json` and is
   committed for provenance / regen. The lesson manifest references
   it via `provenance.video_production_id`.

   Constraints baked in:
   - Most i2v services cap clips at 5–10 seconds. Shots are clip-sized.
   - Character coherence: every shot referencing a character must use
     the locked reference images from that character.
   - Cost tracking per asset, summed up for budget transparency.
   ============================================================ */

export type AssetStatus = 'pending' | 'queued' | 'generating' | 'ready' | 'failed';

export type GenService =
  | 'midjourney'
  | 'flux'
  | 'sdxl'
  | 'kling'
  | 'hailuo'
  | 'vidu'
  | 'wan'
  | 'runway-gen3'
  | 'sora'
  | 'veo3'
  | 'kokoro'
  | 'elevenlabs'
  | 'heygen'
  | 'hedra'
  | 'browser-llm'
  | 'ffmpeg'
  | 'manual';

/* ---- Characters ---- */

export interface Character {
  id: string;
  name: string;
  /** What/who they are, for prompt context. */
  description: string;
  /** Visual style notes — "stylized cel-shaded", "photoreal", "Pixar-ish". */
  visual_style: string;
  /** Asset ids of locked reference images that establish appearance. */
  reference_image_asset_ids: string[];
  /** Voice persona, used by TTS or voice services. */
  voice_persona?: string;
  voice_service_id?: string;
}

/* ---- Assets ---- */

export type AssetKind = 'image' | 'video-clip' | 'audio' | 'browser-anim' | 'composite';

export interface Asset {
  id: string;
  kind: AssetKind;
  /** Prompt or spec passed to the service. */
  prompt: string;
  /** Optional refs to characters whose visual identity must persist in this asset. */
  character_ids?: string[];
  /** Reference assets (e.g. character refs, prior shot for continuity). */
  reference_asset_ids?: string[];
  /** Local file path once produced, relative to lesson directory. */
  src?: string;
  /** SHA-256 of bytes for durable identity. */
  content_hash?: string;
  status: AssetStatus;
  service?: GenService;
  /** Model/seed/version params for deterministic regen. */
  params?: Record<string, string | number | boolean>;
  cost_usd?: number;
  generated_at?: string;
  failed_reason?: string;
}

/* ---- Shots (5–10s i2v segments) ---- */

export interface Shot {
  id: string;
  /** Position in the final video (seconds). */
  start: number;
  /** Duration in seconds. Typically 5–10s for i2v compatibility. */
  duration: number;
  /** Visual brief — what should be on screen. Composed with character refs. */
  visual_prompt: string;
  /** Motion brief — camera moves, character actions. */
  motion_prompt: string;
  /** Character ids that appear in this shot. */
  character_ids: string[];
  /** Generated asset id for the actual clip. */
  clip_asset_id?: string;
  /** Optional reference image asset id to seed the i2v. */
  reference_image_asset_id?: string;
  /** Director notes for the agent — tone, framing, callbacks to prior shots. */
  director_notes?: string;
}

/* ---- Voice lines ---- */

export interface VoiceLine {
  id: string;
  /** Position in the final video (seconds). */
  start: number;
  /** Spoken text. */
  text: string;
  /** Character id of the speaker. */
  speaker_id: string;
  /** Generated audio asset id. */
  audio_asset_id?: string;
}

/* ---- Music / SFX ---- */

export interface MusicCue {
  id: string;
  start: number;
  end: number;
  prompt: string;
  audio_asset_id?: string;
}

/* ---- Composition step ---- */

export interface FinalRender {
  /** The composite asset that becomes the YouTube upload. */
  asset_id?: string;
  /** Cuts manifest — order of shots, audio mix. */
  edit_decision_list_asset_id?: string;
  /** YouTube ID once uploaded. */
  youtube_id?: string;
  uploaded_at?: string;
}

/* ---- Top-level production manifest ---- */

export interface ProductionManifest {
  /** Lesson slug — links back to runtime manifest. */
  lesson_slug: string;
  /** Independent id for the production run. */
  id: string;
  created_at: string;
  updated_at?: string;
  characters: Character[];
  shots: Shot[];
  voice_lines: VoiceLine[];
  music?: MusicCue[];
  /** All assets, indexed for queue processing. */
  assets: Asset[];
  /** Final render once stitched + uploaded. */
  final: FinalRender;
  /** Cost ledger. */
  costs?: {
    estimated_usd: number;
    spent_usd: number;
    by_service?: Record<string, number>;
  };
}

/* ---- Helpers ---- */

export function pendingAssets(prod: ProductionManifest): Asset[] {
  return prod.assets.filter((a) => a.status === 'pending' || a.status === 'queued');
}

export function readyAssets(prod: ProductionManifest): Asset[] {
  return prod.assets.filter((a) => a.status === 'ready');
}

export function totalSpend(prod: ProductionManifest): number {
  return prod.assets.reduce((s, a) => s + (a.cost_usd ?? 0), 0);
}

export function shotByTime(prod: ProductionManifest, t: number): Shot | undefined {
  return prod.shots.find((sh) => t >= sh.start && t < sh.start + sh.duration);
}

/**
 * Walk every asset that's pending and emit it as a queue item.
 * The gen-pipeline agent watches this queue, picks items, calls the
 * right service, writes the result back into the production manifest.
 */
export interface QueueItem {
  lesson_slug: string;
  production_id: string;
  asset: Asset;
  /** Where to put the resulting file. */
  dest_path: string;
}

export function buildQueue(prod: ProductionManifest, lessonRoot: string): QueueItem[] {
  return pendingAssets(prod).map((asset) => ({
    lesson_slug: prod.lesson_slug,
    production_id: prod.id,
    asset,
    dest_path: `${lessonRoot}/${prod.lesson_slug}/assets/${asset.id}`,
  }));
}
