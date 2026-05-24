import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { canonicalJsonStringify, sha256 } from '../artifact-ref';
import { DiagnosticSchema, type Diagnostic } from '../diagnostic-schema';
import { StepLockEntrySchema, type StepLockEntry } from '../lockfile-schema';
import type { LlmClient, LlmJsonRequest, LlmJsonResult } from './types';

interface FakeLlmClientOptions {
  responses: ReadonlyMap<string, readonly unknown[]>;
  runsDir?: string;
}

export class FakeLlmClient implements LlmClient {
  private readonly responses: ReadonlyMap<string, readonly unknown[]>;
  private readonly runsDir: string | undefined;

  constructor(options: FakeLlmClientOptions) {
    this.responses = options.responses;
    this.runsDir = options.runsDir;
  }

  async runJson<T>(req: LlmJsonRequest<T>): Promise<LlmJsonResult<T>> {
    const started = performance.now();
    const promptHash = sha256(req.prompt);
    const responses = this.responses.get(promptHash);
    if (responses === undefined) throw new Error(`no fake response for prompt hash ${promptHash}`);
    const maxRetries = req.max_retries === undefined ? 0 : req.max_retries;
    const allDiagnostics: Diagnostic[] = [];
    const runId = `fake_${promptHash.slice(0, 12)}`;
    let lastRaw = '';

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const responseIndex = attempt < responses.length ? attempt : responses.length - 1;
      const candidate = responses[responseIndex];
      lastRaw = canonicalJsonStringify(candidate);
      const parsed = req.schema.parse(candidate);
      const diagnostics = req.validator === undefined
        ? []
        : req.validator(parsed).map((diag) => DiagnosticSchema.parse(diag));
      allDiagnostics.push(...diagnostics);
      await this.writeAttempt(runId, attempt + 1, parsed, diagnostics);
      if (!diagnostics.some((diag) => diag.severity === 'error')) {
        const elapsedMs = Math.round(performance.now() - started);
        const parsedJson = canonicalJsonStringify(parsed);
        const lockEntry = completedFakeLockEntry({
          req,
          diagnostics: allDiagnostics,
          elapsedMs,
          promptHash,
          runId,
          raw: lastRaw,
          parsedJson,
        });
        await this.writeRoot(runId, lastRaw, parsedJson, allDiagnostics, lockEntry);
        return {
          parsed,
          raw_response: lastRaw,
          model_id: req.model_hint === undefined ? 'fake' : req.model_hint,
          run_id: runId,
          diagnostics: allDiagnostics,
          elapsed_ms: elapsedMs,
          lock_entry: lockEntry,
        };
      }
    }

    throw new Error(`fake LLM response failed validation after ${maxRetries + 1} attempt(s)`);
  }

  private async writeAttempt<T>(
    runId: string,
    attempt: number,
    parsed: T,
    diagnostics: Diagnostic[],
  ): Promise<void> {
    if (this.runsDir === undefined) return;
    const attemptDir = path.join(this.runsDir, runId, `attempt-${attempt}`);
    await mkdir(attemptDir, { recursive: true });
    await writeFile(path.join(attemptDir, 'parsed.json'), canonicalJsonStringify(parsed), 'utf8');
    await writeFile(path.join(attemptDir, 'diagnostics.json'), canonicalJsonStringify(diagnostics), 'utf8');
  }

  private async writeRoot(
    runId: string,
    rawJson: string,
    parsedJson: string,
    diagnostics: Diagnostic[],
    lockEntry: StepLockEntry,
  ): Promise<void> {
    if (this.runsDir === undefined) return;
    const runDir = path.join(this.runsDir, runId);
    await mkdir(runDir, { recursive: true });
    await writeFile(path.join(runDir, 'raw.json'), rawJson, 'utf8');
    await writeFile(path.join(runDir, 'parsed.json'), parsedJson, 'utf8');
    await writeFile(path.join(runDir, 'diagnostics.json'), canonicalJsonStringify(diagnostics), 'utf8');
    await writeFile(path.join(runDir, 'lock-entry.json'), canonicalJsonStringify(lockEntry), 'utf8');
  }
}

function completedFakeLockEntry<T>(args: {
  req: LlmJsonRequest<T>;
  diagnostics: Diagnostic[];
  elapsedMs: number;
  promptHash: string;
  runId: string;
  raw: string;
  parsedJson: string;
}): StepLockEntry {
  const schemaHashInput = args.req.schema.description === undefined
    ? args.req.prompt_template_id
    : args.req.schema.description;
  const schemaHash = sha256(schemaHashInput);
  return StepLockEntrySchema.parse({
    status: 'completed',
    input_hashes: [
      { path: 'prompt', hash: args.promptHash },
      { path: 'schema', hash: schemaHash },
    ],
    output_hashes: [
      { path: `runs/${args.runId}/raw.json`, hash: sha256(args.raw) },
      { path: `runs/${args.runId}/parsed.json`, hash: sha256(args.parsedJson) },
    ],
    prompt_template_id: args.req.prompt_template_id,
    prompt_template_version: args.req.prompt_template_version,
    prompt_template_hash: args.promptHash,
    schema_hash: schemaHash,
    model_id: args.req.model_hint === undefined ? 'fake' : args.req.model_hint,
    run_id: args.runId,
    command: {
      provider: 'fake',
      executable: 'fake',
      args: [],
    },
    raw_stdout_hash: sha256(args.raw),
    raw_stderr_hash: sha256(''),
    parsed_json_hash: sha256(args.parsedJson),
    diagnostics: args.diagnostics,
    elapsed_ms: args.elapsedMs,
    completed_at: new Date().toISOString(),
  });
}
