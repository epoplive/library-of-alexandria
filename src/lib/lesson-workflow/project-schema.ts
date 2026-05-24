import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  SceneId,
  ShotId,
  FundingBlock as LatticeFundingBlock,
  Provenance as LatticeProvenance,
  Tier,
} from '@/lib/lattice';
import { SHOT_PLAN_KINDS, SOURCE_KINDS, WORKFLOW_STEPS } from './types';

const sha256Pattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function defaultMapKeyframeId(
  scene_id: SceneId,
  shot_id: ShotId,
  at: number,
  label?: string,
): string {
  const labelBasis = label !== undefined ? label : '';
  return createHash('sha256')
    .update(`${scene_id}/${shot_id}|${at}|${labelBasis}`)
    .digest('hex')
    .slice(0, 16);
}

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

export const WorkflowStepStatusSchema = z.enum(['pending', 'running', 'ok', 'failed']);

export const WorkflowStepStateSchema = z.object({
  status: WorkflowStepStatusSchema,
  last_ran_at: ISODateTimeSchema.optional(),
  artifact_ref: z.string().min(1).optional(),
}).strict();

export const WorkflowStateSchema = z.record(
  z.enum(WORKFLOW_STEPS),
  WorkflowStepStateSchema,
);

export const ValidationStateSchema = z.object({
  parity: z.enum(['pass', 'fail', 'n/a']).optional(),
  self_consistency: z.enum(['pass', 'fail']).optional(),
  map_completeness: z.enum(['pass', 'fail']).optional(),
  tier_v0_1: z.enum(['pass', 'fail', 'pending']).optional(),
  tier_v0_3: z.enum(['pass', 'fail', 'pending']).optional(),
  asset_coverage: z.enum(['ok', 'partial', 'missing']).optional(),
  character_sprite_coverage: z.enum(['ok', 'partial', 'missing']).optional(),
}).strict();

export const TimelineRefSchema = z.object({
  path: z.string().min(1),
  hash: z.string().regex(sha256Pattern),
}).strict();

const SourceDocumentRefSchema = z.object({
  path: z.string().min(1),
  hash: z.string().regex(sha256Pattern).optional(),
  media_type: z.enum(['text/markdown', 'text/plain', 'application/pdf', 'text/html', 'application/json']).optional(),
}).strict();

const ExistingLessonSourceSchema = z.object({
  kind: z.literal('existing-lesson'),
  sections_ref: z.string().min(1),
}).strict();

const TopicSourceSchema = z.object({
  kind: z.literal('topic'),
  subject: z.string().min(1),
  depth_target: z.string().min(1).optional(),
}).strict();

const SourcesSourceSchema = z.object({
  kind: z.literal('sources'),
  source_refs: z.array(SourceDocumentRefSchema).optional(),
  urls: z.array(z.string().url()).optional(),
  papers: z.array(z.string().min(1)).optional(),
  transcripts: z.array(z.string().min(1)).optional(),
}).strict();

const ScriptSourceSchema = z.object({
  kind: z.literal('script'),
  script_path: z.string().min(1),
}).strict();

type SourceInput =
  | z.infer<typeof ExistingLessonSourceSchema>
  | z.infer<typeof TopicSourceSchema>
  | z.infer<typeof SourcesSourceSchema>
  | z.infer<typeof ScriptSourceSchema>
  | { kind: 'mixed'; inputs: SourceInput[] };

export const SourceSchema: z.ZodType<SourceInput> = z.lazy(() =>
  z.union([
    z.discriminatedUnion('kind', [
      ExistingLessonSourceSchema,
      TopicSourceSchema,
      SourcesSourceSchema,
      ScriptSourceSchema,
      z.object({
        kind: z.literal('mixed'),
        inputs: z.array(SourceSchema),
      }).strict(),
    ]),
    z.never({ message: 'ingest.source.unsupported' }),
  ]),
);

