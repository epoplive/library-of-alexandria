import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runPipeline } from './index';
import { STEP_NAMES, type PipelineStepResult, type PipelineStepRunner } from './types';

const HASH_A = 'a'.repeat(64);

describe('runPipeline', () => {
  it('runs the seven step callables in order and records the run log', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'loa-pipeline-'));
    try {
      const order: string[] = [];
      const runners: PipelineStepRunner[] = STEP_NAMES.map((step) => ({
        step,
        run: async () => {
          order.push(step);
          const result: PipelineStepResult = {
            step,
            status: 'ok',
            reason: '',
            diagnostics: [],
            elapsedMs: 1,
            artifacts: [{ path: `artifacts/${step}.json`, hash: HASH_A }],
            error: '',
            llmRunPaths: [],
          };
          return result;
        },
      }));
      let timestampIndex = 0;
      const timestamps = Array.from({ length: 20 }, (_, index) => `2026-05-24T12:00:00.${String(index).padStart(3, '0')}Z`);
      let timeValue = 0;
      const logPath = path.join(tmpDir, 'run.log');

      const result = await runPipeline({
        runId: 'produce_2026-05-24T12-00-00-000Z_abcdef',
        logPath,
        runners,
        now: () => {
          const timestamp = timestamps[timestampIndex];
          timestampIndex += 1;
          return timestamp;
        },
        timeMs: () => {
          const current = timeValue;
          timeValue += 5;
          return current;
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stepsRan).toBe(7);
      expect(result.stepsShortCircuited).toBe(0);
      expect(order).toEqual(STEP_NAMES);
      const log = await readFile(logPath, 'utf8');
      expect(log.split('\n').filter((line) => line.length > 0)).toHaveLength(14);
      expect(log).toContain('[2026-05-24T12:00:00.000Z] step=ingest status=running');
      expect(log).toContain(`[2026-05-24T12:00:00.001Z] step=ingest status=ok elapsed_ms=1 artifact=artifacts/ingest.json hash=${HASH_A}`);
      expect(log).toContain('[2026-05-24T12:00:00.012Z] step=validate status=running');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
