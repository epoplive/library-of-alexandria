import { describe, expect, it } from 'vitest';
import type { AssetManifest, Production, Shot } from './lattice';
import {
  validateCharacterPoses,
  validateShotDialogue,
} from './dialogue-validators';

describe('validateShotDialogue', () => {
  it('reports dialogue audio without a ready v0.1 Take', () => {
    const shot: Shot = {
      id: 'shot',
      duration: 2,
      elements: [],
      dialogue: [{
        id: 'd1',
        cast_id: 'duck',
        line: { text: 'Quack quack' },
        audio: { slot_id: 'duck.line.1' },
      }],
    };
    const manifest: AssetManifest = {
      production_id: 'p',
      slots: {
        'duck.line.1': {
          id: 'duck.line.1',
          kind: 'audio-dialogue',
          description: 'Dialogue line',
          takes: [],
        },
      },
    };

    expect(validateShotDialogue(shot, manifest, { tier: 'v0.1' })).toEqual([{
      code: 'dialogue.audio.missing_v0_1',
      path: ['dialogue', 0, 'audio', 'slot_id'],
      actual: {
        slot_id: 'duck.line.1',
        cast_id: 'duck',
        line: 'Quack quack',
      },
      expected: 'ready v0.1 Take',
      repair: 'render or attach a ready v0.1 Take for "duck.line.1".',
      severity: 'error',
    }]);
  });
});

describe('validateCharacterPoses', () => {
  it('reports a character Element whose cast_id is not registered', () => {
    const production = baseProduction({
      id: 'duck-el',
      kind: 'character',
      cast_id: 'duck',
      pose_policy: { mode: 'dialogue-auto' },
    });

    expect(validateCharacterPoses(production, emptyManifest())).toEqual([{
      code: 'character.cast.missing',
      path: ['scenes', 0, 'shots', 0, 'elements', 0, 'cast_id'],
      actual: 'duck',
      expected: 'CastMember declared in Production.characters',
      repair: 'add CastMember "duck" or update the character Element cast_id.',
      severity: 'error',
    }]);
  });

  it('reports missing pose slots required by a character pose policy', () => {
    const production = {
      ...baseProduction({
        id: 'duck-el',
        kind: 'character',
        cast_id: 'duck',
        pose_policy: { mode: 'dialogue-auto' },
      }),
      characters: [{
        id: 'duck',
        name: 'Duck',
        description: 'Test Cast member',
        voice_profile: { service: 'kokoro', voice_id: 'am_puck' },
        pose_slots: { idle: 'duck.idle' },
      }],
    } satisfies Production;
    const manifest: AssetManifest = {
      production_id: 'p',
      slots: {
        'duck.idle': {
          id: 'duck.idle',
          kind: 'image',
          description: 'Duck idle pose',
          takes: [],
        },
      },
    };

    expect(validateCharacterPoses(production, manifest)).toEqual([{
      code: 'character.pose_slot.missing',
      path: ['scenes', 0, 'shots', 0, 'elements', 0, 'pose_policy'],
      actual: {
        cast_id: 'duck',
        pose: 'speaking',
      },
      expected: 'pose_slots entry on the referenced CastMember',
      repair: 'add pose_slots.speaking to CastMember "duck".',
      severity: 'error',
    }]);
  });
});

function baseProduction(element: Shot['elements'][number]): Production {
  return {
    id: 'p',
    title: 'Production',
    summary: 'A test production for dialogue validators.',
    tags: ['test'],
    tier: 'v0.1',
    characters: [],
    scenes: [{
      id: 's',
      title: 'Scene',
      shots: [{
        id: 'shot',
        duration: 1,
        elements: [element],
      }],
    }],
    transitions: [],
    funding: {
      production_cost_usd: 0,
      donations_received_usd: 0,
      donation_links: {},
      planned_improvements: [],
      ledger: [],
    },
    provenance: {
      authors: ['test'],
      created_at: '2026-05-23T00:00:00.000Z',
      license: 'CC-BY-4.0',
    },
  };
}

function emptyManifest(): AssetManifest {
  return {
    production_id: 'p',
    slots: {},
  };
}
