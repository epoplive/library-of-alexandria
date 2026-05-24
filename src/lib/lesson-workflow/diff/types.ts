import { z } from 'zod';
import { DiagnosticSchema } from '../diagnostic-schema';

const SectionDiffSourceSchema = z.object({
  eyebrow: z.string(),
  title: z.string().min(1),
  sentence_count: z.number().int().nonnegative(),
  discovery_keys: z.array(z.string().min(1)),
  game_component_id: z.string().min(1).optional(),
}).strict();

const SectionDiffCinematicSchema = z.object({
  eyebrow: z.string().min(1).optional(),
  title: z.string().min(1),
  sentence_count: z.number().int().nonnegative(),
  shot_count: z.number().int().nonnegative(),
  shot_kinds: z.array(z.string().min(1)),
  discovery_keys: z.array(z.string().min(1)),
  interactive_component_id: z.string().min(1).optional(),
}).strict();

const SectionDiffParitySchema = z.object({
  sentence_match: z.boolean(),
  discovery_match: z.boolean(),
  metadata_match: z.boolean(),
  game_match: z.boolean(),
}).strict();

export const SectionDiffSchema = z.object({
  schema_version: z.literal('loa.section-diff.v1'),
  section_id: z.string().min(1),
  scene_id: z.string().min(1),
  source: SectionDiffSourceSchema,
  cinematic: SectionDiffCinematicSchema,
  parity: SectionDiffParitySchema,
  parity_diagnostics: z.array(DiagnosticSchema),
}).strict();

export const LessonDiffSchema = z.object({
  schema_version: z.literal('loa.lesson-diff.v1'),
  lesson_slug: z.string().min(1),
  sections: z.array(SectionDiffSchema),
}).strict();

export const RunSectionDiffArgsSchema = z.object({
  slug: z.string().min(1),
  section_id: z.string().min(1),
  rootDir: z.string().min(1).optional(),
}).strict();

export const RunLessonDiffArgsSchema = z.object({
  slug: z.string().min(1),
  rootDir: z.string().min(1).optional(),
}).strict();

export type SectionDiff = z.infer<typeof SectionDiffSchema>;
export type LessonDiff = z.infer<typeof LessonDiffSchema>;
export type RunSectionDiffArgs = z.infer<typeof RunSectionDiffArgsSchema>;
export type RunLessonDiffArgs = z.infer<typeof RunLessonDiffArgsSchema>;
