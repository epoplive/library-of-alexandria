import { z } from 'zod';
import { DiagnosticSchema } from '../diagnostic-schema';
import { SourceKindSchema } from '../project-schema';

export const PARITY_CODES = [
  'parity.sentence.missing',
  'parity.sentence.extra',
  'parity.sentence.modified',
  'parity.sentence.moved',
  'parity.sentence.duplicate',
  'parity.speaker.drift',
  'parity.game.missing_component',
  'parity.game.uncontracted',
  'parity.discovery.missing',
  'parity.discovery.modified',
  'parity.section.metadata_drift',
] as const;

export const CONSISTENCY_CODES = [
  'consistency.cast.unknown',
  'consistency.slot.unknown',
  'consistency.shot.silent',
  'consistency.action.method_unknown',
  'consistency.interactive.unregistered',
  'consistency.transition.non_adjacent',
  'consistency.cue.field_overlap',
  'consistency.map.scene_empty',
] as const;

export const ParitySectionEntrySchema = z.object({
  source_section_id: z.string().min(1),
  eyebrow: z.string().optional(),
  title: z.string().min(1),
  scene_id: z.string().min(1).optional(),
  status: z.enum(['pass', 'fail', 'n/a']),
  sentence_counts: z.object({
    source: z.number().int().nonnegative(),
    storyboard: z.number().int().nonnegative(),
    matched: z.number().int().nonnegative(),
  }).strict(),
  diagnostics: z.array(DiagnosticSchema),
}).strict();

export const ParityReportSchema = z.object({
  schema_version: z.literal('loa.parity-report.v1'),
  lesson_slug: z.string().min(1),
  source_kind: SourceKindSchema,
  applicable: z.boolean(),
  per_section: z.array(ParitySectionEntrySchema),
  overall_status: z.enum(['pass', 'fail', 'n/a']),
}).strict();

export const ConsistencyReportSchema = z.object({
  schema_version: z.literal('loa.consistency-report.v1'),
  lesson_slug: z.string().min(1),
  gates: z.object({
    cast_unknown: z.array(DiagnosticSchema),
    slot_unknown: z.array(DiagnosticSchema),
    shot_silent: z.array(DiagnosticSchema),
    action_method_unknown: z.array(DiagnosticSchema),
    interactive_unregistered: z.array(DiagnosticSchema),
    transition_non_adjacent: z.array(DiagnosticSchema),
    field_overlap: z.array(DiagnosticSchema),
    map_completeness: z.array(DiagnosticSchema),
  }).strict(),
  overall_status: z.enum(['pass', 'fail']),
}).strict();

export const InteractiveContractSummarySchema = z.object({
  component_id: z.string().min(1),
  methods: z.array(z.string().min(1)),
}).strict();

export const InteractiveRegistrySummarySchema = z.object({
  size: z.number().int().nonnegative(),
  complete: z.boolean(),
  component_ids: z.array(z.string().min(1)),
  contracts: z.array(InteractiveContractSummarySchema),
}).strict();

export const HydrateValidationSnapshotSchema = z.object({
  tier_v0_1: z.enum(['pass', 'fail', 'pending']),
  tier_v0_3: z.enum(['pass', 'fail', 'pending']).optional(),
  asset_coverage: z.enum(['ok', 'partial', 'missing']),
  character_sprite_coverage: z.enum(['ok', 'partial', 'missing']),
}).strict();

export const AggregatedValidationSchema = z.object({
  parity: z.enum(['pass', 'fail', 'n/a']),
  self_consistency: z.enum(['pass', 'fail']),
  map_completeness: z.enum(['pass', 'fail']),
  tier_v0_1: z.enum(['pass', 'fail', 'pending']),
  tier_v0_3: z.enum(['pass', 'fail', 'pending']),
  asset_coverage: z.enum(['ok', 'partial', 'missing']),
  character_sprite_coverage: z.enum(['ok', 'partial', 'missing']),
}).strict();

export type ParitySectionEntry = z.infer<typeof ParitySectionEntrySchema>;
export type ParityReport = z.infer<typeof ParityReportSchema>;
export type ConsistencyReport = z.infer<typeof ConsistencyReportSchema>;
export type InteractiveContractSummary = z.infer<typeof InteractiveContractSummarySchema>;
export type InteractiveRegistrySummary = z.infer<typeof InteractiveRegistrySummarySchema>;
export type HydrateValidationSnapshot = z.infer<typeof HydrateValidationSnapshotSchema>;
export type AggregatedValidation = z.infer<typeof AggregatedValidationSchema>;
