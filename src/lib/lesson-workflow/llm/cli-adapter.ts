import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { ZodError, type ZodIssue, type ZodSchema } from 'zod';
import { canonicalJsonStringify, sha256 } from '../artifact-ref';
import { DiagnosticSchema, type Diagnostic } from '../diagnostic-schema';
import { type CommandInvocation, StepLockEntrySchema, type StepLockEntry } from '../lockfile-schema';
import { formatDiagnostics, mkDiagnostic } from './diagnostics';
import type { LlmClient, LlmJsonRequest, LlmJsonResult } from './types';

interface CliCommandSpec {
  provider: CommandInvocation['provider'];
  executable: string;
  args: string[];
  model_id: string;
}

interface CliCommands {
  claude_opus: CliCommandSpec;
  gpt_5_5: CliCommandSpec;
}

interface CliAdapterOptions {
  runsDir: string;
  commands?: Partial<CliCommands>;
}

interface AttemptResult<T> {
  raw_stdout: string;
  raw_stderr: string;
  parsed: T;
  diagnostics: Diagnostic[];
  command: CliCommandSpec;
}

type Hashable = string | number | boolean | null | Hashable[] | { [key: string]: Hashable };

type ModelHint = LlmJsonRequest<string>['model_hint'];

const DEFAULT_COMMANDS: CliCommands = {
  claude_opus: {
    provider: 'claude-cli',
    executable: 'claude',
    args: ['-p', '--output-format', 'json', '--model', 'opus'],
    model_id: 'claude-opus',
  },
  gpt_5_5: {
    provider: 'codex-cli',
    executable: 'codex',
    args: ['exec', '--json', '--model', 'gpt-5.5'],
    model_id: 'gpt-5.5',
  },
};

export class CliLlmClient implements LlmClient {
  private readonly runsDir: string;
  private readonly commands: CliCommands;

  constructor(options: CliAdapterOptions) {
    this.runsDir = options.runsDir;
    const commands = options.commands === undefined ? {} : options.commands;
    const claudeOpus = commands.claude_opus === undefined
      ? DEFAULT_COMMANDS.claude_opus
      : commands.claude_opus;
    const gpt55 = commands.gpt_5_5 === undefined
      ? DEFAULT_COMMANDS.gpt_5_5
      : commands.gpt_5_5;
    this.commands = {
      claude_opus: claudeOpus,
      gpt_5_5: gpt55,
    };
  }

  async runJson<T>(req: LlmJsonRequest<T>): Promise<LlmJsonResult<T>> {
    const started = performance.now();
    const promptHash = sha256(req.prompt);
    const schemaHash = hashSchema(req.schema);
    const runId = `run_${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID()}`;
    const runDir = path.join(this.runsDir, runId);
    await mkdir(runDir, { recursive: true });

    const maxRetries = req.max_retries === undefined ? 0 : req.max_retries;
    const command = this.commandFor(req.model_hint);
    const allDiagnostics: Diagnostic[] = [];
    let lastRawStdout = '';
    let lastRawStderr = '';
    let lastParsed: T | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const prompt = attempt === 0 ? req.prompt : retryPrompt(req.prompt, allDiagnostics);
      const attemptResult = await this.runAttempt(req, prompt, command);
      lastRawStdout = attemptResult.raw_stdout;
      lastRawStderr = attemptResult.raw_stderr;
      lastParsed = attemptResult.parsed;
      allDiagnostics.push(...attemptResult.diagnostics);
      await writeAttempt(runDir, attempt + 1, attemptResult);
      if (!hasErrorDiagnostics(attemptResult.diagnostics)) {
        const elapsedMs = Math.round(performance.now() - started);
        const parsedJson = canonicalJsonStringify(attemptResult.parsed);
        const lockEntry = completedLockEntry({
          req,
          command,
          diagnostics: allDiagnostics,
          elapsedMs,
          promptHash,
          schemaHash,
          runId,
          rawStdout: attemptResult.raw_stdout,
          rawStderr: attemptResult.raw_stderr,
          parsedJson,
        });
        await writeFile(path.join(runDir, 'stdout.txt'), attemptResult.raw_stdout, 'utf8');
        await writeFile(path.join(runDir, 'stderr.txt'), attemptResult.raw_stderr, 'utf8');
        await writeFile(path.join(runDir, 'parsed.json'), parsedJson, 'utf8');
        await writeFile(path.join(runDir, 'diagnostics.json'), canonicalJsonStringify(allDiagnostics), 'utf8');
        await writeFile(path.join(runDir, 'lock-entry.json'), canonicalJsonStringify(lockEntry), 'utf8');
        return {
          parsed: attemptResult.parsed,
          raw_response: attemptResult.raw_stdout,
          model_id: command.model_id,
          run_id: runId,
          diagnostics: allDiagnostics,
          elapsed_ms: elapsedMs,
          lock_entry: lockEntry,
        };
      }
    }

