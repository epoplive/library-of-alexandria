import { describe, expect, it } from 'vitest';
import { narratorOpenerComposer } from './narrator-opener';
import type { ComposerContext, NarratorOpenerPlan } from './types';

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

describe('narratorOpenerComposer', () => {
  it('validates its own plan schema', () => {
    expect(narratorOpenerComposer.schema.parse(planFixture()).kind).toBe('narrator-opener');
  });

  it('emits a scene, opener overlays, keyframes, narration slot, and background', () => {
    const delta = narratorOpenerComposer.compose(ctx, planFixture());
    const scenes = delta.add_scenes;
    const shots = delta.add_shots;
    const elements = delta.add_elements;
    const cues = delta.add_cues;
    const slots = delta.add_slots;
    const backgrounds = delta.set_scene_background;

    if (
      scenes === undefined ||
      shots === undefined ||
      elements === undefined ||
      cues === undefined ||
      slots === undefined ||
      backgrounds === undefined
    ) {
      throw new Error('narrator-opener fixture expected all rich delta fields');
    }

    expect(scenes[0]).toMatchObject({
      id: 'scene',
      eyebrow: '02 method',
      title: 'The Method',
      shots: [],
    });
    expect(shots[0].shot.vo).toMatchObject({
      cast_id: 'narrator',
      audio: { slot_id: 'scene.open.vo0' },
    });
    expect(elements.map((entry) => entry.element.id)).toEqual([
      'narrator-opener.eyebrow',
      'narrator-opener.title',
    ]);
    expect(cues.map((entry) => entry.cue.at)).toEqual([0, 0.15]);
    expect(slots[0].id).toBe('scene.open.vo0');
    expect(backgrounds[0].background).toEqual({ kind: 'none' });
  });
});

function planFixture(): NarratorOpenerPlan {
  return {
    kind: 'narrator-opener',
    shot_address: { scene_id: 'scene', shot_id: 'open' },
    speakers: ['narrator'],
    spoken_lines: [{
      id: 'line-1',
      cast_id: 'narrator',
      text: 'Let us start.',
      source_sentence_ids: ['s1'],
      audio_slot_id: 'scene.open.vo0',
    }],
    duration_estimate_s: 3,
    background_intent: { kind: 'none' },
    scene_eyebrow: '02 method',
    scene_title: 'The Method',
  };
}
