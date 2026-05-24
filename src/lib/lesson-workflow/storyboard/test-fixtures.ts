import { CurriculumPlanSchema, type CurriculumPlan } from '../curriculum/types';
import type { LessonCorpus } from '../ingest/types';
import { SceneMapArtifactSchema, type SceneMapArtifact } from '../scene-map/types';

const sourceHash = '1111111111111111111111111111111111111111111111111111111111111111';
const ingestedAt = '2026-05-24T00:00:00.000Z';

export function storyboardCorpus(): LessonCorpus {
  return {
    schema_version: 'loa.lesson-corpus.v1',
    slug: 'looping-llms',
    source_kind: 'existing-lesson',
    source_items: [],
    existing_sections: [
      existingSection(0, 'scene_one', '01', 'Scene One', 'Alpha opens. Game sentence. Ada closes.'),
      existingSection(1, 'scene_two', undefined, 'Scene Two', 'Beta opens. Beta closes.'),
      existingSection(2, 'scene_three', '03', 'Scene Three', 'Gamma opens. Second game sentence. Gamma closes.'),
    ],
    cast_seed: [
      { id: 'narrator', name: 'Narrator' },
      { id: 'ada', name: 'Ada Lovelace' },
      { id: 'grace', name: 'Grace Hopper' },
    ],
    audio_index: {
      lesson_slug: 'looping-llms',
      entries: [{
        hash: 'abcdef1234567890abcdef1234567890',
        text: 'Alpha opens.',
        voice_id: 'voice',
        file: 'alpha.mp3',
        timings: [{
          text: 'Alpha opens.',
          startMs: 0,
          durationMs: 1200,
        }],
      }],
    },
    interactive_inventory: [
      { component_id: 'GameOne', file_ref: 'games/GameOne.tsx' },
      { component_id: 'GameThree', file_ref: 'games/GameThree.tsx' },
    ],
    discovery_inventory: [],
    provenance: {
      ingested_at: ingestedAt,
      extractor_version: 'test',
      source_hash: sourceHash,
    },
  };
}

export function storyboardCurriculum(): CurriculumPlan {
  return CurriculumPlanSchema.parse({
    schema_version: 'loa.curriculum.v1',
    acts: [{
      id: 'main',
      title: 'Storyboard Fixture',
      summary: 'Storyboard fixture act.',
      scenes: [
        {
          id: 'scene-1',
          title: 'Scene One',
          eyebrow: '01',
          summary: 'The first scene opens a game.',
          learning_objective: 'Understand scene one.',
          cast_in_scene: ['narrator', 'ada'],
          has_game: true,
          game_component_id: 'GameOne',
          estimated_runtime_s: 12,
          source_section_id: 'scene_one',
        },
        {
          id: 'scene-2',
          title: 'Scene Two',
          summary: 'The middle scene has no game.',
          learning_objective: 'Understand scene two.',
          cast_in_scene: ['narrator'],
          has_game: false,
          estimated_runtime_s: 8,
          source_section_id: 'scene_two',
        },
        {
          id: 'scene-3',
          title: 'Scene Three',
          eyebrow: '03',
          summary: 'The third scene has a second game.',
          learning_objective: 'Understand scene three.',
          cast_in_scene: ['narrator', 'grace'],
          has_game: true,
          game_component_id: 'GameThree',
          estimated_runtime_s: 12,
          source_section_id: 'scene_three',
        },
      ],
    }],
    estimated_total_runtime_s: 32,
    discovery_seed_plan: [],
    derivation: 'analytic',
  });
}