    const elapsedMs = Math.round(performance.now() - started);
    const parsedJson = lastParsed === undefined ? '' : canonicalJsonStringify(lastParsed);
    const failedEntry = failedLockEntry({
      req,
      command,
      diagnostics: allDiagnostics,
      elapsedMs,
      promptHash,
      schemaHash,
      runId,
      rawStdout: lastRawStdout,
      rawStderr: lastRawStderr,
      parsedJson,
      error: 'LLM JSON request failed validation after all retries',
    });
    await writeFile(path.join(runDir, 'stdout.txt'), lastRawStdout, 'utf8');
    await writeFile(path.join(runDir, 'stderr.txt'), lastRawStderr, 'utf8');
    await writeFile(path.join(runDir, 'parsed.json'), parsedJson, 'utf8');
    await writeFile(path.join(runDir, 'diagnostics.json'), canonicalJsonStringify(allDiagnostics), 'utf8');
    await writeFile(path.join(runDir, 'lock-entry.json'), canonicalJsonStringify(failedEntry), 'utf8');
    throw new Error(`LLM JSON request failed validation after ${maxRetries + 1} attempt(s)`);
  }

  private commandFor(modelHint: ModelHint): CliCommandSpec {
    switch (modelHint) {
      case 'claude-opus':
        return this.commands.claude_opus;
      case 'gpt-5.5':
        return this.commands.gpt_5_5;
      case undefined:
        throw new Error('CliLlmClient requires model_hint to choose claude-opus or gpt-5.5');
    }
  }

  private async runAttempt<T>(
    req: LlmJsonRequest<T>,
    prompt: string,
    command: CliCommandSpec,
  ): Promise<AttemptResult<T>> {
    const { stdout, stderr } = await spawnText(command.executable, command.args, prompt);
    const parsed = parseStrictJson(stdout, req.schema);
    const validatorDiagnostics = req.validator === undefined ? [] : req.validator(parsed);
    const diagnostics = validatorDiagnostics.map((diag) => DiagnosticSchema.parse(diag));
    return {
      raw_stdout: stdout,
      raw_stderr: stderr,
      parsed,
      diagnostics,
      command,
    };
  }
}

