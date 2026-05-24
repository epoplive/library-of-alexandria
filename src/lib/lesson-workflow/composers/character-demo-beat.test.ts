import { describe, expect, it } from 'vitest';
import { characterDemoBeatComposer } from './character-demo-beat';
import type { CharacterDemoBeatPlan, ComposerContext } from './types';

const ctx: ComposerContext = {
  production_id: 'demo',
  cast: [{
    id: 'ada',
    name: 'Ada',
    description: 'Demo character',
    voice_profile: {
      service: 'kokoro',
      voice_id: 'af_bella',
    },
  }],
  interactives: {},
  manifest_view: {
    production_id: 'demo',
    slots: {},
    ledger: [],
    updated_at: '2026-05-23T00:00:00.000Z',
  },
};

describe('characterDemoBeatComposer', () => {
  it('validates its own plan schema', () => {
    expect(characterDemoBeatComposer.schema.parse(planFixture()).kind).toBe('character-demo-beat');
  });

  it('emits character entrance, dialogue, action cues, slots, and declared components', () => {
    const delta = characterDemoBeatComposer.compose(ctx, planFixture());
    const shots = delta.add_shots;
    const elements = delta.add_elements;
    const cues = delta.add_cues;
    const slots = delta.add_slots;
    const declared = delta.declared_components;

    if (
      shots === undefined ||
      elements === undefined ||
      cues === undefined ||
      slots === undefined ||
      declared === undefined
    ) {
      throw new Error('character-demo fixture expected rich delta fields');
    }

    expect(shots[0].shot.dialogue).toEqual([{
      id: 'ada-1',
      cast_id: 'ada',
      line: { text: 'Watch the reset.' },
      audio: { slot_id: 'scene.demo.ada.dialogue0' },
    }]);
    expect(elements[0].element).toMatchObject({
      id: 'character.ada',
      kind: 'character',
      cast_id: 'ada',
      pose_policy: { mode: 'dialogue-auto' },
      initial_layout: {
        position: [1.2, 0.62, 0],
      },
    });
    expect(cues.map((entry) => entry.cue.kind)).toEqual(['transform', 'action']);
    expect(cues[0].cue).toMatchObject({
      id: 'character.ada.enter',
      element_id: 'character.ada',
      at: 0,
      transition: { duration_ms: 600, ease: 'easeOut' },
    });
    expect(cues[1].cue).toMatchObject({
      kind: 'action',
      element_id: 'FixedPointHunter',
      method: 'reset',
      args: [],
      at: 1.2,
    });
    expect(slots[0].kind).toBe('audio-dialogue');
    expect(declared).toEqual([{
      scene_id: 'scene',
      shot_id: 'demo',
      component_id: 'FixedPointHunter',
    }]);
  });
});

function planFixture(): CharacterDemoBeatPlan {
  return {
    kind: 'character-demo-beat',
    shot_address: { scene_id: 'scene', shot_id: 'demo' },
    speakers: ['ada'],
    spoken_lines: [{
      id: 'ada-1',
      cast_id: 'ada',
      text: 'Watch the reset.',
      source_sentence_ids: ['s1'],
      audio_slot_id: 'scene.demo.ada.dialogue0',
    }],
    duration_estimate_s: 5,
    characters_on_stage: [{
      cast_id: 'ada',
      enter_from: 'right',
    }],
    action_cues: [{
      cast_id: 'ada',
      at_s: 1.2,
      component_id: 'FixedPointHunter',
      method: 'reset',
      args: [],
    }],
  };
}
