import { describe, expect, it } from 'vitest';
import { resolveAudio } from './audio-resolver';
import {
  hydrateAudioIndexFixture,
  hydrateCastFixture,
  hydrateManifestFixture,
  hydrateStoryboardFixture,
  readyTakeFixture,
} from './test-fixtures';

describe('resolveAudio', () => {
  it('attaches line-level and timing-row Takes and reports misses', () => {
    const result = resolveAudio({
      manifest: hydrateManifestFixture(),
      storyboard: hydrateStoryboardFixture(),
      audioIndex: hydrateAudioIndexFixture(),
      cast: hydrateCastFixture(),
      lessonDir: 'lessons/hydrate-fixture',
      lessonSlug: 'hydrate-fixture',
    });

    expect([...result.attachedSlotIds].sort()).toEqual(['audio-line', 'audio-section']);
    expect(result.missing).toEqual([{
      slot_id: 'audio-missing',
      kind: 'audio-vo',
      cast_id: 'narrator',
      voice_id: 'af_bella',
      text: 'No audio exists.',
    }]);
    expect(result.manifest.slots['audio-line'].takes[0]).toMatchObject({
      tier: 'v0.1',
      status: 'ready',
      artifact: {
        url: 'lessons/hydrate-fixture/audio/line.mp3',
        path: 'lessons/hydrate-fixture/audio/line.mp3',
        hash: 'linehash',
      },
      timings: [{
        text: 'A full line.',
        startMs: 0,
        durationMs: 1200,
      }],
      provenance: {
        provider: 'kokoro',
        voice_id: 'af_bella',
        model: 'fixture-voice-model',
      },
    });
    expect(result.manifest.slots['audio-section'].takes[0].timings).toEqual([{
      text: 'A timed sentence.',
      startMs: 500,
      durationMs: 1500,
    }]);
    expect(result.manifest.slots['audio-missing'].takes).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('does not rehydrate a slot that already has a ready v0.1 Take', () => {
    const manifest = hydrateManifestFixture();
    manifest.slots['audio-line'] = {
      ...manifest.slots['audio-line'],
      takes: [readyTakeFixture()],
    };

    const result = resolveAudio({
      manifest,
      storyboard: hydrateStoryboardFixture(),
      audioIndex: hydrateAudioIndexFixture(),
      cast: hydrateCastFixture(),
      lessonDir: 'lessons/hydrate-fixture',
      lessonSlug: 'hydrate-fixture',
    });

    expect(result.manifest.slots['audio-line'].takes).toEqual([readyTakeFixture()]);
    expect(result.attachedSlotIds.has('audio-line')).toBe(false);
  });

  it('warns when a full-entry match has no timings to attach', () => {
    const audioIndex = {
      lesson: 'hydrate-fixture',
      entries: [{
        hash: 'notimings',
        text: 'A full line.',
        voice_id: 'af_bella',
        file: 'notimings.mp3',
      }],
    };

    const result = resolveAudio({
      manifest: hydrateManifestFixture(),
      storyboard: hydrateStoryboardFixture(),
      audioIndex,
      cast: hydrateCastFixture(),
      lessonDir: 'lessons/hydrate-fixture',
      lessonSlug: 'hydrate-fixture',
    });

    expect(result.manifest.slots['audio-line'].takes).toHaveLength(1);
    expect(result.diagnostics).toEqual([{
      code: 'hydrate.audio.timings_dropped',
      path: ['audio_index', 'entries', 'notimings', 'timings'],
      actual: undefined,
      expected: 'AudioTiming[] for matched audio entry',
      repair: 'regenerate audio/index.json with sentence timings for this file.',
      severity: 'warning',
    }]);
  });
});
