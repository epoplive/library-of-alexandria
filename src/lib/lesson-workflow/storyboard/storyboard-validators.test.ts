import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { defineInteractiveContract, defineInteractivesRegistry } from '@/lib/interactives';
import { validateStoryboard } from './storyboard-validators';
import {
  StoryboardSchema,
  type InteractiveTakeoverPlan,
  type NarrativeShotPlan,
  type Storyboard,
} from './types';
import { storyboardCorpus, storyboardSceneMap } from './test-fixtures';

describe('validateStoryboard', () => {
  it('diagnoses unanchored spoken lines', () => {
    const storyboard = StoryboardSchema.parse({
      schema_version: 'loa.storyboard.v1',
      plans: [narrativePlan({
        spoken_lines: [line('missing-sentence', 'audio-1')],
      })],
    });

    expect(codes(validateStoryboard(storyboard, context()))).toContain('storyboard.line.unanchored');
  });

  it('diagnoses action methods missing from an interactive contract', () => {
    const storyboard = StoryboardSchema.parse({
      schema_version: 'loa.storyboard.v1',
      plans: [{
        ...narrativePlan({}),
        kind: 'character-demo-beat',
        characters_on_stage: [{ cast_id: 'narrator' }],
        action_cues: [{
          cast_id: 'narrator',
          at_s: 1,
          component_id: 'KnownGame',
          method: 'missingMethod',
          args: [],
        }],
      }],
    });
    const diagnostics = validateStoryboard(storyboard, {
      ...context(),
      interactives: knownRegistry(),
    });

    expect(codes(diagnostics)).toContain('storyboard.action.unknown_method');
    expect(diagnostics[0].repair).toContain('reset');
  });

  it('diagnoses transition stubs on non-adjacent shots', () => {
    const storyboard = StoryboardSchema.parse({
      schema_version: 'loa.storyboard.v1',
      plans: [
        narrativePlan({}),
        narrativePlan({
          shot_address: { scene_id: 'scene-1', shot_id: 'shot-1-3' },
          spoken_lines: [line('s1-b', 'audio-2')],
          transition_in: { kind: 'cut', duration_ms: 0 },
        }),
      ],
    });

    expect(codes(validateStoryboard(storyboard, context()))).toContain('storyboard.transition.non_adjacent');
  });

  it('diagnoses non-title shots without speakers', () => {
    const storyboard = StoryboardSchema.parse({
      schema_version: 'loa.storyboard.v1',
      plans: [narrativePlan({ speakers: [] })],
    });

    expect(codes(validateStoryboard(storyboard, context()))).toContain('storyboard.shot.missing_speaker');
  });

  it('diagnoses unknown takeover components as warning for an empty registry and error for a populated registry', () => {
    const storyboard = StoryboardSchema.parse({
      schema_version: 'loa.storyboard.v1',
      plans: [interactivePlan('MissingGame')],
    });
    const warningDiagnostics = validateStoryboard(storyboard, {
      ...context(),
      interactives: defineInteractivesRegistry({}),
    });
    const errorDiagnostics = validateStoryboard(storyboard, {
      ...context(),
      interactives: knownRegistry(),
    });

    expect(warningDiagnostics[0]).toMatchObject({
      code: 'storyboard.takeover.unknown_component',
      severity: 'warning',
    });
    expect(errorDiagnostics[0]).toMatchObject({
      code: 'storyboard.takeover.unknown_component',
      severity: 'error',
    });
  });

  it('diagnoses narrator openers with an empty scene title', () => {
    const storyboard: Storyboard = {
      schema_version: 'loa.storyboard.v1',
      plans: [{
        ...narrativePlan({}),
        kind: 'narrator-opener',
        scene_title: '',
      }],
    };

    expect(codes(validateStoryboard(storyboard, context()))).toContain('storyboard.opener.missing_title');
  });

  it('diagnoses duplicate audio slots within one shot', () => {
    const storyboard = StoryboardSchema.parse({
      schema_version: 'loa.storyboard.v1',
      plans: [narrativePlan({
        spoken_lines: [
          line('s1-a', 'audio-duplicate'),
          line('s1-b', 'audio-duplicate'),
        ],
      })],
    });

    expect(codes(validateStoryboard(storyboard, context()))).toContain('storyboard.audio.duplicate_slot');
  });
});

function context() {
  return {
    corpus: storyboardCorpus(),
    sceneMap: storyboardSceneMap(),
  };
}

function knownRegistry() {
  const contract = defineInteractiveContract({
    component_id: 'KnownGame',
    methods: {
      reset: z.tuple([]),
    },
  });
  return defineInteractivesRegistry({
    KnownGame: {
      component: KnownGame,
      contract,
    },
  });
}

function KnownGame(): null {
  return null;
}

function narrativePlan(overrides: Partial<NarrativeShotPlan>): NarrativeShotPlan {
  return {
    kind: 'narrative',
    shot_address: { scene_id: 'scene-1', shot_id: 'shot-1-1' },
    speakers: ['narrator'],
    spoken_lines: [line('s1-a', 'audio-1')],
    duration_estimate_s: 1.2,
    ...overrides,
  };
}

function interactivePlan(componentId: string): InteractiveTakeoverPlan {
  return {
    ...narrativePlan({}),
    kind: 'interactive-takeover',
    component_id: componentId,
    layout: {
      position: [0.5, 0.5, 0],
      size: { width: 0.8, height: 0.8 },
    },
  };
}

function line(sentenceId: string, audioSlotId: string) {
  return {
    id: `line-${sentenceId}`,
    cast_id: 'narrator',
    text: sentenceId,
    source_sentence_ids: [sentenceId],
    audio_slot_id: audioSlotId,
  };
}

function codes(diagnostics: ReturnType<typeof validateStoryboard>): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}
