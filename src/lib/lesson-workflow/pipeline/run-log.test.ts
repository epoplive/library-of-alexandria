import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptyRunLogEvent, writeRunLogFile } from './run-log';
import { StepName, type RunLogEvent } from './types';

const HASH_A = 'a'.repeat(64);

describe('writeRunLogFile', () => {
  it('writes byte-stable run log lines', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'loa-run-log-'));
    try {
      const logPath = path.join(tmpDir, 'run.log');
      const events: RunLogEvent[] = [
        emptyRunLogEvent({
          timestamp: '2026-05-24T12:00:00.000Z',
          step: StepName.Ingest,
          status: 'running',
        }),
        {
          timestamp: '2026-05-24T12:00:00.001Z',
          step: StepName.Ingest,
          status: 'ok',
          elapsedMs: 17,
          artifact: 'artifacts/lesson-input.json',
          hash: HASH_A,
          reason: '',
          error: '',
          llmRunPaths: [],
        },
        {
          timestamp: '2026-05-24T12:00:00.002Z',
          step: StepName.Curriculum,
          status: 'short-circuit',
          elapsedMs: 0,
          artifact: '',
          hash: '',
          reason: 'hash-match',
          error: '',
          llmRunPaths: [],
        },
        {
          timestamp: '2026-05-24T12:00:00.003Z',
          step: StepName.Validate,
          status: 'failed',
          elapsedMs: 0,
          artifact: '',
          hash: '',
          reason: '',
          error: 'bad "news"',
          llmRunPaths: [],
        },
      ];

      await writeRunLogFile(logPath, events);

      await expect(readFile(logPath, 'utf8')).resolves.toBe([
        '[2026-05-24T12:00:00.000Z] step=ingest status=running',
        `[2026-05-24T12:00:00.001Z] step=ingest status=ok elapsed_ms=17 artifact=artifacts/lesson-input.json hash=${HASH_A}`,
        '[2026-05-24T12:00:00.002Z] step=curriculum status=short-circuit reason=hash-match',
        '[2026-05-24T12:00:00.003Z] step=validate status=failed error="bad \\"news\\""',
        '',
      ].join('\n'));
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
