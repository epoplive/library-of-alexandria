import { describe, expect, it } from 'vitest';
import { runValidate } from './index';
import { ConsistencyReportSchema, ParityReportSchema } from './types';
import {
  cleanManifestFixture,
  cleanProductionFixture,
  parityCorpusFixture,
  paritySceneMapFixture,
  parityStoryboardFixture,
  registryFixture,
  validateProjectFixture,
} from './test-fixtures';

describe('runValidate', () => {
  it('returns strict report shapes and aggregated validation state', () => {
    const result = runValidate({
      lessonSlug: 'validate-fixture',
      project: validateProjectFixture(),
      corpus: parityCorpusFixture(),
      sceneMap: paritySceneMapFixture(),
      storyboard: parityStoryboardFixture(),
      production: cleanProductionFixture(),
      manifest: cleanManifestFixture(),
      interactives: registryFixture(),
    });

    expect(ParityReportSchema.parse(result.parityReport)).toEqual(result.parityReport);
    expect(ConsistencyReportSchema.parse(result.consistencyReport)).toEqual(result.consistencyReport);
    expect(result.parityReport.overall_status).toBe('pass');
    expect(result.consistencyReport.overall_status).toBe('pass');
    expect(result.validation).toMatchObject({
      parity: 'pass',
      self_consistency: 'pass',
      map_completeness: 'pass',
      tier_v0_1: 'fail',
      tier_v0_3: 'pending',
      asset_coverage: 'missing',
      character_sprite_coverage: 'ok',
    });
    expect(result.requiredGateFailures).toEqual([]);
  });
});
