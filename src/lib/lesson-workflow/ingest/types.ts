import { z } from 'zod';
import type { LlmClient } from '../llm/types';
import { ISODateTimeSchema } from '../project-schema';
import { SOURCE_KINDS, type SourceKind } from '../types';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface SourceDigest {
  id: string;
  kind: 'url' | 'paper' | 'transcript' | 'section' | 'script-passage';
  required: boolean;
  status: 'ok' | 'quarantined';
  quarantine?: {
    code: 'fetch-failed' | 'parse-failed' | 'unsupported-mime' | 'auth-required' | 'too-large' | 'other';
    message: string;
    retry_policy?: { max_attempts: number; backoff_ms: number };
    excluded_reason: string;
  };
  content?: {
    title?: string;
    text?: string;
    key_points?: string[];
    named_entities?: string[];
    cite_string?: string;
  };
  raw_ref?: string;
}

export interface ExistingSection {
  index: number;
  source_section_id: string;
  eyebrow?: string;
  title: string;
  narration: string;
  child_component_ref?: string;
  child_props?: JsonObject;
  discoveries: { [key: string]: { brief: string; deep?: string } };
  source_offset: { start_line: number; end_line: number };
}

export interface AudioIndexSnapshot {
  lesson_slug: string;
  entries: Array<{
    hash: string;
    text: string;
    voice_id: string;
    file: string;
    timings?: Array<{ text: string; startMs: number; durationMs: number }>;
  }>;
}

export interface CastSeed {
  id: string;
  name: string;
  description?: string;
  voice_service?: string;
  voice_id?: string;
  voice_persona?: string;
}

export interface InteractiveRef {
  component_id: string;
  scene_hint?: string;
  file_ref?: string;
}

export interface DiscoverySeed {
  key: string;
  brief: string;
  deep?: string;
  source_section_id: string;
}

export interface ResearchBrief {
  topic: string;
  depth_target?: string;
  key_concepts: string[];
  named_figures: Array<{ name: string; relevance: string }>;
  papers: Array<{ title: string; authors?: string; year?: number; cite_string?: string }>;
  adjacent_stories?: string[];
  source_digest_ids: string[];
}

export interface ScriptOutline {
  total_runtime_estimate_s?: number;
  passages: Array<{
    id: string;
    text: string;
    intent: 'opener' | 'explanation' | 'aside' | 'demo' | 'closer';
    speaker_hint?: string;
  }>;
}

export interface LessonCorpus {
  schema_version: 'loa.lesson-corpus.v1';
  slug: string;
  source_kind: SourceKind;
  source_items: SourceDigest[];
  existing_sections?: ExistingSection[];
  research_brief?: ResearchBrief;
  script_outline?: ScriptOutline;
  cast_seed: CastSeed[];
  audio_index?: AudioIndexSnapshot;
  interactive_inventory: InteractiveRef[];
  discovery_inventory: DiscoverySeed[];
  provenance: {
    ingested_at: string;
    extractor_version: string;
    source_hash: string;
  };
}

export interface IngestContext {
  now: () => Date;
  llmClient?: LlmClient;
  run_id?: string;
}

export const EXTRACTOR_VERSION = 'p1b-ingest.1';

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
);

export const JsonObjectSchema: z.ZodType<JsonObject> = z.record(JsonValueSchema);

export const SourceDigestSchema: z.ZodType<SourceDigest> = z.object({
  id: z.string().min(1),
  kind: z.enum(['url', 'paper', 'transcript', 'section', 'script-passage']),
  required: z.boolean(),
  status: z.enum(['ok', 'quarantined']),
  quarantine: z.object({
    code: z.enum(['fetch-failed', 'parse-failed', 'unsupported-mime', 'auth-required', 'too-large', 'other']),
    message: z.string().min(1),
    retry_policy: z.object({
      max_attempts: z.number().int().nonnegative(),
      backoff_ms: z.number().int().nonnegative(),
    }).strict().optional(),
    excluded_reason: z.string().min(1),
  }).strict().optional(),
  content: z.object({
    title: z.string().optional(),
    text: z.string().optional(),
    key_points: z.array(z.string()).optional(),
    named_entities: z.array(z.string()).optional(),
    cite_string: z.string().optional(),
  }).strict().optional(),
  raw_ref: z.string().min(1).optional(),
}).strict();

