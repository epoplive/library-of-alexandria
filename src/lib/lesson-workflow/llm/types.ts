import type { ZodSchema } from 'zod';
import type { Diagnostic } from '../diagnostic-schema';
import type { StepLockEntry } from '../lockfile-schema';

export interface LlmJsonRequest<T> {
  prompt_template_id: string;
  prompt_template_version: string;
  prompt: string;
  schema: ZodSchema<T>;
  validator?: (parsed: T) => Diagnostic[];
  model_hint?: 'claude-opus' | 'gpt-5.5';
  /**
   * Maximum retry count after the first attempt. CliLlmClient defaults to 2
   * when omitted, for up to 3 total attempts.
   */
  max_retries?: number;
  temperature?: number;
}

export interface LlmJsonResult<T> {
  parsed: T;
  raw_response: string;
  model_id: string;
  run_id: string;
  diagnostics: Diagnostic[];
  elapsed_ms: number;
  lock_entry: StepLockEntry;
}

export interface LlmClient {
  runJson<T>(req: LlmJsonRequest<T>): Promise<LlmJsonResult<T>>;
}
