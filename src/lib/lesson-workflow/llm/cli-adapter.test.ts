import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sha256 } from '../artifact-ref';
import { mkDiagnostic } from './diagnostics';
import { FakeLlmClient } from './fake-adapter';

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