const DiscoveryDetailSchema = z.object({
  brief: z.string(),
  deep: z.string().optional(),
}).strict();

export const ExistingSectionSchema: z.ZodType<ExistingSection> = z.object({
  index: z.number().int().nonnegative(),
  source_section_id: z.string().min(1),
  eyebrow: z.string().optional(),
  title: z.string(),
  narration: z.string(),
  child_component_ref: z.string().min(1).optional(),
  child_props: JsonObjectSchema.optional(),
  discoveries: z.record(DiscoveryDetailSchema),
  source_offset: z.object({
    start_line: z.number().int().positive(),
    end_line: z.number().int().positive(),
  }).strict(),
}).strict();

export const AudioIndexSnapshotSchema: z.ZodType<AudioIndexSnapshot> = z.object({
  lesson_slug: z.string().min(1),
  entries: z.array(z.object({
    hash: z.string().min(1),
    text: z.string(),
    voice_id: z.string().min(1),
    file: z.string().min(1),
    timings: z.array(z.object({
      text: z.string(),
      startMs: z.number().nonnegative(),
      durationMs: z.number().nonnegative(),
    }).strict()).optional(),
  }).strict()),
}).strict();

export const CastSeedSchema: z.ZodType<CastSeed> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  voice_service: z.string().optional(),
  voice_id: z.string().optional(),
  voice_persona: z.string().optional(),
}).strict();

export const InteractiveRefSchema: z.ZodType<InteractiveRef> = z.object({
  component_id: z.string().min(1),
  scene_hint: z.string().optional(),
  file_ref: z.string().min(1).optional(),
}).strict();

export const DiscoverySeedSchema: z.ZodType<DiscoverySeed> = z.object({
  key: z.string().min(1),
  brief: z.string(),
  deep: z.string().optional(),
  source_section_id: z.string().min(1),
}).strict();

export const ResearchBriefSchema: z.ZodType<ResearchBrief> = z.object({
  topic: z.string().min(1),
  depth_target: z.string().optional(),
  key_concepts: z.array(z.string()),
  named_figures: z.array(z.object({
    name: z.string().min(1),
    relevance: z.string(),
  }).strict()),
  papers: z.array(z.object({
    title: z.string().min(1),
    authors: z.string().optional(),
    year: z.number().int().optional(),
    cite_string: z.string().optional(),
  }).strict()),
  adjacent_stories: z.array(z.string()).optional(),
  source_digest_ids: z.array(z.string()),
}).strict().describe('loa.research-brief.v1');

export const ScriptOutlineSchema: z.ZodType<ScriptOutline> = z.object({
  total_runtime_estimate_s: z.number().nonnegative().optional(),
  passages: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    intent: z.enum(['opener', 'explanation', 'aside', 'demo', 'closer']),
    speaker_hint: z.string().optional(),
  }).strict()),
}).strict();

export const LessonCorpusSchema: z.ZodType<LessonCorpus> = z.object({
  schema_version: z.literal('loa.lesson-corpus.v1'),
  slug: z.string().min(1),
  source_kind: z.enum(SOURCE_KINDS),
  source_items: z.array(SourceDigestSchema),
  existing_sections: z.array(ExistingSectionSchema).optional(),
  research_brief: ResearchBriefSchema.optional(),
  script_outline: ScriptOutlineSchema.optional(),
  cast_seed: z.array(CastSeedSchema),
  audio_index: AudioIndexSnapshotSchema.optional(),
  interactive_inventory: z.array(InteractiveRefSchema),
  discovery_inventory: z.array(DiscoverySeedSchema),
  provenance: z.object({
    ingested_at: ISODateTimeSchema,
    extractor_version: z.string().min(1),
    source_hash: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
}).strict();
