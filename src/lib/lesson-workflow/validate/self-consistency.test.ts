import { describe, expect, it } from 'vitest';
import { buildConsistencyReport } from './self-consistency';
import {
  cleanContentMapFixture,
  cleanManifestFixture,
  cleanProductionFixture,
  problemContentMapFixture,
  problemProductionFixture,
  registryFixture,
} from './test-fixtures';

describe('buildConsistencyReport', () => {
  it('passes a clean persisted production, manifest, registry, and content map', () => {
    const report = buildConsistencyReport({
      lessonSlug: 'validate-fixture',
      production: cleanProductionFixture(),
      manifest: cleanManifestFixture(),
      contentMap: cleanContentMapFixture(),
      interactives: registryFixture(),
    });

    expect(report.overall_status).toBe('pass');
    expect(allCodes(report)).toEqual([]);
  });

  it('emits every self-consistency gate code from persisted artifacts', () => {
    const report = buildConsistencyReport({
      lessonSlug: 'validate-fixture',
      production: problemProductionFixture(),
      manifest: cleanManifestFixture(),
      contentMap: problemContentMapFixture(),
      interactives: registryFixture(),
    });
    const codes = allCodes(report);

    expect(report.overall_status).toBe('fail');
    expect(codes).toContain('consistency.cast.unknown');
    expect(codes).toContain('consistency.slot.unknown');
    expect(codes).toContain('consistency.shot.silent');
    expect(codes).toContain('consistency.action.method_unknown');
    expect(codes).toContain('consistency.interactive.unregistered');
    expect(codes).toContain('consistency.transition.non_adjacent');
    expect(codes).toContain('consistency.cue.field_overlap');
    expect(codes).toContain('consistency.map.scene_empty');
  });
});

function allCodes(report: ReturnType<typeof buildConsistencyReport>): string[] {
  return [
    ...report.gates.cast_unknown,
    ...report.gates.slot_unknown,
    ...report.gates.shot_silent,
    ...report.gates.action_method_unknown,
    ...report.gates.interactive_unregistered,
    ...report.gates.transition_non_adjacent,
    ...report.gates.field_overlap,
    ...report.gates.map_completeness,
  ].map((diagnostic) => diagnostic.code);
}
