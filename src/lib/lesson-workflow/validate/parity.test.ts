import { describe, expect, it } from 'vitest';
import { buildParityReport } from './parity';
import {
  emptyRegistryFixture,
  nonExistingCorpusFixture,
  parityCorpusFixture,
  paritySceneMapFixture,
  parityStoryboardFixture,
  registryFixture,
} from './test-fixtures';

describe('buildParityReport', () => {
  it('passes a complete existing-lesson bijection with registered game contracts', () => {
    const report = buildParityReport({
      lessonSlug: 'validate-fixture',
      corpus: parityCorpusFixture(),
      sceneMap: paritySceneMapFixture(),
      storyboard: parityStoryboardFixture(),
      interactives: registryFixture(),
    });

    expect(report.applicable).toBe(true);
    expect(report.overall_status).toBe('pass');
    expect(report.per_section).toHaveLength(2);
    expect(report.per_section.flatMap((section) => section.diagnostics)).toEqual([]);
  });

  it('emits n/a for non-existing-lesson sources', () => {
    const report = buildParityReport({
      lessonSlug: 'validate-fixture',
      corpus: nonExistingCorpusFixture(),
      sceneMap: paritySceneMapFixture(),
      storyboard: parityStoryboardFixture(),
      interactives: registryFixture(),
    });

    expect(report.applicable).toBe(false);
    expect(report.overall_status).toBe('n/a');
    expect(report.per_section).toEqual([]);
  });

  it('emits sentence missing diagnostics', () => {
    const storyboard = parityStoryboardFixture();
    storyboard.plans[0].spoken_lines.pop();
    expect(codesFor({ storyboard })).toContain('parity.sentence.missing');
  });

  it('emits sentence extra diagnostics', () => {
    const storyboard = parityStoryboardFixture();
    storyboard.plans[0].spoken_lines[0].source_sentence_ids = ['not-in-section'];
    expect(codesFor({ storyboard })).toContain('parity.sentence.extra');
  });

  it('emits sentence modified diagnostics', () => {
    const storyboard = parityStoryboardFixture();
    storyboard.plans[0].spoken_lines[1].text = 'Changed beta.';
    expect(codesFor({ storyboard })).toContain('parity.sentence.modified');
  });

  it('emits sentence moved diagnostics using adjacent source-offset monotonicity', () => {
    const storyboard = parityStoryboardFixture();
    const first = storyboard.plans[0].spoken_lines[0];
    storyboard.plans[0].spoken_lines[0] = storyboard.plans[0].spoken_lines[1];
    storyboard.plans[0].spoken_lines[1] = first;
    expect(codesFor({ storyboard })).toContain('parity.sentence.moved');
  });

  it('emits duplicate and speaker drift diagnostics as warnings', () => {
    const storyboard = parityStoryboardFixture();
    storyboard.plans[0].spoken_lines[2].source_sentence_ids = ['s2'];
    storyboard.plans[0].spoken_lines[1].cast_id = 'guest';
    const report = reportFor({ storyboard });
    const diagnostics = report.per_section[0].diagnostics;

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('parity.sentence.duplicate');
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('parity.speaker.drift');
    const duplicate = diagnostics.find((diagnostic) => diagnostic.code === 'parity.sentence.duplicate');
    const drift = diagnostics.find((diagnostic) => diagnostic.code === 'parity.speaker.drift');
    if (duplicate === undefined) throw new Error('missing duplicate diagnostic');
    if (drift === undefined) throw new Error('missing speaker drift diagnostic');
    expect(duplicate.severity).toBe('warning');
    expect(drift.severity).toBe('warning');
  });

  it('emits game missing component diagnostics', () => {
    const sceneMap = paritySceneMapFixture();
    sceneMap.detail.scenes[0].interactive_ref = {
      component_id: 'WrongGame',
    };
    expect(codesFor({ sceneMap })).toContain('parity.game.missing_component');
  });

  it('emits game uncontracted warnings when the registry is empty', () => {
    const report = reportFor({ interactives: emptyRegistryFixture() });
    const diagnostic = report.per_section[0].diagnostics.find((entry) => entry.code === 'parity.game.uncontracted');

    expect(diagnostic).toBeDefined();
    if (diagnostic === undefined) throw new Error('missing parity.game.uncontracted diagnostic');
    expect(diagnostic.severity).toBe('warning');
    expect(report.per_section[0].status).toBe('pass');
  });

  it('emits discovery missing and modified diagnostics', () => {
    const missingSceneMap = paritySceneMapFixture();
    missingSceneMap.detail.scenes[0].discoveries = [];
    const modifiedSceneMap = paritySceneMapFixture();
    modifiedSceneMap.detail.scenes[0].discoveries[0].brief = 'Changed discovery.';

    expect(codesFor({ sceneMap: missingSceneMap })).toContain('parity.discovery.missing');
    expect(codesFor({ sceneMap: modifiedSceneMap })).toContain('parity.discovery.modified');
  });

  it('emits section metadata drift diagnostics', () => {
    const sceneMap = paritySceneMapFixture();
    sceneMap.detail.scenes[0].title = 'Changed Section';
    expect(codesFor({ sceneMap })).toContain('parity.section.metadata_drift');
  });
});

function reportFor(overrides: {
  sceneMap?: ReturnType<typeof paritySceneMapFixture>;
  storyboard?: ReturnType<typeof parityStoryboardFixture>;
  interactives?: ReturnType<typeof registryFixture>;
}) {
  return buildParityReport({
    lessonSlug: 'validate-fixture',
    corpus: parityCorpusFixture(),
    sceneMap: overrides.sceneMap === undefined ? paritySceneMapFixture() : overrides.sceneMap,
    storyboard: overrides.storyboard === undefined ? parityStoryboardFixture() : overrides.storyboard,
    interactives: overrides.interactives === undefined ? registryFixture() : overrides.interactives,
  });
}

function codesFor(overrides: {
  sceneMap?: ReturnType<typeof paritySceneMapFixture>;
  storyboard?: ReturnType<typeof parityStoryboardFixture>;
  interactives?: ReturnType<typeof registryFixture>;
}): string[] {
  return reportFor(overrides)
    .per_section
    .flatMap((section) => section.diagnostics)
    .map((diagnostic) => diagnostic.code);
}
