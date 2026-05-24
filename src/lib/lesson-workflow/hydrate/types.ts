import { z } from 'zod';
import type { AssetManifest, CastId, SlotId, Tier } from '@/lib/lattice';
import { TierSchema } from '../project-schema';
import type { Diagnostic } from '../diagnostic-schema';

export const HydrateTargetTierSchema = z.literal('v0.1');

export const AudioTimingSchema = z.object({
  text: z.string(),
  startMs: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
}).strict();

export const AudioIndexEntrySchema = z.object({
  hash: z.string().min(1),
  text: z.string(),
  voice_id: z.string().min(1),
  file: z.string().min(1),
  speaker_id: z.string().min(1).optional(),
  source_file: z.string().min(1).optional(),
  timings: z.array(AudioTimingSchema).optional(),
}).strict();

export const AudioIndexSchema = z.object({
  lesson: z.string().min(1).optional(),
  lesson_slug: z.string().min(1).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
  voices: z.array(z.string().min(1)).optional(),
  entries: z.array(AudioIndexEntrySchema),
}).strict();

export type AudioIndexEntry = z.infer<typeof AudioIndexEntrySchema>;
export type AudioIndex = z.infer<typeof AudioIndexSchema>;

const AudioVoPendingAssetSpecSchema = z.object({
  kind: z.literal('audio-vo'),
  cast_id: z.string(),
  voice_id: z.string(),
  text: z.string(),
}).strict();

const AudioDialoguePendingAssetSpecSchema = z.object({
  kind: z.literal('audio-dialogue'),
  cast_id: z.string(),
  voice_id: z.string(),
  text: z.string(),
}).strict();

const CharacterPosePendingAssetSpecSchema = z.object({
  kind: z.literal('character-pose'),
  cast_id: z.string(),
  pose_name: z.string(),
}).strict();

const ImagePendingAssetSpecSchema = z.object({
  kind: z.literal('image'),
  description: z.string(),
}).strict();

const VideoPendingAssetSpecSchema = z.object({
  kind: z.literal('video'),
  description: z.string(),
}).strict();

export const PendingAssetSpecSchema = z.discriminatedUnion('kind', [
  AudioVoPendingAssetSpecSchema,
  AudioDialoguePendingAssetSpecSchema,
  CharacterPosePendingAssetSpecSchema,
  ImagePendingAssetSpecSchema,
  VideoPendingAssetSpecSchema,
]);

export type PendingAssetSpec = z.infer<typeof PendingAssetSpecSchema>;

export const PendingAssetSchema = z.object({
  slot_id: z.string().min(1),
  kind: z.enum(['audio-vo', 'audio-dialogue', 'character-pose', 'image', 'video']),
  target_tier: TierSchema,
  spec: PendingAssetSpecSchema,
  priority: z.enum(['required', 'optional']),
}).strict();

export interface PendingAsset {
  slot_id: SlotId;
  kind: 'audio-vo' | 'audio-dialogue' | 'character-pose' | 'image' | 'video';
  target_tier: Tier;
  spec: PendingAssetSpec;
  priority: 'required' | 'optional';
}

export const PendingAssetsArtifactSchema = z.object({
  schema_version: z.literal('loa.pending-assets.v1'),
  assets: z.array(PendingAssetSchema),
}).strict().describe('loa.pending-assets.v1');

export interface PendingAssetsArtifact {
  schema_version: 'loa.pending-assets.v1';
  assets: PendingAsset[];
}

export interface MissingAudioAsset {
  slot_id: SlotId;
  kind: 'audio-vo' | 'audio-dialogue';
  cast_id: CastId;
  voice_id: string;
  text: string;
}

export interface PoseSlotSpec {
  slot_id: SlotId;
  cast_id: CastId;
  pose_name: string;
}

export interface HydrateValidation {
  tier_v0_1: 'pass' | 'fail';
  asset_coverage: 'ok' | 'partial' | 'missing';
  character_sprite_coverage: 'ok' | 'partial' | 'missing';
}

export interface HydrateStats {
  slots_total: number;
  attached: number;
  audio_attached: number;
  sprite_attached: number;
  audio_slots_total: number;
  audio_slots_ready: number;
  spoken_lines_total: number;
  pending_required: number;
  pending_optional: number;
}

export interface HydrateResult {
  manifest: AssetManifest;
  pendingAssets: PendingAssetsArtifact;
  diagnostics: Diagnostic[];
  validation: HydrateValidation;
  stats: HydrateStats;
}
