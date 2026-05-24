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

type SpawnText = (
  executable: string,
  args: string[],
  input: string,
) => Promise<{ stdout: string; stderr: string }>;

interface CliAdapterOptions {
  runsDir: string;
  commands?: Partial<CliCommands>;
  spawnText?: SpawnText;
}

interface AttemptResultBase {
  raw_stdout: string;
  raw_stderr: string;
  diagnostics: Diagnostic[];
  command: CliCommandSpec;
}

type AttemptResult<T> =
  | (AttemptResultBase & { ok: true; parsed: T })
  | (AttemptResultBase & { ok: false });

type ParseStrictJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; diagnostics: Diagnostic[] };

type Hashable = string | number | boolean | null | Hashable[] | { [key: string]: Hashable };

type ModelHint = LlmJsonRequest<string>['model_hint'];

const DEFAULT_COMMANDS: CliCommands = {
  claude_opus: {
    provider: 'claude-cli',
    executable: 'claude',
    args: ['-p', '--output-format', 'json', '--model', 'opus', '--effort', 'xhigh'],
    model_id: 'claude-opus',
  },
  gpt_5_5: {
    provider: 'codex-cli',
    executable: 'codex',
    args: ['exec', '--json', '--model', 'gpt-5.5', '-c', 'model_reasoning_effort="xhigh"'],
    model_id: 'gpt-5.5',
  },
};

export class CliLlmClient implements LlmClient {
  private readonly runsDir: string;
  private readonly commands: CliCommands;
  private readonly spawnText: SpawnText;

