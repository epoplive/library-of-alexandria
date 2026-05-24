import { z } from 'zod';
import { DiagnosticSchema } from './diagnostic-schema';
import { ISODateTimeSchema } from './project-schema';
import { WORKFLOW_STEPS } from './types';

const sha256Pattern = /^[a-f0-9]{64}$/;

export const WorkflowStepSchema = z.enum(WORKFLOW_STEPS);

export const HashEntrySchema = z.object({
  path: z.string().min(1),
  hash: z.string().regex(sha256Pattern),
}).strict();

export const CommandInvocationSchema = z.object({
  provider: z.enum(['claude-cli', 'codex-cli', 'fake']),
  executable: z.string().min(1),
  args: z.array(z.string()),
}).strict();

const PendingStepLockEntrySchema = z.object({
  status: z.literal('pending'),
  input_hashes: z.array(HashEntrySchema),
  output_hashes: z.array(HashEntrySchema),
  composer_versions: z.record(z.string(), z.string()).optional(),
  diagnostics: z.array(DiagnosticSchema),
}).strict();

const CompletedStepLockEntrySchema = z.object({
  status: z.literal('completed'),
  input_hashes: z.array(HashEntrySchema),
  output_hashes: z.array(HashEntrySchema),
  prompt_template_id: z.string().min(1).optional(),
  prompt_template_version: z.string().min(1).optional(),
  prompt_template_hash: z.string().regex(sha256Pattern).optional(),
  schema_hash: z.string().regex(sha256Pattern).optional(),
  validator_hash: z.string().regex(sha256Pattern).optional(),
  validator_version: z.string().min(1).optional(),
  model_id: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  command: CommandInvocationSchema.optional(),
  raw_stdout_hash: z.string().regex(sha256Pattern).optional(),
  raw_stderr_hash: z.string().regex(sha256Pattern).optional(),
  parsed_json_hash: z.string().regex(sha256Pattern).optional(),
  composer_versions: z.record(z.string(), z.string()).optional(),
  diagnostics: z.array(DiagnosticSchema),
  elapsed_ms: z.number().int().nonnegative().optional(),
  completed_at: ISODateTimeSchema,
}).strict();

const FailedStepLockEntrySchema = z.object({
  status: z.literal('failed'),
  input_hashes: z.array(HashEntrySchema),
  output_hashes: z.array(HashEntrySchema),
  prompt_template_id: z.string().min(1).optional(),
  prompt_template_version: z.string().min(1).optional(),
  prompt_template_hash: z.string().regex(sha256Pattern).optional(),
  schema_hash: z.string().regex(sha256Pattern).optional(),
  validator_hash: z.string().regex(sha256Pattern).optional(),
  validator_version: z.string().min(1).optional(),
  model_id: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  command: CommandInvocationSchema.optional(),
  raw_stdout_hash: z.string().regex(sha256Pattern).optional(),
  raw_stderr_hash: z.string().regex(sha256Pattern).optional(),
  parsed_json_hash: z.string().regex(sha256Pattern).optional(),
  composer_versions: z.record(z.string(), z.string()).optional(),
  diagnostics: z.array(DiagnosticSchema),
  elapsed_ms: z.number().int().nonnegative().optional(),
  failed_at: ISODateTimeSchema,
  error: z.string().min(1),
}).strict();

export const StepLockEntrySchema = z.discriminatedUnion('status', [
  PendingStepLockEntrySchema,
  CompletedStepLockEntrySchema,
  FailedStepLockEntrySchema,
]);

export const StepLocksSchema = z.object({
  ingest: StepLockEntrySchema,
  curriculum: StepLockEntrySchema,
  'scene-map': StepLockEntrySchema,
  storyboard: StepLockEntrySchema,
  compose: StepLockEntrySchema,
  hydrate: StepLockEntrySchema,
  validate: StepLockEntrySchema,
}).strict();

export const ProjectLockSchema = z.object({
  schema_version: z.literal('loa.project-lock.v1'),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  locked: z.object({
    value: z.boolean(),
    reason: z.string().optional(),
    locked_at: ISODateTimeSchema.optional(),
    unlocked_at: ISODateTimeSchema.optional(),
  }).strict(),
  steps: StepLocksSchema,
}).strict();

export type HashEntry = z.infer<typeof HashEntrySchema>;
export type CommandInvocation = z.infer<typeof CommandInvocationSchema>;
export type StepLockEntry = z.infer<typeof StepLockEntrySchema>;
export type ProjectLock = z.infer<typeof ProjectLockSchema>;
