import { CurriculumPlanSchema, type CurriculumPlan } from '../curriculum/types';
import { existingLessonCorpus, topicCorpus, validGeneratedPlan } from '../curriculum/test-fixtures';
import type { LessonCorpus } from '../ingest/types';
import { SceneMapArtifactSchema, type SceneMapArtifact } from './types';
import { sentenceId } from './analytic';

export function sceneMapCorpus(): LessonCorpus {
  return existingLessonCorpus();
}

export function sceneMapCurriculum(): CurriculumPlan {
  return CurriculumPlanSchema.parse({
    schema_version: 'loa.curriculum.v1',
    acts: [{
      id: 'main',
      title: 'Fixture Lesson',
      summary: 'A fixture lesson for scene-map tests.',
      scenes: [
        {
          id: 'section-01',
          title: 'Looped depth',
          eyebrow: '01',
          summary: 'Ada Lovelace explains looped depth.',
          learning_objective: 'Explain why repeated blocks create effective depth.',
          cast_in_scene: ['narrator', 'ada'],
          has_game: false,
          estimated_runtime_s: 300,
          source_section_id: 'section_01',
        },
        {
          id: 'section-02',
          title: 'Training failure',
          eyebrow: '02',
          summary: 'Grace Hopper shows a training failure.',
          learning_objective: 'Explain how checkpointing changes looped training.',
          cast_in_scene: ['ada', 'grace'],
          has_game: true,
          game_component_id: 'GradientSurgeon',
          estimated_runtime_s: 300,
          source_section_id: 'section_02',
        },
        {
          id: 'section-03',
          title: 'Cache pressure',
          summary: 'The narrator closes with cache pressure.',
          learning_objective: 'Predict when looping helps under cache pressure.',
          cast_in_scene: ['narrator'],
          has_game: false,
          estimated_runtime_s: 300,
          source_section_id: 'section_03',
        },
      ],
    }],
    estimated_total_runtime_s: 900,
    discovery_seed_plan: [{ key: 'ada', brief: 'Ada Lovelace is a useful historical anchor.', source_section_id: 'section_01' }],
    derivation: 'analytic',
  });
}

export function generatedCorpus(): LessonCorpus {
  return topicCorpus();
}

export function generatedSceneMapArtifact(): SceneMapArtifact {
  const plan = validGeneratedPlan({ derivation: 'generative' });
  const scene = plan.acts[0].scenes[0];
  const firstSentence = 'Looped depth spends compute without adding parameters.';
  const secondSentence = 'The learner sees the same block refine hidden state.';
  const firstSentenceId = sentenceId(scene.id, 0, firstSentence);
  const secondSentenceId = sentenceId(scene.id, 1, secondSentence);
  return SceneMapArtifactSchema.parse({
    schema_version: 'loa.scene-map.v1',
    content_map: {
      schema_version: 'loa.content-map.v1',
      lesson_slug: 'looping-llms',
      acts: [{
        id: plan.acts[0].id,
        title: plan.acts[0].title,
        summary: plan.acts[0].summary,
        scenes: [{
          id: scene.id,
          title: scene.title,
          summary: scene.summary,
          learning_objective: scene.learning_objective,
          cast_in_scene: scene.cast_in_scene,
          discoveries: [],
          shots: [],
        }],
      }],
    },
    detail: {
      scenes: [{
        scene_id: scene.id,
        title: scene.title,
        summary: scene.summary,
        learning_objective: scene.learning_objective,
        cast_in_scene: scene.cast_in_scene,
        discoveries: [],
        beats: [{
          id: 'beat-generated',
          intent: 'opener',
          speaker_ids: scene.cast_in_scene,
          source_sentence_ids: [firstSentenceId, secondSentenceId],
          visual_role: 'background',
        }],
        sentences: [
          {
            id: firstSentenceId,
            canonical_text: firstSentence,
            normalized_text: 'looped depth spends compute without adding parameters.',
            source_offset: 0,
          },
          {
            id: secondSentenceId,
            canonical_text: secondSentence,
            normalized_text: 'the learner sees the same block refine hidden state.',
            source_offset: 1,
          },
        ],
      }],
    },
  });
}
