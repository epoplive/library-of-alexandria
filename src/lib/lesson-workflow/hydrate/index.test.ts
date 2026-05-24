import { describe, expect, it } from 'vitest';
import { runHydrate } from './index';
import {
  hydrateAudioIndexFixture,
  hydrateCastFixture,
  hydrateManifestFixture,
  hydrateStoryboardFixture,
} from './test-fixtures';

describe('runHydrate', () => {
  it('hydrates audio and sprite Takes and emits pending assets', () => {
    const result = runHydrate({
      manifest: hydrateManifestFixture(),
      storyboard: hydrateStoryboardFixture(),
      audioIndex: hydrateAudioIndexFixture(),
      cast: hydrateCastFixture(),
      lessonDir: 'lessons/hydrate-fixture',
      lessonSlug: 'hydrate-fixture',
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.stats).toEqual({
      slots_total: 4,
      attached: 3,
      audio_attached: 2,
      sprite_attached: 1,
      audio_slots_total: 3,
      audio_slots_ready: 2,
      spoken_lines_total: 3,
      pending_required: 1,
      pending_optional: 0,
    });
    expect(result.pendingAssets.assets).toEqual([{
      slot_id: 'audio-missing',
      kind: 'audio-vo',
      target_tier: 'v0.1',
      spec: {
        kind: 'audio-vo',
        cast_id: 'narrator',
        voice_id: 'af_bella',
        text: 'No audio exists.',
      },
      priority: 'required',
    }]);
    expect(result.validation).toEqual({
      tier_v0_1: 'fail',
      asset_coverage: 'missing',
      character_sprite_coverage: 'ok',
    });
  });
});
