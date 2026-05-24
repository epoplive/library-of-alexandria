import { describe, expect, it } from 'vitest';
import type { AssetManifest, Shot } from '@/lib/lattice';
import {
  activeStateForPlaybackSegment,
  isSilentSegment,
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

describe('playback preview-mode segment durations (no Takes ready)', () => {
  it('distributes shot duration across multiple unknown VO segments weighted by line length', () => {
    const shot: Shot = {
      id: 'shot-preview',
      vo: {
        line: { text: 'Five.' },
        cast_id: 'narrator',
        audio: { slot_id: 'pending.1' },
      },
      duration: 12,
      elements: [],
      dialogue: [
        {
          id: 'd1',
          cast_id: 'narrator',
          line: { text: 'Twenty-five chars in here.' },
          audio: { slot_id: 'pending.2' },
        },
      ],
    };

    const segments = orderedPlaybackSegments(shot, manifest, playbackShotDuration(shot, manifest));

    expect(segments).toHaveLength(2);
    const durations = segments.map((segment) => segment.duration);
    // Shot duration 12s, two unknown segments with line lengths 5 and 26 → weighted split.
    expect(durations[0]).toBeCloseTo((12 * 5) / 31, 5);
    expect(durations[1]).toBeCloseTo((12 * 26) / 31, 5);
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    expect(total).toBeCloseTo(12, 5);
  });

  it('still allocates residual to the single unknown when other segments have known durations', () => {
    const shot: Shot = {
      id: 'shot-mixed',
      vo: {
        line: { text: 'Known.' },
        cast_id: 'narrator',
        audio: { slot_id: 'known.1' },
        duration_override: 4,
      },
      duration: 10,
      elements: [],
      dialogue: [
        {
          id: 'd1',
          cast_id: 'narrator',
          line: { text: 'Unknown.' },
          audio: { slot_id: 'pending.1' },
        },
      ],
    };

    const segments = orderedPlaybackSegments(shot, manifest, playbackShotDuration(shot, manifest));

    expect(segments.map((segment) => segment.duration)).toEqual([4, 6]);
  });

  it('falls back to even split when unknown segment lines are empty', () => {
    const shot: Shot = {
      id: 'shot-empty-lines',
      vo: {
        line: { text: '' },
        cast_id: 'narrator',
        audio: { slot_id: 'pending.1' },
      },
      duration: 6,
      elements: [],
      dialogue: [
        {
          id: 'd1',
          cast_id: 'narrator',
          line: { text: '' },
          audio: { slot_id: 'pending.2' },
        },
      ],
    };

    const segments = orderedPlaybackSegments(shot, manifest, playbackShotDuration(shot, manifest));

    expect(segments.map((segment) => segment.duration)).toEqual([3, 3]);
  });

  it('marks segments silent when the slot has no ready Take', () => {
    const shot: Shot = {
      id: 'shot-silent',
      vo: {
        line: { text: 'Pending narration.' },
        cast_id: 'narrator',
        audio: { slot_id: 'pending-1' },
      },
      duration: 6,
      elements: [],
      dialogue: [
        {
          id: 'd1',
          cast_id: 'narrator',
          line: { text: 'Another pending line.' },
          audio: { slot_id: 'pending-2' },
        },
      ],
    };

    const segments = orderedPlaybackSegments(shot, manifest, playbackShotDuration(shot, manifest));
    for (const segment of segments) {
      expect(isSilentSegment(segment, manifest)).toBe(true);
    }
  });

  it('marks segments NOT silent when the slot has a ready v0.1 Take with a URL', () => {
    const manifestWithTake: AssetManifest = {
      production_id: 'p',
      slots: {
        'ready-1': {
          id: 'ready-1',
          kind: 'audio-vo',
          description: 'narrator',
          selection: 'best-available',
          takes: [
            {
              tier: 'v0.1',
              status: 'ready',
              artifact: { url: '/audio/ready.mp3', path: '/audio/ready.mp3', hash: 'abc' },
              provenance: { provider: 'kokoro', voice_id: 'af_bella' },
            },
          ],
        },
      },
    };

    const shot: Shot = {
      id: 'shot-ready',
      vo: {
        line: { text: 'Ready narration.' },
        cast_id: 'narrator',
        audio: { slot_id: 'ready-1' },
      },
      duration: 6,
      elements: [],
    };

    const segments = orderedPlaybackSegments(shot, manifestWithTake, playbackShotDuration(shot, manifestWithTake));
    expect(isSilentSegment(segments[0], manifestWithTake)).toBe(false);
  });

  it('rejects when known durations already exceed shot duration', () => {
    const shot: Shot = {
      id: 'shot-overrun',
      vo: {
        line: { text: 'A.' },
        cast_id: 'narrator',
        audio: { slot_id: 'a' },
        duration_override: 5,
      },
      duration: 4,
      elements: [],
      dialogue: [
        {
          id: 'd1',
          cast_id: 'narrator',
          line: { text: 'B.' },
          audio: { slot_id: 'b' },
        },
      ],
    };

    expect(() => orderedPlaybackSegments(shot, manifest, playbackShotDuration(shot, manifest))).toThrowError(
      /playback.segment_duration.exceeds_shot/,
    );
  });
});