export const MapKeyframeSchema = z.object({
  id: z.string().regex(idPattern),
  shot_id: z.string().regex(idPattern),
  at: z.number().nonnegative(),
  label: z.string().min(1).optional(),
  importance: z.enum(['primary', 'secondary']).optional(),
}).strict();

const MapKeyframeInputSchema = MapKeyframeSchema.extend({
  id: z.string().regex(idPattern).optional(),
});

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
  kind: z.enum(SHOT_PLAN_KINDS),
  speakers: z.array(z.string().min(1)),
  duration_estimate_s: z.number().nonnegative(),
  keyframes: z.array(MapKeyframeSchema),
}).strict();

const ShotMapInputSchema = ShotMapSchema.extend({
  keyframes: z.array(MapKeyframeInputSchema),
});

const SceneMapInputSchema = z.object({
  id: z.string().regex(idPattern),
  source_section_id: z.string().min(1).optional(),
  eyebrow: z.string().min(1).optional(),
  title: z.string().min(1),
  summary: z.string().min(1).optional(),
  learning_objective: z.string().min(1).optional(),
  cast_in_scene: z.array(z.string().min(1)),
  interactive_ref: z.object({
    component_id: z.string().min(1),
  }).strict().optional(),
  discoveries: z.array(z.string().min(1)),
  shots: z.array(ShotMapInputSchema),
}).strict();

export const SceneMapSchema = SceneMapInputSchema.transform((sceneMap) => ({
  ...sceneMap,
  shots: sceneMap.shots.map((shotMap) => ({
    ...shotMap,
    keyframes: shotMap.keyframes.map((keyframe) => ({
      ...keyframe,
      id: keyframe.id !== undefined
        ? keyframe.id
        : defaultMapKeyframeId(sceneMap.id, keyframe.shot_id, keyframe.at, keyframe.label),
    })),
  })),
}));

export const ActSchema = z.object({
  id: z.string().regex(idPattern),
  title: z.string().min(1),
  summary: z.string().min(1).optional(),
  scenes: z.array(SceneMapSchema),
}).strict();

export const ContentMapSchema = z.object({
  schema_version: z.literal('loa.content-map.v1'),
  lesson_slug: z.string().regex(idPattern),
  acts: z.array(ActSchema),
}).strict();

export const LessonProjectSchema = z.object({
  schema_version: z.literal('loa.project.v1'),
  slug: z.string().regex(idPattern),
  identity: z.object({
    lesson_id: z.string().regex(idPattern),
    title: z.string().min(1),
    summary: z.string().optional(),
    tags: z.array(z.string()),
    current_tier: TierSchema,
    authors: z.array(z.string()),
  }).strict(),
  source: SourceSchema,
  cast_ref: z.string().min(1),
  artifacts: z.object({
    lesson_input: ProjectArtifactRefSchema.optional(),
    curriculum: ProjectArtifactRefSchema.optional(),
    scene_map: ProjectArtifactRefSchema.optional(),
    storyboard: ProjectArtifactRefSchema.optional(),
    asset_manifest: ProjectArtifactRefSchema.optional(),
    pending_assets: ProjectArtifactRefSchema.optional(),
    parity_report: ProjectArtifactRefSchema.optional(),
    consistency_report: ProjectArtifactRefSchema.optional(),
  }).strict(),
  timeline_ref: TimelineRefSchema.optional(),
  workflow: WorkflowStateSchema.optional(),
  validation: ValidationStateSchema.optional(),
  variations: z.array(VariationSpecSchema),
  funding: FundingBlockSchema,
  provenance: ProvenanceSchema,
  meta_overrides: z.record(z.string(), z.unknown()).optional(),
  locked: z.object({
    at: ISODateTimeSchema,
    by: z.string().min(1),
    reason: z.string().optional(),
  }).strict().optional(),
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
export type WorkflowStepStatus = z.infer<typeof WorkflowStepStatusSchema>;
export type LessonProject = z.infer<typeof LessonProjectSchema>;
