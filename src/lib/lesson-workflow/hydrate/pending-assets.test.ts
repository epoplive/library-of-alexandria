import { describe, expect, it } from 'vitest';
import type { AssetManifest } from '@/lib/lattice';
import { buildPendingAssets } from './pending-assets';
import { readyTakeFixture } from './test-fixtures';

describe('buildPendingAssets', () => {
  it('emits pending assets with required and optional priorities', () => {
    const manifest: AssetManifest = {
      production_id: 'pending-fixture',
      slots: {
        'audio-ready': {
          id: 'audio-ready',
          kind: 'audio-vo',
          description: 'Ready audio',
          takes: [readyTakeFixture()],
        },
        'audio-missing': {
          id: 'audio-missing',
          kind: 'audio-dialogue',
          description: 'Missing dialogue',
          takes: [],
        },
        'pose.duck.idle': {
          id: 'pose.duck.idle',
          kind: 'image',
          description: 'Duck idle pose',
          takes: [],
        },
        'image-optional': {
          id: 'image-optional',
          kind: 'image',
          description: 'Optional still image',
          takes: [],
        },
        'video-optional': {
          id: 'video-optional',
          kind: 'video',
          description: 'Optional video',
          takes: [],
        },
      },
    };
    const referencedSlotIds = new Set(['audio-missing', 'pose.duck.idle']);

    const result = buildPendingAssets({
      manifest,
      missingAudio: [{
        slot_id: 'audio-missing',
        kind: 'audio-dialogue',
        cast_id: 'duck',
        voice_id: 'am_puck',
        text: 'Quack through the proof.',
      }],
      poseSlots: [{
        slot_id: 'pose.duck.idle',
        cast_id: 'duck',
        pose_name: 'idle',
      }],
      referencedSlotIds,
    });

    expect(result).toEqual({
      schema_version: 'loa.pending-assets.v1',
      assets: [
        {
          slot_id: 'audio-missing',
          kind: 'audio-dialogue',
          target_tier: 'v0.1',
          spec: {
            kind: 'audio-dialogue',
            cast_id: 'duck',
            voice_id: 'am_puck',
            text: 'Quack through the proof.',
          },
          priority: 'required',
        },
        {
          slot_id: 'image-optional',
          kind: 'image',
          target_tier: 'v0.1',
          spec: {
            kind: 'image',
            description: 'Optional still image',
          },
          priority: 'optional',
        },
        {
          slot_id: 'pose.duck.idle',
          kind: 'character-pose',
          target_tier: 'v0.1',
          spec: {
            kind: 'character-pose',
            cast_id: 'duck',
            pose_name: 'idle',
          },
          priority: 'required',
        },
        {
          slot_id: 'video-optional',
          kind: 'video',
          target_tier: 'v0.1',
          spec: {
            kind: 'video',
            description: 'Optional video',
          },
          priority: 'optional',
        },
      ],
    });
  });
});
