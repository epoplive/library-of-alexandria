import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliLlmClient } from '../llm/cli-adapter';
import { runGenerative } from './generative';
import { topicCorpus, validGeneratedPlan } from './test-fixtures';

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

describe('runGenerative', () => {
  it('runs the LLM client and injects generative derivation', async () => {
    const runsDir = await mkdtemp(path.join(os.tmpdir(), 'loa-curriculum-'));
    try {
      const plan = validGeneratedPlan();
      const spawn = createSpawnStub([
        { stdout: JSON.stringify(plan), stderr: '' },
      ]);
      const client = new CliLlmClient({
        runsDir,
        spawnText: spawn.spawnText,
      });

      const result = await runGenerative({
        corpus: topicCorpus(),
        llm: client,
      });

      expect(spawn.calls).toHaveLength(1);
      expect(result.plan.derivation).toBe('generative');
      expect(result.plan.acts[0].id).toBe('generated');
      expect(result.diagnostics).toEqual([]);
    } finally {
      await rm(runsDir, { recursive: true, force: true });
    }
  });

  it('retries Zod-invalid JSON and succeeds', async () => {
    const runsDir = await mkdtemp(path.join(os.tmpdir(), 'loa-curriculum-'));
    try {
      const plan = validGeneratedPlan({
        derivation: 'generative',
      });
      const spawn = createSpawnStub([
        { stdout: '{"schema_version":"loa.curriculum.v1"}', stderr: '' },
        { stdout: JSON.stringify(plan), stderr: '' },
      ]);
      const client = new CliLlmClient({
        runsDir,
        spawnText: spawn.spawnText,
      });

      const result = await runGenerative({
        corpus: topicCorpus(),
        llm: client,
      });

      expect(spawn.calls).toHaveLength(2);
      expect(spawn.calls[1].input).toContain('zod.invalid_type');
      expect(result.plan.derivation).toBe('generative');
    } finally {
      await rm(runsDir, { recursive: true, force: true });
    }
  });

  it('throws after exhausted retries', async () => {
    const runsDir = await mkdtemp(path.join(os.tmpdir(), 'loa-curriculum-'));
    try {
      const spawn = createSpawnStub([
        { stdout: '{"schema_version":"loa.curriculum.v1"}', stderr: '' },
      ]);
      const client = new CliLlmClient({
        runsDir,
        spawnText: spawn.spawnText,
      });

      await expect(runGenerative({
        corpus: topicCorpus(),
        llm: client,
      })).rejects.toThrow('LLM JSON request failed validation after 3 attempt(s)');

      expect(spawn.calls).toHaveLength(3);
    } finally {
      await rm(runsDir, { recursive: true, force: true });
    }
  });
});