  constructor(options: CliAdapterOptions) {
    this.runsDir = options.runsDir;
    this.spawnText = options.spawnText === undefined ? spawnText : options.spawnText;
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

    const maxRetries = req.max_retries === undefined ? 2 : req.max_retries;
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
      if (attemptResult.ok) {
        lastParsed = attemptResult.parsed;
      }
      allDiagnostics.push(...attemptResult.diagnostics);
      await writeAttempt(runDir, attempt + 1, attemptResult);
      if (attemptResult.ok && !hasErrorDiagnostics(attemptResult.diagnostics)) {
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
    return commandFor(this.commands, modelHint);
  }

  private async runAttempt<T>(
    req: LlmJsonRequest<T>,
    prompt: string,
    command: CliCommandSpec,
  ): Promise<AttemptResult<T>> {
    const { stdout, stderr } = await this.spawnText(command.executable, command.args, prompt);
    const parseResult = parseStrictJson(stdout, req.schema);
    if (!parseResult.ok) {
      return {
        ok: false,
        raw_stdout: stdout,
        raw_stderr: stderr,
        diagnostics: parseResult.diagnostics,
        command,
      };
    }
    const parsed = parseResult.data;
    const validatorDiagnostics = req.validator === undefined ? [] : req.validator(parsed);
    const diagnostics = validatorDiagnostics.map((diag) => DiagnosticSchema.parse(diag));
    return {
      ok: true,
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

function commandFor(commands: CliCommands, modelHint: ModelHint): CliCommandSpec {
  switch (modelHint) {
    case 'claude-opus':
      return commands.claude_opus;
    case 'gpt-5.5':
      return commands.gpt_5_5;
    case undefined:
      throw new Error('CliLlmClient requires model_hint to choose claude-opus or gpt-5.5');
  }
}

function parseStrictJson<T>(stdout: string, schema: ZodSchema<T>): ParseStrictJsonResult<T> {
  // Try parsing as a single JSON document first (Claude --output-format=json
  // case, or any caller that returns a well-formed JSON body).
  let parsedStdout: unknown;
  let directParseFailed = false;
  try {
    parsedStdout = JSON.parse(stdout);
  } catch (error) {
    directParseFailed = true;
  }

  if (!directParseFailed) {
    const direct = schema.safeParse(parsedStdout);
    if (direct.success) return { ok: true, data: direct.data };

    if (parsedStdout !== null && typeof parsedStdout === 'object' && !Array.isArray(parsedStdout)) {
      const response = Object.entries(parsedStdout).find(([key]) => key === 'response');
      if (response !== undefined && typeof response[1] === 'string') {
        let responseJson: unknown;
        try {
          responseJson = JSON.parse(response[1]);
        } catch (error) {
          return {
            ok: false,
            diagnostics: [invalidJsonDiagnostic(response[1], ['response'])],
          };
        }
        const responseResult = schema.safeParse(responseJson);
        if (responseResult.success) return { ok: true, data: responseResult.data };
        return {
          ok: false,
          diagnostics: diagnosticsFromZod(responseResult.error),
        };
      }
    }
  }

  // Codex `exec --json` emits a JSONL event stream. The final assistant
  // response sits inside an `item.completed` event whose `.item.type` is
  // `agent_message` and whose `.item.text` is the JSON-as-string we want.
  const agentMessage = extractAgentMessageFromJsonl(stdout);
  if (agentMessage !== null) {
    let agentJson: unknown;
    try {
      agentJson = JSON.parse(agentMessage);
    } catch (error) {
      return {
        ok: false,
        diagnostics: [invalidJsonDiagnostic(agentMessage, ['agent_message'])],
      };
    }
    const agentResult = schema.safeParse(agentJson);
    if (agentResult.success) return { ok: true, data: agentResult.data };
    return {
      ok: false,
      diagnostics: diagnosticsFromZod(agentResult.error),
    };
  }

  if (directParseFailed) {
    return {
      ok: false,
      diagnostics: [invalidJsonDiagnostic(stdout, [])],
    };
  }
  // Direct parse succeeded but schema failed and the envelope wasn't recognized.
  // The direct safeParse error is the right diagnostic to surface here.
  const direct = schema.safeParse(parsedStdout);
  if (direct.success) return { ok: true, data: direct.data };
  return {
    ok: false,
    diagnostics: diagnosticsFromZod(direct.error),
  };
}

function extractAgentMessageFromJsonl(stdout: string): string | null {
  // Scan from the end — the assistant's final message is the last
  // agent_message event in the stream.
  const lines = stdout.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch (error) {
      continue;
    }
    if (event === null || typeof event !== 'object' || Array.isArray(event)) continue;
    const eventRecord = event as { type?: unknown; item?: unknown };
    if (eventRecord.type !== 'item.completed') continue;
    const item = eventRecord.item;
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const itemRecord = item as { type?: unknown; text?: unknown };
    if (itemRecord.type !== 'agent_message') continue;
    if (typeof itemRecord.text !== 'string') continue;
    return itemRecord.text;
  }
  return null;
}

function invalidJsonDiagnostic(actual: string, path: Diagnostic['path']): Diagnostic {
  return mkDiagnostic({
    code: 'llm.stdout.invalid_json',
    path,
    actual: truncateForDiagnostic(actual, 200),
    expected: 'valid JSON matching schema',
    repair: 'return only JSON, no prose / no markdown fences',
    severity: 'error',
  });
}

function truncateForDiagnostic(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

function diagnosticsFromZod(error: ZodError): Diagnostic[] {
  return error.issues.map((issue) => diagnosticFromZodIssue(issue));
}

function diagnosticFromZodIssue(issue: ZodIssue): Diagnostic {
  // Omit `actual` entirely when the issue has no `received` — explicit
  // `actual: undefined` trips canonicalJsonStringify when the diagnostic is
  // serialized into the run artifact files. mkDiagnostic parses through
  // DiagnosticSchema which treats absence and explicit-undefined identically.
  const base = {
    code: `zod.${issue.code}`,
    path: issue.path,
    expected: 'expected' in issue ? String(issue.expected) : issue.message,
    repair: issue.message,
    severity: 'error' as const,
  };
  if ('received' in issue) {
    return mkDiagnostic({ ...base, actual: String(issue.received) });
  }
  return mkDiagnostic(base);
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
  const parsedJson = result.ok ? canonicalJsonStringify(result.parsed) : '';
  await mkdir(attemptDir, { recursive: true });
  await writeFile(path.join(attemptDir, 'stdout.txt'), result.raw_stdout, 'utf8');
  await writeFile(path.join(attemptDir, 'stderr.txt'), result.raw_stderr, 'utf8');
  await writeFile(path.join(attemptDir, 'parsed.json'), parsedJson, 'utf8');
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
  commandFor: (modelHint: ModelHint) => commandFor(DEFAULT_COMMANDS, modelHint),
  diagnosticsFromZod,
  parseStrictJson,
};
