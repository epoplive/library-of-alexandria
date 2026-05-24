import { z } from 'zod';
import { ContentMapSchema } from '../project-schema';

// Sentence ids are sha256(scene_id + '\n' + index + '\n' + canonical_text).slice(0, 16).
export const SentenceRecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  canonical_text: z.string().min(1),
  normalized_text: z.string().min(1),
  source_section_id: z.string().min(1).optional(),
  source_offset: z.number().int().nonnegative().optional(),
}).strict();

export const BEAT_INTENTS = ['opener', 'mechanism-explainer', 'demo', 'aside', 'closer', 'transition'] as const;
export const VISUAL_ROLES = ['background', 'character', 'callout', 'game', 'mixed'] as const;

export const BeatOutlineSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  intent: z.enum(BEAT_INTENTS),
  speaker_ids: z.array(z.string().min(1)),
  source_sentence_ids: z.array(z.string().min(1)),
  visual_role: z.enum(VISUAL_ROLES),
}).strict();

export const DiscoveryEntrySchema = z.object({
  key: z.string().min(1),
  brief: z.string().min(1),
  deep: z.string().min(1).optional(),
  source_section_id: z.string().min(1).optional(),
  source_digest_ids: z.array(z.string().min(1)).optional(),
}).strict();

export const SceneMapEntrySchema = z.object({
  scene_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  source_section_id: z.string().min(1).optional(),
  eyebrow: z.string().min(1).optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  learning_objective: z.string().min(1),
  cast_in_scene: z.array(z.string().min(1)),
  interactive_ref: z.object({ component_id: z.string().min(1) }).strict().optional(),
  discoveries: z.array(DiscoveryEntrySchema),
  beats: z.array(BeatOutlineSchema),
  sentences: z.array(SentenceRecordSchema),
}).strict();

export const SceneMapDetailSchema = z.object({
  scenes: z.array(SceneMapEntrySchema),
}).strict();

export const SceneMapArtifactSchema = z.object({
  schema_version: z.literal('loa.scene-map.v1'),
  content_map: ContentMapSchema,
  detail: SceneMapDetailSchema,
}).strict().describe('loa.scene-map.v1');

export type SentenceRecord = z.infer<typeof SentenceRecordSchema>;
export type BeatOutline = z.infer<typeof BeatOutlineSchema>;
export type DiscoveryEntry = z.infer<typeof DiscoveryEntrySchema>;
export type SceneMapEntry = z.infer<typeof SceneMapEntrySchema>;
export type SceneMapDetail = z.infer<typeof SceneMapDetailSchema>;
export type SceneMapArtifact = z.infer<typeof SceneMapArtifactSchema>;
