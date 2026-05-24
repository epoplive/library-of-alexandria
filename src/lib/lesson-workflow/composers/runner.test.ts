import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineInteractiveContract, defineInteractivesRegistry } from '@/lib/interactives';
import { composeProduction } from './runner';
import type { ComposerContext, ShotPlan } from './types';

function FakeComponent() {
  return null;
}

describe('composeProduction', () => {
  it('returns an empty production and manifest for an empty plan list', () => {
    const result = composeProduction([], baseContext());

    expect(result.diagnostics).toEqual([]);
    expect(result.production.scenes).toEqual([]);
    expect(Object.keys(result.manifest.slots)).toEqual([]);
  });

  it('composes a small title plus narrative production', () => {
    const result = composeProduction([
      {
        kind: 'title-card',
        shot_address: { scene_id: 'demo-scene', shot_id: 'title' },
        speakers: [],
        spoken_lines: [],
        duration_estimate_s: 2,
        eyebrow: '01 puzzle',
        title: 'Demo lesson',
      },
      {
        kind: 'narrative',
        shot_address: { scene_id: 'demo-scene', shot_id: 'beat1' },
        speakers: ['narrator'],
        spoken_lines: [{
          id: 'l1',
          cast_id: 'narrator',
          text: 'Hello world.',
          source_sentence_ids: ['s1'],
          audio_slot_id: 'demo-scene.beat1.vo0',
        }],
        duration_estimate_s: 4,
      },
    ], baseContext());

    expect(result.diagnostics).toEqual([]);
    expect(result.production.scenes).toHaveLength(1);
    expect(result.production.scenes[0].shots).toHaveLength(2);
    expect(Object.keys(result.manifest.slots)).toEqual(['demo-scene.beat1.vo0']);
  });

  it('stitches transition stubs to adjacent shots', () => {
    const result = composeProduction([
      {
        kind: 'title-card',
        shot_address: { scene_id: 'scene', shot_id: 'a' },
        speakers: [],
        spoken_lines: [],
        duration_estimate_s: 1,
        title: 'A',
      },
      {
        kind: 'narrative',
        shot_address: { scene_id: 'scene', shot_id: 'b' },
        speakers: ['narrator'],
        spoken_lines: [{
          id: 'l1',
          cast_id: 'narrator',
          text: 'B',
          source_sentence_ids: ['s1'],
          audio_slot_id: 'scene.b.vo0',
        }],
        duration_estimate_s: 2,
        transition_in: {
          kind: 'cross-dissolve',
          duration_ms: 400,
          ease: 'easeOut',
        },
      },
    ], baseContext());

    expect(result.diagnostics).toEqual([]);
    expect(result.production.transitions).toEqual([{
      id: 'transition.scene.a.to.scene.b',
      from: { scene_id: 'scene', shot_id: 'a' },
      to: { scene_id: 'scene', shot_id: 'b' },
      kind: 'cross-dissolve',
      duration: 400,
      ease: 'easeOut',
      direction: undefined,
    }]);
  });

  it('diagnoses unknown cast ids without throwing', () => {
    const result = composeProduction([{
      kind: 'narrative',
      shot_address: { scene_id: 'scene', shot_id: 'beat' },
      speakers: ['missing'],
      spoken_lines: [{
        id: 'l1',
        cast_id: 'missing',
        text: 'No cast.',
        source_sentence_ids: ['s1'],
        audio_slot_id: 'scene.beat.vo0',
      }],
      duration_estimate_s: 2,
    }], baseContext());

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('composer.cast.missing');
    expect(result.production.scenes[0].shots).toHaveLength(1);
  });

  it('diagnoses action cue methods missing from the interactive contract', () => {
    const contract = defineInteractiveContract({
      component_id: 'DemoGame',
      methods: {
        reset: z.tuple([]),
      },
    });
    const result = composeProduction([{
      kind: 'character-demo-beat',
      shot_address: { scene_id: 'scene', shot_id: 'demo' },
      speakers: ['narrator'],
      spoken_lines: [],
      duration_estimate_s: 3,
      characters_on_stage: [],
      action_cues: [{
        cast_id: 'narrator',
        at_s: 0.5,
        component_id: 'DemoGame',
        method: 'jump',
        args: [],
      }],
    }], {
      ...baseContext(),
      interactives: defineInteractivesRegistry({
        DemoGame: { component: FakeComponent, contract },
      }),
    });

    expect(result.diagnostics).toContainEqual({
      code: 'interactive.action.unknown_method',
      path: ['scenes', 0, 'shots', 0, 'cues', 0, 'method'],
      actual: {
        component_id: 'DemoGame',
        method: 'jump',
      },
      expected: ['reset'],
      repair: 'use one of reset on "DemoGame".',
      severity: 'error',
    });
  });

  it('diagnoses duplicate shot addresses', () => {
    const plans: ShotPlan[] = [
      {
        kind: 'title-card',
        shot_address: { scene_id: 'scene', shot_id: 'same' },
        speakers: [],
        spoken_lines: [],
        duration_estimate_s: 1,
        title: 'First',
      },
      {
        kind: 'title-card',
        shot_address: { scene_id: 'scene', shot_id: 'same' },
        speakers: [],
        spoken_lines: [],
        duration_estimate_s: 1,
        title: 'Second',
      },
    ];

    const result = composeProduction(plans, baseContext());

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('composer.shot.duplicate');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('composer.shot.count');
    expect(result.production.scenes[0].shots).toHaveLength(1);
  });
});

function baseContext(): ComposerContext {
  return {
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
}
