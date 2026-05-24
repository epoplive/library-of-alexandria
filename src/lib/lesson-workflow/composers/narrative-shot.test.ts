import { describe, expect, it } from 'vitest';
import { narrativeShotComposer } from './narrative-shot';
import type { ComposerContext, NarrativeShotPlan } from './types';

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

describe('narrativeShotComposer', () => {
  it('validates its own plan schema', () => {
    expect(narrativeShotComposer.schema.parse(planFixture()).kind).toBe('narrative');
  });

  it('emits one shot with VO, dialogue spillover, slots, and transition stub', () => {
    const delta = narrativeShotComposer.compose(ctx, planFixture());
    const shots = delta.add_shots;
    const slots = delta.add_slots;
    const transitions = delta.add_transitions;

    if (shots === undefined || slots === undefined || transitions === undefined) {
      throw new Error('narrative fixture expected shots, slots, and transition');
    }

    expect(shots[0].shot.vo).toEqual({
      cast_id: 'narrator',
      line: { text: 'First line.' },
      audio: { slot_id: 'scene.beat.vo0' },
    });
    expect(shots[0].shot.dialogue).toEqual([{
      id: 'line-2',
      cast_id: 'narrator',
      line: { text: 'Second line.' },
      audio: { slot_id: 'scene.beat.vo1' },
    }]);
    expect(slots.map((slot) => slot.kind)).toEqual(['audio-vo', 'audio-vo']);
    expect(transitions[0]).toMatchObject({
      from: { scene_id: 'scene', shot_id: 'beat' },
      to: { scene_id: 'scene', shot_id: 'beat' },
      kind: 'fade',
      duration_ms: 300,
    });
  });
});

function planFixture(): NarrativeShotPlan {
  return {
    kind: 'narrative',
    shot_address: { scene_id: 'scene', shot_id: 'beat' },
    speakers: ['narrator'],
    spoken_lines: [
      {
        id: 'line-1',
        cast_id: 'narrator',
        text: 'First line.',
        source_sentence_ids: ['s1'],
        audio_slot_id: 'scene.beat.vo0',
      },
      {
        id: 'line-2',
        cast_id: 'narrator',
        text: 'Second line.',
        source_sentence_ids: ['s2'],
        audio_slot_id: 'scene.beat.vo1',
      },
    ],
    transition_in: {
      kind: 'fade',
      duration_ms: 300,
    },
    duration_estimate_s: 4,
  };
}
