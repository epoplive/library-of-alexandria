import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sha256 } from '../artifact-ref';
import { DiagnosticSchema } from '../diagnostic-schema';
import { StepLockEntrySchema } from '../lockfile-schema';
import { CliLlmClient, __test__ } from './cli-adapter';
import { mkDiagnostic } from './diagnostics';
import { FakeLlmClient } from './fake-adapter';

interface SpawnResponse {
  stdout: string;
  stderr: string;
}

interface SpawnCall {
  executable: string;
  args: string[];
  input: string;
}

function createSpawnStub(responses: readonly SpawnResponse[]): {
  spawnText: (executable: string, args: string[], input: string) => Promise<SpawnResponse>;
  calls: SpawnCall[];
} {
  if (responses.length === 0) throw new Error('spawn stub requires at least one response');
  const calls: SpawnCall[] = [];
  return {
    spawnText: async (executable, args, input) => {
      const responseIndex = calls.length < responses.length ? calls.length : responses.length - 1;
      calls.push({ executable, args, input });
      return responses[responseIndex];
    },
    calls,
  };
}

async function readAttemptDiagnostics(runDir: string, attempt: number) {
  const diagnosticsPath = path.join(runDir, `attempt-${attempt}`, 'diagnostics.json');
  return z.array(DiagnosticSchema).parse(JSON.parse(await readFile(diagnosticsPath, 'utf8')));
}

async function readLockEntry(runDir: string) {
  return StepLockEntrySchema.parse(JSON.parse(await readFile(path.join(runDir, 'lock-entry.json'), 'utf8')));
}

async function attemptNames(runDir: string): Promise<string[]> {
  const names = await readdir(runDir);
  return names.filter((name) => name.startsWith('attempt-')).sort();
}

describe('FakeLlmClient retry behavior', () => {
  it('retries validator failures and records diagnostics', async () => {
    const runsDir = await mkdtemp(path.join(os.tmpdir(), 'loa-runs-'));
    try {
      const prompt = 'return ok json';
      const schema = z.object({
        ok: z.boolean(),
        value: z.string(),
      }).strict();
      const client = new FakeLlmClient({
        runsDir,
        responses: new Map([
          [
            sha256(prompt),
            [
              { ok: false, value: 'first' },
              { ok: true, value: 'second' },
            ],
          ],
        ]),
      });

      const result = await client.runJson({
        prompt_template_id: 'unit-test',
        prompt_template_version: '1.0.0',
        prompt,
        schema,
        max_retries: 1,
        validator: (parsed) => {
          if (parsed.ok) return [];
          return [
            mkDiagnostic({
              code: 'unit.not_ok',
              path: ['ok'],
              actual: parsed.ok,
              expected: true,
              repair: 'return ok=true',
              severity: 'error',
            }),
          ];
        },
      });

      expect(result.parsed).toEqual({ ok: true, value: 'second' });
      expect(result.diagnostics).toHaveLength(1);
      expect(result.lock_entry.status).toBe('completed');
      expect(result.lock_entry.diagnostics).toHaveLength(1);

      const diagnosticsPath = path.join(runsDir, result.run_id, 'attempt-1', 'diagnostics.json');
      const diagnostics = JSON.parse(await readFile(diagnosticsPath, 'utf8'));
      expect(diagnostics).toEqual([
        {
          actual: false,
          code: 'unit.not_ok',
          expected: true,
          path: ['ok'],
          repair: 'return ok=true',
          severity: 'error',
        },
      ]);
    } finally {
      await rm(runsDir, { recursive: true, force: true });
    }
  });
});

