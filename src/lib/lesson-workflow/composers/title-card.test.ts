import { describe, expect, it } from 'vitest';
import { titleCardComposer } from './title-card';
import type { ComposerContext, TitleCardPlan } from './types';

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

describe('titleCardComposer', () => {
  it('validates its own plan schema', () => {
    const parsed = titleCardComposer.schema.parse(planFixture());

    expect(parsed.kind).toBe('title-card');
    expect(parsed.title).toBe('Demo lesson');
  });

  it('emits text overlays, staggered keyframes, slots, background, and transition stub', () => {
    const delta = titleCardComposer.compose(ctx, planFixture());
    const shots = delta.add_shots;
    const elements = delta.add_elements;
    const cues = delta.add_cues;
    const slots = delta.add_slots;
    const backgrounds = delta.set_scene_background;
    const transitions = delta.add_transitions;

    if (
      shots === undefined ||
      elements === undefined ||
      cues === undefined ||
      slots === undefined ||
      backgrounds === undefined ||
      transitions === undefined
    ) {
      throw new Error('title-card fixture expected all rich delta fields');
    }

    expect(shots).toHaveLength(1);
    expect(shots[0].shot).toMatchObject({
      id: 'title',
      duration: 2,
      vo: {
        cast_id: 'narrator',
        audio: { slot_id: 'demo-scene.title.vo0' },
      },
    });
    expect(elements.map((entry) => entry.element.id)).toEqual([
      'title-card.eyebrow',
      'title-card.title',
      'title-card.subtitle',
    ]);
    expect(cues.map((entry) => entry.cue.at)).toEqual([0, 0.15, 0.4]);
    expect(slots).toEqual([{
      id: 'demo-scene.title.vo0',
      kind: 'audio-vo',
      description: 'Voiceover for narrator: Welcome in.',
      takes: [],
      selection: 'best-available',
    }]);
    expect(backgrounds).toEqual([{
      scene_id: 'demo-scene',
      background: {
        kind: 'gradient',
        stops: [
          { offset: 0, color: '#101820' },
          { offset: 1, color: '#243b53' },
        ],
      },
    }]);
    expect(transitions[0]).toMatchObject({
      from: { scene_id: 'demo-scene', shot_id: 'title' },
      to: { scene_id: 'demo-scene', shot_id: 'title' },
      kind: 'cross-dissolve',
      duration: 400,
      ease: 'easeOut',
    });
  });
});

function planFixture(): TitleCardPlan {
  return {
    kind: 'title-card',
    shot_address: { scene_id: 'demo-scene', shot_id: 'title' },
    speakers: ['narrator'],
    spoken_lines: [{
      id: 'line-1',
      cast_id: 'narrator',
      text: 'Welcome in.',
      source_sentence_ids: ['s1'],
      audio_slot_id: 'demo-scene.title.vo0',
    }],
    duration_estimate_s: 2,
    transition_in: {
      kind: 'cross-dissolve',
      duration_ms: 400,
      ease: 'easeOut',
    },
    background_intent: {
      kind: 'gradient',
      stops: [
        { offset: 0, color: '#101820' },
        { offset: 1, color: '#243b53' },
      ],
    },
    eyebrow: '01 puzzle',
    title: 'Demo lesson',
    subtitle: 'Composer layer',
  };
}