export function storyboardSceneMap(): SceneMapArtifact {
  return SceneMapArtifactSchema.parse({
    schema_version: 'loa.scene-map.v1',
    content_map: {
      schema_version: 'loa.content-map.v1',
      lesson_slug: 'looping-llms',
      acts: [{
        id: 'main',
        title: 'Storyboard Fixture',
        summary: 'Storyboard fixture act.',
        scenes: [
          contentScene('scene-1', 'scene_one', '01', 'Scene One', ['narrator', 'ada'], 'GameOne'),
          contentScene('scene-2', 'scene_two', undefined, 'Scene Two', ['narrator'], undefined),
          contentScene('scene-3', 'scene_three', '03', 'Scene Three', ['narrator', 'grace'], 'GameThree'),
        ],
      }],
    },
    detail: {
      scenes: [
        {
          scene_id: 'scene-1',
          source_section_id: 'scene_one',
          eyebrow: '01',
          title: 'Scene One',
          summary: 'The first scene opens a game.',
          learning_objective: 'Understand scene one.',
          cast_in_scene: ['narrator', 'ada'],
          interactive_ref: { component_id: 'GameOne' },
          discoveries: [],
          beats: [
            beat('beat-1-1', 'opener', ['narrator'], ['s1-a'], 'background'),
            beat('beat-1-2', 'demo', ['narrator'], ['s1-b'], 'game'),
            beat('beat-1-3', 'closer', ['narrator', 'ada'], ['s1-c'], 'character'),
          ],
          sentences: [
            sentence('s1-a', 'Alpha opens.', 0, 'scene_one'),
            sentence('s1-b', 'Game sentence.', 1, 'scene_one'),
            sentence('s1-c', 'Ada closes.', 2, 'scene_one'),
          ],
        },
        {
          scene_id: 'scene-2',
          source_section_id: 'scene_two',
          title: 'Scene Two',
          summary: 'The middle scene has no game.',
          learning_objective: 'Understand scene two.',
          cast_in_scene: ['narrator'],
          discoveries: [],
          beats: [
            beat('beat-2-1', 'opener', ['narrator'], ['s2-a'], 'background'),
            beat('beat-2-2', 'closer', ['narrator'], ['s2-b'], 'background'),
          ],
          sentences: [
            sentence('s2-a', 'Beta opens.', 0, 'scene_two'),
            sentence('s2-b', 'Beta closes.', 1, 'scene_two'),
          ],
        },
        {
          scene_id: 'scene-3',
          source_section_id: 'scene_three',
          eyebrow: '03',
          title: 'Scene Three',
          summary: 'The third scene has a second game.',
          learning_objective: 'Understand scene three.',
          cast_in_scene: ['narrator', 'grace'],
          interactive_ref: { component_id: 'GameThree' },
          discoveries: [],
          beats: [
            beat('beat-3-1', 'opener', ['narrator'], ['s3-a'], 'background'),
            beat('beat-3-2', 'demo', ['narrator'], ['s3-b'], 'game'),
            beat('beat-3-3', 'closer', ['grace'], ['s3-c'], 'background'),
          ],
          sentences: [
            sentence('s3-a', 'Gamma opens.', 0, 'scene_three'),
            sentence('s3-b', 'Second game sentence.', 1, 'scene_three'),
            sentence('s3-c', 'Gamma closes.', 2, 'scene_three'),
          ],
        },
      ],
    },
  });
}

function existingSection(
  index: number,
  sourceSectionId: string,
  eyebrow: string | undefined,
  title: string,
  narration: string,
): NonNullable<LessonCorpus['existing_sections']>[number] {
  const base = {
    index,
    source_section_id: sourceSectionId,
    title,
    narration,
    discoveries: {},
    source_offset: {
      start_line: index * 10 + 1,
      end_line: index * 10 + 5,
    },
  };
  if (eyebrow === undefined) return base;
  return {
    ...base,
    eyebrow,
  };
}

function contentScene(
  id: string,
  sourceSectionId: string,
  eyebrow: string | undefined,
  title: string,
  castInScene: string[],
  componentId: string | undefined,
) {
  const base = {
    id,
    source_section_id: sourceSectionId,
    title,
    summary: `${title} summary.`,
    learning_objective: `Understand ${title}.`,
    cast_in_scene: castInScene,
    discoveries: [],
    shots: [],
  };
  const withEyebrow = eyebrow === undefined
    ? base
    : {
      ...base,
      eyebrow,
    };
  if (componentId === undefined) return withEyebrow;
  return {
    ...withEyebrow,
    interactive_ref: {
      component_id: componentId,
    },
  };
}

function beat(
  id: string,
  intent: 'opener' | 'mechanism-explainer' | 'demo' | 'aside' | 'closer' | 'transition',
  speakerIds: string[],
  sourceSentenceIds: string[],
  visualRole: 'background' | 'character' | 'callout' | 'game' | 'mixed',
) {
  return {
    id,
    intent,
    speaker_ids: speakerIds,
    source_sentence_ids: sourceSentenceIds,
    visual_role: visualRole,
  };
}

function sentence(id: string, text: string, offset: number, sourceSectionId: string) {
  return {
    id,
    canonical_text: text,
    normalized_text: text.toLowerCase(),
    source_section_id: sourceSectionId,
    source_offset: offset,
  };
}
