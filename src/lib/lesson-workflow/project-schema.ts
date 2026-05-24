import { z } from 'zod';
import type {
  FundingBlock as LatticeFundingBlock,
  Provenance as LatticeProvenance,
  Tier,
} from '@/lib/lattice';
import { SOURCE_KINDS } from './types';

const sha256Pattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-z0-9][a-z0-9-]{0,79}$/;

export const ISODateTimeSchema = z.string().datetime({ offset: true });

export const TierSchema = z.custom<Tier>((value) => {
  if (typeof value !== 'string') return false;
  if (value === 'v0.1') return true;
  if (value === 'v0.3') return true;
  if (value === 'v0.6') return true;
  if (value === 'v0.9') return true;
  if (value === 'v1.0') return true;
  return /^mastery:\d+$/.test(value);
});

export const FundingBlockSchema: z.ZodType<LatticeFundingBlock> = z.object({
  production_cost_usd: z.number().nonnegative(),
  donations_received_usd: z.number().nonnegative(),
  donation_links: z.object({
    github_sponsors: z.string().url().optional(),
    ko_fi: z.string().url().optional(),
    open_collective: z.string().url().optional(),
  }).strict(),
  planned_improvements: z.array(z.object({
    slot: z.string().optional(),
    tier: TierSchema,
    cost_usd: z.number().nonnegative(),
    what: z.string().min(1),
  }).strict()),
  ledger: z.array(z.object({
    date: ISODateTimeSchema,
    kind: z.enum(['spend', 'donation']),
    amount_usd: z.number(),
    slot: z.string().optional(),
    note: z.string().optional(),
    donor: z.string().optional(),
  }).strict()).optional(),
}).strict();

export const ProvenanceSchema: z.ZodType<LatticeProvenance> = z.object({
  authors: z.array(z.string()),
  created_at: ISODateTimeSchema,
  updated_at: ISODateTimeSchema.optional(),
  license: z.string().min(1),
  forked_from: z.string().optional(),
}).strict();

export const ProjectArtifactRefSchema = z.object({
  path: z.string().min(1),
  hash: z.string().regex(sha256Pattern),
  bytes: z.number().int().nonnegative(),
  schema_ref: z.string().min(1),
  updated_at: ISODateTimeSchema,
}).strict();

export const SourceKindSchema = z.enum(SOURCE_KINDS);

const SourceDocumentRefSchema = z.object({
  path: z.string().min(1),
  hash: z.string().regex(sha256Pattern).optional(),
  media_type: z.enum(['text/markdown', 'text/plain', 'application/pdf', 'text/html', 'application/json']).optional(),
}).strict();

const ExistingLessonSourceSchema = z.object({
  kind: z.literal('existing-lesson'),
  lesson_ref: z.string().min(1),
  meta_ref: z.string().min(1),
  cast_ref: z.string().min(1),
  audio_index_ref: z.string().min(1),
}).strict();

const TopicSourceSchema = z.object({
  kind: z.literal('topic'),
  topic: z.string().min(1),
}).strict();

const SourcesSourceSchema = z.object({
  kind: z.literal('sources'),
  source_refs: z.array(SourceDocumentRefSchema),
}).strict();

const ScriptSourceSchema = z.object({
  kind: z.literal('script'),
  script_ref: z.string().min(1),
}).strict();

type SourceInput =
  | z.infer<typeof ExistingLessonSourceSchema>
  | z.infer<typeof TopicSourceSchema>
  | z.infer<typeof SourcesSourceSchema>
  | z.infer<typeof ScriptSourceSchema>
  | { kind: 'mixed'; sources: SourceInput[] };

export const SourceSchema: z.ZodType<SourceInput> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    ExistingLessonSourceSchema,
    TopicSourceSchema,
    SourcesSourceSchema,
    ScriptSourceSchema,
    z.object({
      kind: z.literal('mixed'),
      sources: z.array(SourceSchema),
    }).strict(),
  ]),
);

export const MapKeyframeSchema = z.object({
  at: z.number().nonnegative(),
  beat: z.string().min(1),
  slot_refs: z.array(z.string()),
  cue_refs: z.array(z.string()),
}).strict();

export const VariationSpecSchema = z.object({
  id: z.string().regex(idPattern),
  tier: TierSchema,
  purpose: z.string().min(1),
  slot_refs: z.array(z.string()),
  differs_from: z.string().regex(idPattern).optional(),
}).strict();

export const ShotAddressSchema = z.object({
  scene_id: z.string().regex(idPattern),
  shot_id: z.string().regex(idPattern),
}).strict();

export const ShotMapSchema = z.object({
  id: z.string().regex(idPattern),
  address: ShotAddressSchema,
  title: z.string().min(1),
  intent: z.string().min(1),
  spoken_text: z.string().optional(),
  cast_refs: z.array(z.string()),
  slot_refs: z.array(z.string()),
  keyframes: z.array(MapKeyframeSchema),
  variations: z.array(VariationSpecSchema),
}).strict();

export const SceneMapSchema = z.object({
  id: z.string().regex(idPattern),
  act_id: z.string().regex(idPattern),
  title: z.string().min(1),
  summary: z.string().min(1),
  shot_maps: z.array(ShotMapSchema),
  interactive_contract_refs: z.array(z.string()),
}).strict();

export const ActSchema = z.object({
  id: z.string().regex(idPattern),
  title: z.string().min(1),
  summary: z.string().min(1),
  scene_refs: z.array(z.string().regex(idPattern)),
}).strict();

export const ContentMapSchema = z.object({
  schema_version: z.literal('loa.content-map.v1'),
  lesson_slug: z.string().regex(idPattern),
  acts: z.array(ActSchema),
  scenes: z.array(SceneMapSchema),
}).strict();

export const LessonProjectSchema = z.object({
  schema_version: z.literal('loa.project.v1'),
  slug: z.string().regex(idPattern),
  identity: z.object({
    title: z.string().min(1),
    summary: z.string().optional(),
    tags: z.array(z.string()),
    tier: TierSchema,
    created_at: ISODateTimeSchema,
  }).strict(),
  source: SourceSchema,
  meta_ref: z.string().min(1),
  cast_ref: z.string().min(1),
  audio_index_ref: z.string().min(1).optional(),
  artifacts: z.object({
    lesson_input: ProjectArtifactRefSchema.optional(),
    curriculum: ProjectArtifactRefSchema.optional(),
    scene_map: ProjectArtifactRefSchema.optional(),
    storyboard: ProjectArtifactRefSchema.optional(),
    asset_manifest: ProjectArtifactRefSchema.optional(),
    parity_report: ProjectArtifactRefSchema.optional(),
  }).strict(),
  generated_production_ref: z.string().min(1),
  funding: FundingBlockSchema,
  provenance: ProvenanceSchema,
}).strict();

export type Source = z.infer<typeof SourceSchema>;
export type ContentMap = z.infer<typeof ContentMapSchema>;
export type Act = z.infer<typeof ActSchema>;
export type SceneMap = z.infer<typeof SceneMapSchema>;
export type ShotMap = z.infer<typeof ShotMapSchema>;
export type MapKeyframe = z.infer<typeof MapKeyframeSchema>;
export type VariationSpec = z.infer<typeof VariationSpecSchema>;
export type FundingBlock = z.infer<typeof FundingBlockSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type LessonProject = z.infer<typeof LessonProjectSchema>;
