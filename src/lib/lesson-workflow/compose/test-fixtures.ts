import type { AssetManifest, CastMember, Production } from '@/lib/lattice';
import { defineInteractivesRegistry } from '@/lib/interactives';
import type { ContentMap } from '../project-schema';
import type { Storyboard } from '../storyboard/types';

export function fixtureCast(): CastMember[] {
  return [{
    id: 'narrator',
    name: 'Narrator',
    description: 'Fixture narrator',
    voice_profile: {
      service: 'kokoro',
      voice_id: 'af_bella',
    },
  }];
}

export function fixtureInteractives() {
  return defineInteractivesRegistry({});
}

export function fixtureStoryboard(): Storyboard {
  return {
    schema_version: 'loa.storyboard.v1',
    plans: [
      {
        kind: 'title-card',
        shot_address: { scene_id: 'demo-scene', shot_id: 'title' },
        speakers: [],
        spoken_lines: [],
        duration_estimate_s: 2,
        eyebrow: '01 demo',
        title: 'Compose Fixture',
      },
      {
        kind: 'narrative',
        shot_address: { scene_id: 'demo-scene', shot_id: 'beat' },
        speakers: ['narrator'],
        spoken_lines: [{
          id: 'line-1',
          cast_id: 'narrator',
          text: 'Deterministic compose output.',
          source_sentence_ids: ['sentence-1'],
          audio_slot_id: 'demo-scene.beat.vo0',
        }],
        duration_estimate_s: 3,
        transition_in: {
          kind: 'cross-dissolve',
          duration_ms: 300,
          ease: 'easeOut',
        },
      },
    ],
  };
}

export function fixtureContentMap(): ContentMap {
  return {
    schema_version: 'loa.content-map.v1',
    lesson_slug: 'compose-fixture',
    acts: [{
      id: 'act-1',
      title: 'Act 1',
      scenes: [{
        id: 'demo-scene',
        title: 'Demo Scene',
        cast_in_scene: ['narrator'],
        discoveries: [],
        shots: [
          {
            id: 'title',
            kind: 'title-card',
            speakers: [],
            duration_estimate_s: 2,
            keyframes: [{
              id: 'key-title',
              shot_id: 'title',
              at: 0,
            }],
          },
          {
            id: 'beat',
            kind: 'narrative',
            speakers: ['narrator'],
            duration_estimate_s: 3,
            keyframes: [{
              id: 'key-beat',
              shot_id: 'beat',
              at: 0,
            }],
          },
        ],
      }],
    }],
  };
}

export function emitterProductionFixture(): Production {
  return {
    id: 'fixture',
    title: 'Fixture',
    summary: 'A deterministic fixture production.',
    tags: ['test'],
    tier: 'v0.1',
    characters: fixtureCast(),
    scenes: [{
      id: 'intro',
      title: 'Intro',
      shots: [{
        id: 'open',
        duration: 1.5,
        elements: [{
          id: 'title',
          kind: 'text-overlay',
          text: 'Hello "Compose"',
          initial_layout: {
            position: [0.5, 0.5, 0],
            opacity: 1,
          },
        }],
        cues: [{
          kind: 'visibility',
          element_id: 'title',
          at: 0.25,
          visible: true,
        }],
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
      authors: ['Fixture'],
      created_at: '1970-01-01T00:00:00.000Z',
      license: 'CC-BY-4.0',
    },
    default_aspect: '16:9',
  };
}

export function emitterManifestFixture(): AssetManifest {
  return {
    production_id: 'fixture',
    slots: {
      'intro.open.vo0': {
        id: 'intro.open.vo0',
        kind: 'audio-vo',
        description: 'Narration for intro/open.',
        takes: [],
      },
    },
    ledger: [],
  };
}
