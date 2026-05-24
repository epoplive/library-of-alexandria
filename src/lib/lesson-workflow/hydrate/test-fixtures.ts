import type { AssetManifest, CastMember, Take } from '@/lib/lattice';
import type { Storyboard } from '../storyboard/types';
import type { AudioIndex } from './types';

export function hydrateCastFixture(): CastMember[] {
  return [
    {
      id: 'narrator',
      name: 'Narrator',
      description: 'Fixture narrator',
      voice_profile: {
        service: 'kokoro',
        voice_id: 'af_bella',
        voice_model: 'fixture-voice-model',
      },
    },
    {
      id: 'duck',
      name: 'Duck',
      description: 'Fixture character',
      voice_profile: {
        service: 'kokoro',
        voice_id: 'am_puck',
      },
      pose_slots: {
        idle: 'pose.duck.idle',
      },
    },
  ];
}

export function hydrateCastWithoutPoseSlotsFixture(): CastMember[] {
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

export function hydrateStoryboardFixture(): Storyboard {
  return {
    schema_version: 'loa.storyboard.v1',
    plans: [{
      kind: 'narrative',
      shot_address: {
        scene_id: 'scene-one',
        shot_id: 'shot-one',
      },
      speakers: ['narrator'],
      spoken_lines: [
        {
          id: 'line-full',
          cast_id: 'narrator',
          text: 'A full line.',
          source_sentence_ids: ['source-1'],
          audio_slot_id: 'audio-line',
        },
        {
          id: 'line-section',
          cast_id: 'narrator',
          text: 'A timed sentence.',
          source_sentence_ids: ['source-2'],
          audio_slot_id: 'audio-section',
        },
        {
          id: 'line-missing',
          cast_id: 'narrator',
          text: 'No audio exists.',
          source_sentence_ids: ['source-3'],
          audio_slot_id: 'audio-missing',
        },
      ],
      duration_estimate_s: 9,
    }],
  };
}

export function hydrateManifestFixture(): AssetManifest {
  return {
    production_id: 'hydrate-fixture',
    slots: {
      'audio-line': {
        id: 'audio-line',
        kind: 'audio-vo',
        description: 'Line-level audio',
        takes: [],
      },
      'audio-section': {
        id: 'audio-section',
        kind: 'audio-vo',
        description: 'Section-level audio',
        takes: [],
      },
      'audio-missing': {
        id: 'audio-missing',
        kind: 'audio-vo',
        description: 'Missing audio',
        takes: [],
      },
      'pose.duck.idle': {
        id: 'pose.duck.idle',
        kind: 'image',
        description: 'Duck idle pose',
        takes: [],
      },
    },
    ledger: [],
  };
}

export function hydrateAudioIndexFixture(): AudioIndex {
  return {
    lesson: 'hydrate-fixture',
    entries: [
      {
        hash: 'linehash',
        text: 'A full line.',
        voice_id: 'af_bella',
        file: 'line.mp3',
        timings: [{
          text: 'A full line.',
          startMs: 0,
          durationMs: 1200,
        }],
      },
      {
        hash: 'sectionhash',
        text: 'Before. A timed sentence. After.',
        voice_id: 'af_bella',
        file: 'section.mp3',
        timings: [
          {
            text: 'Before.',
            startMs: 0,
            durationMs: 500,
          },
          {
            text: 'A timed sentence.',
            startMs: 500,
            durationMs: 1500,
          },
          {
            text: 'After.',
            startMs: 2000,
            durationMs: 700,
          },
        ],
      },
    ],
  };
}

export function readyTakeFixture(): Take {
  return {
    tier: 'v0.1',
    status: 'ready',
    artifact: {
      url: 'lessons/hydrate-fixture/audio/ready.mp3',
      path: 'lessons/hydrate-fixture/audio/ready.mp3',
      hash: 'readyhash',
    },
  };
}
