import { describe, expect, it } from 'vitest';
import { interactiveTakeoverComposer } from './interactive-takeover';
import type { ComposerContext, InteractiveTakeoverPlan } from './types';

const ctx: ComposerContext = {
  production_id: 'demo',
  cast: [{
    id: 'narrator',
    name: 'Narrator',
    description: 'Guide',
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

describe('interactiveTakeoverComposer', () => {
  it('validates its own plan schema', () => {
    expect(interactiveTakeoverComposer.schema.parse(planFixture()).kind).toBe('interactive-takeover');
  });

  it('emits an interactive element, declaration, narration slot, and transition stub', () => {
    const delta = interactiveTakeoverComposer.compose(ctx, planFixture());
    const shots = delta.add_shots;
    const elements = delta.add_elements;
    const slots = delta.add_slots;
    const declared = delta.declared_components;
    const transitions = delta.add_transitions;

    if (
      shots === undefined ||
      elements === undefined ||
      slots === undefined ||
      declared === undefined ||
      transitions === undefined
    ) {
      throw new Error('interactive-takeover fixture expected rich delta fields');
    }

    expect(shots[0].shot.vo).toMatchObject({
      cast_id: 'narrator',
      audio: { slot_id: 'scene.try.vo0' },
    });
    expect(elements[0].element).toEqual({
      id: 'FixedPointHunter',
      kind: 'interactive-group',
      component_id: 'FixedPointHunter',
      initial_layout: {
        position: [0.5, 0.52, 0],
        size: { width: 0.72, height: 0.7 },
        z_order: 10,
      },
    });
    expect(slots[0].id).toBe('scene.try.vo0');
    expect(declared).toEqual([{
      scene_id: 'scene',
      shot_id: 'try',
      component_id: 'FixedPointHunter',
    }]);
    expect(transitions[0].kind).toBe('push');
  });
});

function planFixture(): InteractiveTakeoverPlan {
  return {
    kind: 'interactive-takeover',
    shot_address: { scene_id: 'scene', shot_id: 'try' },
    speakers: ['narrator'],
    spoken_lines: [{
      id: 'line-1',
      cast_id: 'narrator',
      text: 'Now you try.',
      source_sentence_ids: ['s1'],
      audio_slot_id: 'scene.try.vo0',
    }],
    duration_estimate_s: 6,
    transition_in: {
      kind: 'push',
      duration_ms: 500,
      ease: 'easeOut',
      direction: 'left',
    },
    component_id: 'FixedPointHunter',
    layout: {
      position: [0.5, 0.52, 0],
      size: { width: 0.72, height: 0.7 },
      z_order: 10,
    },
  };
}
