import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeArtifact } from '../artifact-ref';
import { LessonCorpusSchema } from '../ingest/types';
import { SceneMapArtifactSchema } from '../scene-map/types';
import { StoryboardSchema } from '../storyboard/types';
import { buildParityReport } from '../validate/parity';
import { ParityReportSchema } from '../validate/types';
import {
  parityCorpusFixture,
  paritySceneMapFixture,
  parityStoryboardFixture,
  registryFixture,
} from '../validate/test-fixtures';
import {
  LessonDiffSchema,
  SectionDiffSchema,
  runLessonDiff,
  runSectionDiff,
  writeSectionDiffArtifact,
} from './index';

describe('lesson-workflow diff', () => {
  it('builds a strict human-readable diff for one existing section', async () => {
    const rootDir = await writeFixtureArtifacts();

    const diff = await runSectionDiff({
      slug: 'validate-fixture',
      section_id: 'section_one',
      rootDir,
    });

    expect(SectionDiffSchema.parse(diff)).toEqual(diff);
    expect(diff).toMatchObject({
      schema_version: 'loa.section-diff.v1',
      section_id: 'section_one',
      scene_id: 'scene-one',
      source: {
        eyebrow: '01',
        title: 'First Section',
        sentence_count: 3,
        discovery_keys: ['alpha'],
        game_component_id: 'WidgetGame',
      },
      cinematic: {
        eyebrow: '01',
        title: 'First Section',
        sentence_count: 3,
        shot_count: 1,
        shot_kinds: ['narrative'],
        discovery_keys: ['alpha'],
        interactive_component_id: 'WidgetGame',
      },
      parity: {
        sentence_match: true,
        discovery_match: true,
        metadata_match: true,
        game_match: true,
      },
      parity_diagnostics: [],
    });
  });

  it('builds a strict lesson diff and writes a section artifact', async () => {
    const rootDir = await writeFixtureArtifacts();

    const lessonDiff = await runLessonDiff({
      slug: 'validate-fixture',
      rootDir,
    });
    const artifact = await writeSectionDiffArtifact({
      slug: 'validate-fixture',
      section_id: 'section_one',
      rootDir,
    });

    expect(LessonDiffSchema.parse(lessonDiff)).toEqual(lessonDiff);
    expect(lessonDiff.sections.map((section) => section.section_id)).toEqual([
      'section_one',
      'section_two',
    ]);
    expect(artifact.path.endsWith(path.join('artifacts', 'diffs', 'section_one.json'))).toBe(true);
    expect(artifact.bytes).toBeGreaterThan(0);
  });
});

async function writeFixtureArtifacts(): Promise<string> {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'loa-diff-'));
  const artifactDir = path.join(rootDir, 'lessons', 'validate-fixture', 'artifacts');
  const corpus = parityCorpusFixture();
  const sceneMap = paritySceneMapFixture();
  const storyboard = parityStoryboardFixture();
  const parityReport = buildParityReport({
    lessonSlug: 'validate-fixture',
    corpus,
    sceneMap,
    storyboard,
    interactives: registryFixture(),
  });

  await Promise.all([
    writeArtifact(path.join(artifactDir, 'lesson-input.json'), corpus, LessonCorpusSchema),
    writeArtifact(path.join(artifactDir, 'scene-map.json'), sceneMap, SceneMapArtifactSchema),
    writeArtifact(path.join(artifactDir, 'storyboard.json'), storyboard, StoryboardSchema),
    writeArtifact(path.join(artifactDir, 'parity-report.json'), parityReport, ParityReportSchema),
  ]);
  return rootDir;
}
