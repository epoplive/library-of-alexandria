import { describe, expect, it } from 'vitest';
import type { AssetManifest, Shot } from '@/lib/lattice';
import {
  activeStateForPlaybackSegment,
  orderedPlaybackSegments,
  playbackShotDuration,
  seekTargetForShotSegment,
  seekTargetForShotTime,
} from './Playback';

const manifest: AssetManifest = {
  production_id: 'p',
  slots: {},
};

describe('playback dialogue segments', () => {
  it('orders VO first and then dialogue beats', () => {
    const shot = dialogueShot();
    const shotDuration = playbackShotDuration(shot, manifest);
    const segments = orderedPlaybackSegments(shot, manifest, shotDuration);

    expect(segments.map((segment) => [segment.kind, segment.index, segment.line])).toEqual([
      ['vo', 0, 'Narrator opens.'],
      ['dialogue', 1, 'First duck line.'],
      ['dialogue', 2, 'Second duck line.'],
    ]);
  });

  it('tracks active speaker state from the active segment', () => {
    const shot = dialogueShot();
    const segments = orderedPlaybackSegments(shot, manifest, playbackShotDuration(shot, manifest));

    expect(activeStateForPlaybackSegment(segments[1])).toEqual({
      activeSpeakerCastId: 'duck',
      activeSegment: {
        kind: 'dialogue',
        index: 1,
        line: 'First duck line.',
        cast_id: 'duck',
      },
    });
  });

  it('keeps shotSegmentDurations summing to the computed shot duration', () => {
    const shot = dialogueShot();
    const shotDuration = playbackShotDuration(shot, manifest);
    const segments = orderedPlaybackSegments(shot, manifest, shotDuration);
    const durations = segments.map((segment) => segment.duration);

    expect(durations).toEqual([1, 2, 3]);
    expect(durations.reduce((sum, duration) => sum + duration, 0)).toBe(shotDuration);
  });

  it('seeks to a specific Shot segment and rejects out-of-bounds segments', () => {
    const shot = dialogueShot();
    const shots = [shot];
    const shotDurations = [playbackShotDuration(shot, manifest)];

    expect(seekTargetForShotSegment(shots, manifest, shotDurations, 0, 2)).toEqual({
      shotIndex: 0,
      shotTime: 3,
      segmentIndex: 2,
      segmentTime: 0,
    });
    expect(() => seekTargetForShotSegment(shots, manifest, shotDurations, 0, 3))
      .toThrow('playback.seek.segment_out_of_bounds: 0.3');
  });

  it('maps a Shot-local seek time into the correct segment', () => {
    const shot = dialogueShot();
    const segments = orderedPlaybackSegments(shot, manifest, playbackShotDuration(shot, manifest));

    expect(seekTargetForShotTime(segments, 2.5)).toEqual({
      shotTime: 2.5,
      segmentIndex: 1,
      segmentTime: 1.5,
    });
  });
});

function dialogueShot(): Shot {
  return {
    id: 'shot',
    elements: [],
    vo: {
      cast_id: 'narrator',
      line: { text: 'Narrator opens.' },
      audio: { slot_id: 'narrator.vo' },
      duration_override: 1,
    },
    dialogue: [
      {
        id: 'd1',
        cast_id: 'duck',
        line: { text: 'First duck line.' },
        audio: { slot_id: 'duck.1' },
        duration_override: 2,
      },
      {
        id: 'd2',
        cast_id: 'duck',
        line: { text: 'Second duck line.' },
        audio: { slot_id: 'duck.2' },
        duration_override: 3,
      },
    ],
  };
}
