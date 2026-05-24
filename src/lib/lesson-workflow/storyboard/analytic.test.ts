import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { CurriculumPlanSchema } from '../curriculum/types';
import { LessonCorpusSchema } from '../ingest/types';
import { SceneMapArtifactSchema } from '../scene-map/types';
import { runAnalytic } from './analytic';
import { StoryboardSchema, type ShotPlan } from './types';
import { storyboardCorpus, storyboardCurriculum, storyboardSceneMap } from './test-fixtures';

describe('runAnalytic storyboard', () => {
  it('maps scene-map beats to deterministic ShotPlans for game and non-game scenes', async () => {
    const result = await runAnalytic({
      corpus: storyboardCorpus(),
      curriculum: storyboardCurriculum(),
      sceneMap: storyboardSceneMap(),
    });

    expect(result.storyboard.plans.map((plan) => plan.shot_address.shot_id)).toEqual([
      'shot-1-1',
      'shot-1-2',
      'shot-1-3',
      'shot-2-1',
      'shot-2-2',
      'shot-3-1',
      'shot-3-2',
      'shot-3-3',
    ]);
    expect(kindsForScene(result.storyboard.plans, 'scene-1')).toEqual([
      'narrator-opener',
      'interactive-takeover',
      'character-demo-beat',
    ]);
    expect(kindsForScene(result.storyboard.plans, 'scene-2')).toEqual([
      'narrative',
      'narrative',
    ]);
    expect(kindsForScene(result.storyboard.plans, 'scene-3')).toEqual([
      'narrative',
      'interactive-takeover',
      'narrative',
    ]);
    expect(result.storyboard.plans[0].background_intent).toMatchObject({ kind: 'gradient' });
    expect(result.storyboard.plans[1].background_intent).toBeUndefined();
    expect(result.storyboard.plans[3].transition_in).toEqual({ kind: 'cross-dissolve', duration_ms: 600 });
    expect(result.storyboard.plans[1].transition_in).toEqual({ kind: 'cut', duration_ms: 0 });
    expect(result.storyboard.plans[0].spoken_lines[0].audio_slot_id).toBe('audio-abcdef1234567890');
    expect(result.diagnostics.every((diagnostic) => diagnostic.severity !== 'error')).toBe(true);

    for (const plan of result.storyboard.plans) {
      const slotIds = plan.spoken_lines.map((line) => line.audio_slot_id);
      expect(new Set(slotIds).size).toBe(slotIds.length);
      for (const line of plan.spoken_lines) {
        expect(line.source_sentence_ids.length).toBeGreaterThan(0);
      }
    }
  });

  it('builds the looping-llms storyboard with 36 ShotPlans from 12 scenes', async () => {
    const corpusRaw = await readFile('lessons/looping-llms/artifacts/lesson-input.json', 'utf8');
    const curriculumRaw = await readFile('lessons/looping-llms/artifacts/curriculum.json', 'utf8');
    const sceneMapRaw = await readFile('lessons/looping-llms/artifacts/scene-map.json', 'utf8');
    const corpus = LessonCorpusSchema.parse(JSON.parse(corpusRaw));
    const curriculum = CurriculumPlanSchema.parse(JSON.parse(curriculumRaw));
    const sceneMap = SceneMapArtifactSchema.parse(JSON.parse(sceneMapRaw));
    const result = await runAnalytic({ corpus, curriculum, sceneMap });
    const parsed = StoryboardSchema.parse(result.storyboard);

    expect(parsed.plans).toHaveLength(36);
    expect(result.shotTierByScene.size).toBe(12);
    for (const shots of result.shotTierByScene.values()) {
      expect(shots).toHaveLength(3);
    }
    for (const plan of parsed.plans) {
      for (const line of plan.spoken_lines) {
        expect(line.source_sentence_ids.length).toBeGreaterThan(0);
      }
    }
  });
});

function kindsForScene(plans: ShotPlan[], sceneId: string): string[] {
  return plans
    .filter((plan) => plan.shot_address.scene_id === sceneId)
    .map((plan) => plan.kind);
}
