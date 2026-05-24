import { z } from 'zod';
import type { Diagnostic } from '../diagnostic-schema';
import { DiscoverySeedSchema } from '../ingest/types';

const idPattern = /^[a-z0-9][a-z0-9-]{0,79}$/;

export const ScenePlanSchema = z.object({
  id: z.string().regex(idPattern),
  title: z.string().min(1),
  eyebrow: z.string().min(1).optional(),
  summary: z.string().min(1),
  learning_objective: z.string().min(1),
  cast_in_scene: z.array(z.string().min(1)),
  has_game: z.boolean(),
  game_component_id: z.string().min(1).optional(),
  estimated_runtime_s: z.number().nonnegative(),
  source_section_id: z.string().min(1).optional(),
  source_digest_ids: z.array(z.string().min(1)).optional(),
}).strict();

export const ActPlanSchema = z.object({
  id: z.string().regex(idPattern),
  title: z.string().min(1),
  summary: z.string().min(1),
  scenes: z.array(ScenePlanSchema),
}).strict();

export const CurriculumPlanSchema = z.object({
  schema_version: z.literal('loa.curriculum.v1'),
  acts: z.array(ActPlanSchema),
  estimated_total_runtime_s: z.number().nonnegative(),
  discovery_seed_plan: z.array(DiscoverySeedSchema),
  notes: z.string().min(1).optional(),
  derivation: z.enum(['analytic', 'generative']),
}).strict().describe('loa.curriculum.v1');

export type ScenePlan = z.infer<typeof ScenePlanSchema>;
export type ActPlan = z.infer<typeof ActPlanSchema>;
export type CurriculumPlan = z.infer<typeof CurriculumPlanSchema>;

export interface CurriculumRunResult {
  plan: CurriculumPlan;
  diagnostics: Diagnostic[];
}
