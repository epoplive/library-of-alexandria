import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { splitSentences } from '../../narration-context';
import { CurriculumPlanSchema } from '../curriculum/types';
import { LessonCorpusSchema } from '../ingest/types';
import { runAnalytic, sentenceId } from './analytic';
import { sceneMapCorpus, sceneMapCurriculum } from './test-fixtures';

describe('runAnalytic scene-map', () => {
  it('derives sentence records and deterministic beat outlines from existing sections', async () => {
    const corpus = sceneMapCorpus();
    const curriculum = sceneMapCurriculum();
    const result = await runAnalytic({ corpus, curriculum });

    expect(result.artifact.content_map.lesson_slug).toBe('looping-llms');
    expect(result.artifact.content_map.acts[0].scenes).toHaveLength(3);
    expect(result.artifact.content_map.acts[0].scenes[0].shots).toEqual([]);
    expect(result.artifact.detail.scenes).toHaveLength(3);

    const section = requiredSection(corpus, 'section_01');
    const firstScene = result.artifact.detail.scenes[0];
    const expectedSentences = splitSentences(section.narration);
    expect(firstScene.sentences.map((sentence) => sentence.canonical_text)).toEqual(expectedSentences);
    expect(firstScene.sentences[0]).toMatchObject({
      id: sentenceId('section-01', 0, expectedSentences[0]),
      normalized_text: expectedSentences[0].trim().toLowerCase().replace(/\s+/g, ' '),
      source_section_id: 'section_01',
      source_offset: 0,
    });
    expect(firstScene.beats).toHaveLength(2);
    expect(firstScene.beats[0].intent).toBe('opener');
    expect(firstScene.discoveries[0].key).toBe('ada');

    const gameScene = result.artifact.detail.scenes[1];
    expect(gameScene.interactive_ref).toEqual({ component_id: 'GradientSurgeon' });
    expect(gameScene.beats).toHaveLength(3);
    expect(gameScene.beats[1].intent).toBe('demo');
    expect(gameScene.beats[1].visual_role).toBe('game');
    expect(gameScene.beats[2].visual_role).toBe('character');
    expect(result.diagnostics.map((diag) => diag.code)).toEqual([
      'scene-map.interactive.unknown_component',
    ]);
    expect(result.diagnostics[0].severity).toBe('warning');
  });

  it('builds a strict scene-map artifact for the looping-llms lesson', async () => {
    const corpusRaw = await readFile('lessons/looping-llms/artifacts/lesson-input.json', 'utf8');
    const curriculumRaw = await readFile('lessons/looping-llms/artifacts/curriculum.json', 'utf8');
    const corpus = LessonCorpusSchema.parse(JSON.parse(corpusRaw));
    const curriculum = CurriculumPlanSchema.parse(JSON.parse(curriculumRaw));
    const result = await runAnalytic({ corpus, curriculum });

    const expectedSentenceCount = requiredSections(corpus)
      .reduce((sum, section) => sum + splitSentences(section.narration).length, 0);
    const actualSentenceCount = result.artifact.detail.scenes
      .reduce((sum, scene) => sum + scene.sentences.length, 0);

    expect(result.artifact.content_map.acts).toHaveLength(1);
    expect(result.artifact.content_map.acts[0].scenes).toHaveLength(12);
    expect(result.artifact.detail.scenes).toHaveLength(12);
    expect(actualSentenceCount).toBe(expectedSentenceCount);
    expect(result.diagnostics.every((diag) => diag.severity !== 'error')).toBe(true);
  });
});

function requiredSections(corpus: ReturnType<typeof sceneMapCorpus>) {
  const sections = corpus.existing_sections;
  if (sections === undefined) throw new Error('fixture expected existing_sections');
  return sections;
}

function requiredSection(corpus: ReturnType<typeof sceneMapCorpus>, sourceSectionId: string) {
  for (const section of requiredSections(corpus)) {
    if (section.source_section_id === sourceSectionId) return section;
  }
  throw new Error(`missing fixture section ${sourceSectionId}`);
}
