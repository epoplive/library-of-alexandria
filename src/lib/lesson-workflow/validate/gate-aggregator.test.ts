import { describe, expect, it } from 'vitest';
import { aggregateValidation, requiredGateFailures } from './gate-aggregator';
import type { ConsistencyReport, HydrateValidationSnapshot, ParityReport } from './types';

describe('aggregateValidation', () => {
  it('passes when all required and informational gates pass', () => {
    const validation = aggregateValidation({
      parityReport: parityReport('pass'),
      consistencyReport: consistencyReport('pass', false),
      hydrateValidation: hydrateValidation('pass', 'ok', 'ok'),
    });

    expect(validation).toEqual({
      parity: 'pass',
      self_consistency: 'pass',
      map_completeness: 'pass',
      tier_v0_1: 'pass',
      tier_v0_3: 'pending',
      asset_coverage: 'ok',
      character_sprite_coverage: 'ok',
    });
    expect(requiredGateFailures(validation)).toEqual([]);
  });

  it('marks parity fail as a required failure', () => {
    const validation = aggregateValidation({
      parityReport: parityReport('fail'),
      consistencyReport: consistencyReport('pass', false),
      hydrateValidation: hydrateValidation('pass', 'ok', 'ok'),
    });

    expect(validation.parity).toBe('fail');
    expect(requiredGateFailures(validation)).toEqual(['parity']);
  });

  it('carries tier fail without making it a required failure', () => {
    const validation = aggregateValidation({
      parityReport: parityReport('pass'),
      consistencyReport: consistencyReport('pass', false),
      hydrateValidation: hydrateValidation('fail', 'ok', 'ok'),
    });

    expect(validation.tier_v0_1).toBe('fail');
    expect(requiredGateFailures(validation)).toEqual([]);
  });

  it('reports multiple required failures and informational coverage state', () => {
    const validation = aggregateValidation({
      parityReport: parityReport('fail'),
      consistencyReport: consistencyReport('fail', true),
      hydrateValidation: hydrateValidation('fail', 'missing', 'partial'),
    });

    expect(validation).toMatchObject({
      parity: 'fail',
      self_consistency: 'fail',
      map_completeness: 'fail',
      tier_v0_1: 'fail',
      asset_coverage: 'missing',
      character_sprite_coverage: 'partial',
    });
    expect(requiredGateFailures(validation)).toEqual(['parity', 'self_consistency', 'map_completeness']);
  });
});

function parityReport(status: 'pass' | 'fail' | 'n/a'): ParityReport {
  return {
    schema_version: 'loa.parity-report.v1',
    lesson_slug: 'validate-fixture',
    source_kind: 'existing-lesson',
    applicable: true,
    per_section: [],
    overall_status: status,
  };
}

function consistencyReport(status: 'pass' | 'fail', mapFails: boolean): ConsistencyReport {
  return {
    schema_version: 'loa.consistency-report.v1',
    lesson_slug: 'validate-fixture',
    gates: {
      cast_unknown: [],
      slot_unknown: [],
      shot_silent: [],
      action_method_unknown: [],
      interactive_unregistered: [],
      transition_non_adjacent: [],
      field_overlap: [],
      map_completeness: mapFails
        ? [{
          code: 'consistency.map.scene_empty',
          path: ['content_map'],
          actual: 0,
          expected: 'at least one shot',
          severity: 'error',
        }]
        : [],
    },
    overall_status: status,
  };
}

function hydrateValidation(
  tierV01: HydrateValidationSnapshot['tier_v0_1'],
  assetCoverage: HydrateValidationSnapshot['asset_coverage'],
  characterSpriteCoverage: HydrateValidationSnapshot['character_sprite_coverage'],
): HydrateValidationSnapshot {
  return {
    tier_v0_1: tierV01,
    asset_coverage: assetCoverage,
    character_sprite_coverage: characterSpriteCoverage,
  };
}