describe('CliLlmClient retry behavior', () => {
  it('retries invalid JSON stdout and records both attempts', async () => {
    const runsDir = await mkdtemp(path.join(os.tmpdir(), 'loa-runs-'));
    try {
      const schema = z.object({
        ok: z.boolean(),
        value: z.string(),
      }).strict();
      const spawn = createSpawnStub([
        { stdout: 'not valid json {{{', stderr: '' },
        { stdout: '{"ok":true,"value":"second"}', stderr: '' },
      ]);
      const client = new CliLlmClient({
        runsDir,
        spawnText: spawn.spawnText,
      });

      const result = await client.runJson({
        prompt_template_id: 'unit-test',
        prompt_template_version: '1.0.0',
        prompt: 'return strict json',
        schema,
        model_hint: 'gpt-5.5',
      });

      expect(result.parsed).toEqual({ ok: true, value: 'second' });
      expect(spawn.calls).toHaveLength(2);
      expect(spawn.calls[1].input).toContain('The previous response failed validation');
      expect(spawn.calls[1].input).toContain('llm.stdout.invalid_json');
      expect(result.diagnostics).toEqual([
        {
          actual: 'not valid json {{{',
          code: 'llm.stdout.invalid_json',
          expected: 'valid JSON matching schema',
          path: [],
          repair: 'return only JSON, no prose / no markdown fences',
          severity: 'error',
        },
      ]);
      expect(result.lock_entry.status).toBe('completed');
      expect(result.lock_entry.diagnostics).toHaveLength(1);

      const runDir = path.join(runsDir, result.run_id);
      expect(await attemptNames(runDir)).toEqual(['attempt-1', 'attempt-2']);
      expect(await readAttemptDiagnostics(runDir, 1)).toEqual(result.diagnostics);
      expect(await readAttemptDiagnostics(runDir, 2)).toEqual([]);
    } finally {
      await rm(runsDir, { recursive: true, force: true });
    }
  });

  it('retries Zod-invalid stdout and carries first-attempt diagnostics', async () => {
    const runsDir = await mkdtemp(path.join(os.tmpdir(), 'loa-runs-'));
    try {
      const schema = z.object({
        ok: z.boolean(),
        value: z.string(),
      }).strict();
      const spawn = createSpawnStub([
        { stdout: '{"ok":true}', stderr: '' },
        { stdout: '{"ok":true,"value":"second"}', stderr: '' },
      ]);
      const client = new CliLlmClient({
        runsDir,
        spawnText: spawn.spawnText,
      });

      const result = await client.runJson({
        prompt_template_id: 'unit-test',
        prompt_template_version: '1.0.0',
        prompt: 'return strict json',
        schema,
        model_hint: 'gpt-5.5',
        max_retries: 1,
      });

      expect(result.parsed).toEqual({ ok: true, value: 'second' });
      expect(spawn.calls).toHaveLength(2);
      expect(spawn.calls[1].input).toContain('zod.invalid_type');
      expect(result.diagnostics.map((diag) => diag.code)).toEqual(['zod.invalid_type']);
      expect(result.diagnostics[0].path).toEqual(['value']);

      const runDir = path.join(runsDir, result.run_id);
      expect(await attemptNames(runDir)).toEqual(['attempt-1', 'attempt-2']);
      expect((await readAttemptDiagnostics(runDir, 1)).map((diag) => diag.code)).toEqual(['zod.invalid_type']);
      expect(await readAttemptDiagnostics(runDir, 2)).toEqual([]);
    } finally {
      await rm(runsDir, { recursive: true, force: true });
    }
  });

  it('throws after exhausted invalid JSON retries and records failed diagnostics', async () => {
    const runsDir = await mkdtemp(path.join(os.tmpdir(), 'loa-runs-'));
    try {
      const schema = z.object({
        ok: z.boolean(),
        value: z.string(),
      }).strict();
      const spawn = createSpawnStub([
        { stdout: 'not valid json {{{', stderr: '' },
      ]);
      const client = new CliLlmClient({
        runsDir,
        spawnText: spawn.spawnText,
      });

      await expect(client.runJson({
        prompt_template_id: 'unit-test',
        prompt_template_version: '1.0.0',
        prompt: 'return strict json',
        schema,
        model_hint: 'gpt-5.5',
        max_retries: 2,
      })).rejects.toThrow('LLM JSON request failed validation after 3 attempt(s)');

      expect(spawn.calls).toHaveLength(3);
      const runIds = await readdir(runsDir);
      expect(runIds).toHaveLength(1);
      const runDir = path.join(runsDir, runIds[0]);
      expect(await attemptNames(runDir)).toEqual(['attempt-1', 'attempt-2', 'attempt-3']);
      const lockEntry = await readLockEntry(runDir);
      expect(lockEntry.status).toBe('failed');
      expect(lockEntry.diagnostics.map((diag) => diag.code)).toEqual([
        'llm.stdout.invalid_json',
        'llm.stdout.invalid_json',
        'llm.stdout.invalid_json',
      ]);
      if (lockEntry.status !== 'failed') throw new Error('expected failed lock entry');
      expect(lockEntry.error).toBe('LLM JSON request failed validation after all retries');
    } finally {
      await rm(runsDir, { recursive: true, force: true });
    }
  });

  it('passes xhigh effort flags to spawned CLI commands', async () => {
    const runsDir = await mkdtemp(path.join(os.tmpdir(), 'loa-runs-'));
    try {
      const schema = z.object({
        ok: z.boolean(),
      }).strict();
      const codexCommand = __test__.commandFor('gpt-5.5');
      const claudeCommand = __test__.commandFor('claude-opus');
      expect(codexCommand.args).toContain('-c');
      expect(codexCommand.args).toContain('model_reasoning_effort="xhigh"');
      expect(claudeCommand.args).toContain('--effort');
      expect(claudeCommand.args).toContain('xhigh');

      const codexSpawn = createSpawnStub([
        { stdout: '{"ok":true}', stderr: '' },
      ]);
      const codexClient = new CliLlmClient({
        runsDir,
        spawnText: codexSpawn.spawnText,
      });
      await codexClient.runJson({
        prompt_template_id: 'unit-test',
        prompt_template_version: '1.0.0',
        prompt: 'return codex json',
        schema,
        model_hint: 'gpt-5.5',
        max_retries: 0,
      });
      expect(codexSpawn.calls[0].executable).toBe('codex');
      expect(codexSpawn.calls[0].args).toEqual(codexCommand.args);

      const claudeSpawn = createSpawnStub([
        { stdout: '{"ok":true}', stderr: '' },
      ]);
      const claudeClient = new CliLlmClient({
        runsDir,
        spawnText: claudeSpawn.spawnText,
      });
      await claudeClient.runJson({
        prompt_template_id: 'unit-test',
        prompt_template_version: '1.0.0',
        prompt: 'return claude json',
        schema,
        model_hint: 'claude-opus',
        max_retries: 0,
      });
      expect(claudeSpawn.calls[0].executable).toBe('claude');
      expect(claudeSpawn.calls[0].args).toEqual(claudeCommand.args);
    } finally {
      await rm(runsDir, { recursive: true, force: true });
    }
  });

  it('extracts the agent_message text from codex JSONL event-stream stdout', async () => {
    const runsDir = await mkdtemp(path.join(os.tmpdir(), 'loa-runs-'));
    try {
      const schema = z.object({
        topic: z.string().min(1),
        key_concepts: z.array(z.string().min(1)),
      }).strict();
      const responsePayload = {
        topic: 'world models meet GNNs',
        key_concepts: ['relational inductive bias', 'object-centric world models'],
      };
      // Simulate codex exec --json output: thread.started, web_search items,
      // then item.completed with type:agent_message wrapping the JSON response,
      // then turn.completed.
      const stdout = [
        '{"type":"thread.started","thread_id":"abc"}',
        '{"type":"turn.started"}',
        '{"type":"item.started","item":{"id":"item_0","type":"web_search"}}',
        '{"type":"item.completed","item":{"id":"item_0","type":"web_search","query":"q"}}',
        `{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":${JSON.stringify(JSON.stringify(responsePayload))}}}`,
        '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":20}}',
        '',
      ].join('\n');
      const spawn = createSpawnStub([{ stdout, stderr: '' }]);
      const client = new CliLlmClient({
        runsDir,
        spawnText: spawn.spawnText,
      });
      const result = await client.runJson({
        prompt_template_id: 'unit-test',
        prompt_template_version: '1.0.0',
        prompt: 'return JSON',
        schema,
        model_hint: 'gpt-5.5',
        max_retries: 0,
      });
      expect(result.parsed).toEqual(responsePayload);
    } finally {
      await rm(runsDir, { recursive: true, force: true });
    }
  });

  it('emits invalid_json diagnostic when the agent_message text is not valid JSON', async () => {
    const runsDir = await mkdtemp(path.join(os.tmpdir(), 'loa-runs-'));
    try {
      const schema = z.object({ ok: z.boolean() }).strict();
      const stdout = [
        '{"type":"thread.started","thread_id":"abc"}',
        `{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"not valid json {{{"}}`,
        '{"type":"turn.completed"}',
      ].join('\n');
      const spawn = createSpawnStub([{ stdout, stderr: '' }]);
      const client = new CliLlmClient({
        runsDir,
        spawnText: spawn.spawnText,
      });
      await expect(
        client.runJson({
          prompt_template_id: 'unit-test',
          prompt_template_version: '1.0.0',
          prompt: 'return JSON',
          schema,
          model_hint: 'gpt-5.5',
          max_retries: 0,
        }),
      ).rejects.toThrow();
    } finally {
      await rm(runsDir, { recursive: true, force: true });
    }
  });

  it('emits zod diagnostics when the agent_message JSON fails schema validation', async () => {
    const runsDir = await mkdtemp(path.join(os.tmpdir(), 'loa-runs-'));
    try {
      const schema = z.object({ required_field: z.string().min(1) }).strict();
      const stdout = [
        '{"type":"thread.started","thread_id":"abc"}',
        `{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"{\\"other_field\\":\\"value\\"}"}}`,
        '{"type":"turn.completed"}',
      ].join('\n');
      const spawn = createSpawnStub([{ stdout, stderr: '' }]);
      const client = new CliLlmClient({
        runsDir,
        spawnText: spawn.spawnText,
      });
      await expect(
        client.runJson({
          prompt_template_id: 'unit-test',
          prompt_template_version: '1.0.0',
          prompt: 'return JSON',
          schema,
          model_hint: 'gpt-5.5',
          max_retries: 0,
        }),
      ).rejects.toThrow(/failed validation/);
    } finally {
      await rm(runsDir, { recursive: true, force: true });
    }
  });
});
