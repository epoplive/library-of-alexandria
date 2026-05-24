import { describe, expect, it } from 'vitest';
import type { AssetManifest } from '@/lib/lattice';
import { validateHydrate } from './hydrate-validators';
import { PendingAssetsArtifactSchema } from './types';
import { readyTakeFixture } from './test-fixtures';

describe('validateHydrate', () => {
  it('passes gates when required slots are ready and no assets are pending', () => {
    const manifest = manifestWithTakes({
      audioTakes: [readyTakeFixture()],
      poseTakes: [readyTakeFixture()],
      imageTakes: [readyTakeFixture()],
    });
    const pendingAssets = PendingAssetsArtifactSchema.parse({
      schema_version: 'loa.pending-assets.v1',
      assets: [],
    });

    const result = validateHydrate({
      manifest,
      pendingAssets,
      referencedSlotIds: new Set(['audio-required', 'pose-required']),
      poseSlots: [{
        slot_id: 'pose-required',
        cast_id: 'duck',
        pose_name: 'idle',
      }],
    });

    expect(result.validation).toEqual({
      tier_v0_1: 'pass',
      asset_coverage: 'ok',
      character_sprite_coverage: 'ok',
    });
    expect(result.diagnostics).toEqual([{
      code: 'hydrate.slot.unreferenced',
      path: ['manifest', 'slots', 'image-optional'],
      actual: 'unreferenced',
      expected: 'slot referenced by storyboard spoken_lines or cast pose_slots',
      repair: 'check compose output and remove unused asset slots or add the missing reference.',
      severity: 'warning',
    }]);
  });

  it('marks asset coverage partial when only optional assets are pending', () => {
    const manifest = manifestWithTakes({
      audioTakes: [readyTakeFixture()],
      poseTakes: [readyTakeFixture()],
      imageTakes: [],
    });
    const pendingAssets = PendingAssetsArtifactSchema.parse({
      schema_version: 'loa.pending-assets.v1',
      assets: [{
        slot_id: 'image-optional',
        kind: 'image',
        target_tier: 'v0.1',
        spec: {
          kind: 'image',
          description: 'Optional still',
        },
        priority: 'optional',
      }],
    });

    const result = validateHydrate({
      manifest,
      pendingAssets,
      referencedSlotIds: new Set(['audio-required', 'pose-required']),
      poseSlots: [{
        slot_id: 'pose-required',
        cast_id: 'duck',
        pose_name: 'idle',
      }],
    });

    expect(result.validation).toEqual({
      tier_v0_1: 'pass',
      asset_coverage: 'partial',
      character_sprite_coverage: 'ok',
    });
  });

  it('fails gates when required audio and character poses are pending', () => {
    const manifest = manifestWithTakes({
      audioTakes: [],
      poseTakes: [],
      imageTakes: [],
    });
    const pendingAssets = PendingAssetsArtifactSchema.parse({
      schema_version: 'loa.pending-assets.v1',
      assets: [
        {
          slot_id: 'audio-required',
          kind: 'audio-vo',
          target_tier: 'v0.1',
          spec: {
            kind: 'audio-vo',
            cast_id: 'narrator',
            voice_id: 'af_bella',
            text: 'Missing line.',
          },
          priority: 'required',
        },
        {
          slot_id: 'pose-required',
          kind: 'character-pose',
          target_tier: 'v0.1',
          spec: {
            kind: 'character-pose',
            cast_id: 'duck',
            pose_name: 'idle',
          },
          priority: 'required',
        },
      ],
    });

    const result = validateHydrate({
      manifest,
      pendingAssets,
      referencedSlotIds: new Set(['audio-required', 'pose-required']),
      poseSlots: [{
        slot_id: 'pose-required',
        cast_id: 'duck',
        pose_name: 'idle',
      }],
    });

    expect(result.validation).toEqual({
      tier_v0_1: 'fail',
      asset_coverage: 'missing',
      character_sprite_coverage: 'missing',
    });
  });
});

function manifestWithTakes(args: {
  audioTakes: AssetManifest['slots'][string]['takes'];
  poseTakes: AssetManifest['slots'][string]['takes'];
  imageTakes: AssetManifest['slots'][string]['takes'];
}): AssetManifest {
  return {
    production_id: 'validator-fixture',
    slots: {
      'audio-required': {
        id: 'audio-required',
        kind: 'audio-vo',
        description: 'Required audio',
        takes: args.audioTakes,
      },
      'pose-required': {
        id: 'pose-required',
        kind: 'image',
        description: 'Required pose',
        takes: args.poseTakes,
      },
      'image-optional': {
        id: 'image-optional',
        kind: 'image',
        description: 'Optional image',
        takes: args.imageTakes,
      },
    },
  };
}
