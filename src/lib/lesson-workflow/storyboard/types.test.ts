import { describe, expect, it } from 'vitest';
import {
  CharacterDemoBeatPlanSchema,
  InteractiveTakeoverPlanSchema,
  NarrativeShotPlanSchema,
  NarratorOpenerPlanSchema,
  TitleCardPlanSchema,
} from './types';

describe('ShotPlan schemas', () => {
  it('parses title-card plans and rejects a missing title', () => {
    const valid = {
      kind: 'title-card',
      shot_address: { scene_id: 'scene-1', shot_id: 'shot-1-1' },
      speakers: [],
      spoken_lines: [],
      duration_estimate_s: 2,
      title: 'Looped Language Models',
    };
    expect(TitleCardPlanSchema.parse(valid).title).toBe('Looped Language Models');

    const { title, ...withoutTitle } = valid;
    void title;
    expect(() => TitleCardPlanSchema.parse(withoutTitle)).toThrow();
  });

  it('parses narrative plans without scene_title', () => {
    const parsed = NarrativeShotPlanSchema.parse(basePlan('narrative'));
    expect(parsed.kind).toBe('narrative');
    expect('scene_title' in parsed).toBe(false);
  });

  it('parses narrator-opener plans and rejects a missing scene_title', () => {
    const valid = {
      ...basePlan('narrator-opener'),
      scene_eyebrow: '01',
      scene_title: 'Opening Scene',
    };
    expect(NarratorOpenerPlanSchema.parse(valid).scene_title).toBe('Opening Scene');

    const { scene_title, ...withoutSceneTitle } = valid;
    void scene_title;
    expect(() => NarratorOpenerPlanSchema.parse(withoutSceneTitle)).toThrow();
  });

  it('parses character-demo-beat plans and rejects a missing characters_on_stage field', () => {
    const valid = {
      ...basePlan('character-demo-beat'),
      characters_on_stage: [{ cast_id: 'narrator', enter_from: 'left' }],
      action_cues: [{
        cast_id: 'narrator',
        at_s: 1,
        component_id: 'FixedPointHunter',
        method: 'reset',
        args: [],
      }],
    };
    expect(CharacterDemoBeatPlanSchema.parse(valid).characters_on_stage).toHaveLength(1);

    const { characters_on_stage, ...withoutCharactersOnStage } = valid;
    void characters_on_stage;
    expect(() => CharacterDemoBeatPlanSchema.parse(withoutCharactersOnStage)).toThrow();
  });

  it('parses interactive-takeover plans and rejects a missing component_id', () => {
    const valid = {
      ...basePlan('interactive-takeover'),
      component_id: 'FixedPointHunter',
      layout: {
        position: [0.5, 0.5, 0],
        size: { width: 0.8, height: 0.8 },
      },
    };
    expect(InteractiveTakeoverPlanSchema.parse(valid).component_id).toBe('FixedPointHunter');

    const { component_id, ...withoutComponentId } = valid;
    void component_id;
    expect(() => InteractiveTakeoverPlanSchema.parse(withoutComponentId)).toThrow();
  });
});

function basePlan(kind: string) {
  return {
    kind,
    shot_address: { scene_id: 'scene-1', shot_id: 'shot-1-1' },
    speakers: ['narrator'],
    spoken_lines: [{
      id: 'line-shot-1-1-1',
      cast_id: 'narrator',
      text: 'The narrator opens the scene.',
      source_sentence_ids: ['sentence-1'],
      audio_slot_id: 'audio-pending-1',
    }],
    transition_in: {
      kind: 'cut',
      duration_ms: 0,
    },
    duration_estimate_s: 2,
  };
}