async function spawnText(
  executable: string,
  args: string[],
  input: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${executable} exited with code ${code}: ${stderr}`));
      }
    });
    child.stdin.end(input);
  });
}

function parseStrictJson<T>(stdout: string, schema: ZodSchema<T>): T {
  let parsedStdout: unknown;
  try {
    parsedStdout = JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON';
    throw new Error(`LLM stdout was not JSON: ${message}`);
  }

  const direct = schema.safeParse(parsedStdout);
  if (direct.success) return direct.data;

  if (parsedStdout !== null && typeof parsedStdout === 'object' && !Array.isArray(parsedStdout)) {
    const response = Object.entries(parsedStdout).find(([key]) => key === 'response');
    if (response !== undefined && typeof response[1] === 'string') {
      const responseJson = JSON.parse(response[1]);
      return schema.parse(responseJson);
    }
  }

  throw direct.error;
}

function diagnosticsFromZod(error: ZodError): Diagnostic[] {
  return error.issues.map((issue) => diagnosticFromZodIssue(issue));
}

function diagnosticFromZodIssue(issue: ZodIssue): Diagnostic {
  return mkDiagnostic({
    code: `zod.${issue.code}`,
    path: issue.path,
    actual: 'received' in issue ? String(issue.received) : undefined,
    expected: 'expected' in issue ? String(issue.expected) : issue.message,
    repair: issue.message,
    severity: 'error',
  });
}

function retryPrompt(prompt: string, diagnostics: Diagnostic[]): string {
  return `${prompt}

The previous response failed validation. Return only corrected JSON.

Diagnostics:
${formatDiagnostics(diagnostics)}`;
}

function hasErrorDiagnostics(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diag) => diag.severity === 'error');
}

async function writeAttempt<T>(runDir: string, attempt: number, result: AttemptResult<T>): Promise<void> {
  const attemptDir = path.join(runDir, `attempt-${attempt}`);
  await mkdir(attemptDir, { recursive: true });
  await writeFile(path.join(attemptDir, 'stdout.txt'), result.raw_stdout, 'utf8');
  await writeFile(path.join(attemptDir, 'stderr.txt'), result.raw_stderr, 'utf8');
  await writeFile(path.join(attemptDir, 'parsed.json'), canonicalJsonStringify(result.parsed), 'utf8');
  await writeFile(path.join(attemptDir, 'diagnostics.json'), canonicalJsonStringify(result.diagnostics), 'utf8');
}

function completedLockEntry<T>(args: {
  req: LlmJsonRequest<T>;
  command: CliCommandSpec;
  diagnostics: Diagnostic[];
  elapsedMs: number;
  promptHash: string;
  schemaHash: string;
  runId: string;
  rawStdout: string;
  rawStderr: string;
  parsedJson: string;
}): StepLockEntry {
  return StepLockEntrySchema.parse({
    status: 'completed',
    input_hashes: [
      { path: 'prompt', hash: args.promptHash },
      { path: 'schema', hash: args.schemaHash },
    ],
    output_hashes: [
      { path: `runs/${args.runId}/stdout.txt`, hash: sha256(args.rawStdout) },
      { path: `runs/${args.runId}/stderr.txt`, hash: sha256(args.rawStderr) },
      { path: `runs/${args.runId}/parsed.json`, hash: sha256(args.parsedJson) },
    ],
    prompt_template_id: args.req.prompt_template_id,
    prompt_template_version: args.req.prompt_template_version,
    prompt_template_hash: args.promptHash,
    schema_hash: args.schemaHash,
    model_id: args.command.model_id,
    run_id: args.runId,
    command: {
      provider: args.command.provider,
      executable: args.command.executable,
      args: args.command.args,
    },
    raw_stdout_hash: sha256(args.rawStdout),
    raw_stderr_hash: sha256(args.rawStderr),
    parsed_json_hash: sha256(args.parsedJson),
    diagnostics: args.diagnostics,
    elapsed_ms: args.elapsedMs,
    completed_at: new Date().toISOString(),
  });
}

function failedLockEntry<T>(args: {
  req: LlmJsonRequest<T>;
  command: CliCommandSpec;
  diagnostics: Diagnostic[];
  elapsedMs: number;
  promptHash: string;
  schemaHash: string;
  runId: string;
  rawStdout: string;
  rawStderr: string;
  parsedJson: string;
  error: string;
}): StepLockEntry {
  return StepLockEntrySchema.parse({
    status: 'failed',
    input_hashes: [
      { path: 'prompt', hash: args.promptHash },
      { path: 'schema', hash: args.schemaHash },
    ],
    output_hashes: [
      { path: `runs/${args.runId}/stdout.txt`, hash: sha256(args.rawStdout) },
      { path: `runs/${args.runId}/stderr.txt`, hash: sha256(args.rawStderr) },
      { path: `runs/${args.runId}/parsed.json`, hash: sha256(args.parsedJson) },
    ],
    prompt_template_id: args.req.prompt_template_id,
    prompt_template_version: args.req.prompt_template_version,
    prompt_template_hash: args.promptHash,
    schema_hash: args.schemaHash,
    model_id: args.command.model_id,
    run_id: args.runId,
    command: {
      provider: args.command.provider,
      executable: args.command.executable,
      args: args.command.args,
    },
    raw_stdout_hash: sha256(args.rawStdout),
    raw_stderr_hash: sha256(args.rawStderr),
    parsed_json_hash: sha256(args.parsedJson),
    diagnostics: args.diagnostics,
    elapsed_ms: args.elapsedMs,
    failed_at: new Date().toISOString(),
    error: args.error,
  });
}

function hashSchema<T>(schema: ZodSchema<T>): string {
  return sha256(canonicalJsonStringify(toHashable(schema._def)));
}

function toHashable(value: unknown): Hashable {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'function') return `[function:${value.name}]`;
  if (typeof value === 'symbol') return String(value);
  if (value instanceof RegExp) return value.toString();
  if (Array.isArray(value)) return value.map((item) => toHashable(item));
  if (typeof value === 'object') {
    const out: { [key: string]: Hashable } = {};
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    for (const [key, entryValue] of entries) {
      if (entryValue !== undefined) out[key] = toHashable(entryValue);
    }
    return out;
  }
  return String(value);
}

export const __test__ = {
  diagnosticsFromZod,
  parseStrictJson,
};
