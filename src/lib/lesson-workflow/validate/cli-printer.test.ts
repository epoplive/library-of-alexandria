import { describe, expect, it } from 'vitest';
import { formatValidateReport } from './cli-printer';
import type { AggregatedValidation, ConsistencyReport, ParityReport } from './types';

describe('formatValidateReport', () => {
  it('prints deterministic gate output', () => {
    expect(formatValidateReport('validate-fixture', parityReport(), consistencyReport(), validation())).toBe(`loa validate validate-fixture
=============================
Parity                  (existing-lesson)
  Section 01 · First Section                      pass    (2/2 sentences)
Self-consistency
  cast_unknown               clean
  slot_unknown               clean
  shot_silent                clean
  action_method_unknown      clean
  interactive_unregistered   clean
  transition_non_adjacent    clean
  field_overlap              clean
  map_completeness           fail   (1 error)
    [error] consistency.map.scene_empty           content_map.acts.0.scenes.0.shots  expected=at least one shot actual=0 repair=rerun storyboard
Tier readiness
  v0.1                      fail
  v0.3                      pending
Asset coverage
  audio                     missing
  character sprites         ok

Overall: FAIL (self_consistency, map_completeness, tier_v0_1, asset_coverage)`);
  });
});

function parityReport(): ParityReport {
  return {
    schema_version: 'loa.parity-report.v1',
    lesson_slug: 'validate-fixture',
    source_kind: 'existing-lesson',
    applicable: true,
    per_section: [{
      source_section_id: 'section_one',
      title: 'First Section',
      scene_id: 'scene-one',
      status: 'pass',
      sentence_counts: {
        source: 2,
        storyboard: 2,
        matched: 2,
      },
      diagnostics: [],
    }],
    overall_status: 'pass',
  };
}

function consistencyReport(): ConsistencyReport {
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
      map_completeness: [{
        code: 'consistency.map.scene_empty',
        path: ['content_map', 'acts', 0, 'scenes', 0, 'shots'],
        actual: 0,
        expected: 'at least one shot',
        repair: 'rerun storyboard',
        severity: 'error',
      }],
    },
    overall_status: 'fail',
  };
}

function validation(): AggregatedValidation {
  return {
    parity: 'pass',
    self_consistency: 'fail',
    map_completeness: 'fail',
    tier_v0_1: 'fail',
    tier_v0_3: 'pending',
    asset_coverage: 'missing',
    character_sprite_coverage: 'ok',
  };
}
