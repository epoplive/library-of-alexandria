import { describe, expect, it } from 'vitest';
import { emitterManifestFixture, emitterProductionFixture } from './test-fixtures';
import { tscFailedDiagnostic, validateComposeArtifacts } from './compose-validators';

describe('validateComposeArtifacts', () => {
  it('diagnoses an empty Production', () => {
    const production = {
      ...emitterProductionFixture(),
      scenes: [],
    };

    expect(validateComposeArtifacts({
      production,
      manifest: emitterManifestFixture(),
    })).toEqual([{
      code: 'compose.production.empty',
      path: ['production', 'scenes'],
      actual: 0,
      expected: 'at least one Scene',
      repair: 'check storyboard plans and composer output; compose should not emit an empty Production.',
      severity: 'error',
    }]);
  });
});

describe('tscFailedDiagnostic', () => {
  it('builds the compose.tsc.failed diagnostic', () => {
    expect(tscFailedDiagnostic({
      exitCode: 2,
      stdout: '',
      stderr: 'generated.ts:1:1 - error TS1005',
    })).toEqual({
      code: 'compose.tsc.failed',
      path: ['productions'],
      actual: {
        exit_code: 2,
        stderr: 'generated.ts:1:1 - error TS1005',
        stdout: '',
      },
      expected: 'generated TypeScript module compiles with npx tsc --noEmit',
      repair: 'generated.ts:1:1 - error TS1005',
      severity: 'error',
    });
  });
});
