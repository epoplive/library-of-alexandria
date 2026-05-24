import { describe, expect, it } from 'vitest';
import {
  actSpansAsPct,
  keyframeMarkersAsPct,
  sceneTicksAsPct,
  scrubberPctForTime,
  scrubberTimeForPct,
  shotTicksAsPct,
} from './scrubber-geometry';
import type { TimelineIndex } from './timeline-index';

describe('scrubber geometry', () => {
  it('returns zeroed geometry when total duration is zero', () => {
    const idx: TimelineIndex = {
      total_duration_s: 0,
      acts: [{
        id: 'main',
        title: 'Main',
        start_s: 0,
        end_s: 0,
        scene_ids: ['scene-one'],
      }],
      scenes: [{
        id: 'scene-one',
        title: 'Scene One',
        act_id: 'main',
        start_s: 0,
        end_s: 0,
      }],
      shots: [{
        id: 'shot-one',
        scene_id: 'scene-one',
        start_s: 0,
        end_s: 0,
      }],
      keyframes: [{
        id: 'kf-one',
        scene_id: 'scene-one',
        shot_id: 'shot-one',
        at_s: 0,
        label: 'Zero',
        importance: 'primary',
      }],
    };

    expect(scrubberPctForTime(idx, 10)).toBe(0);
    expect(scrubberTimeForPct(idx, 50)).toBe(0);
    expect(actSpansAsPct(idx)).toEqual([{
      id: 'main',
      title: 'Main',
      left_pct: 0,
      width_pct: 0,
    }]);
    expect(sceneTicksAsPct(idx)).toEqual([{
      id: 'scene-one',
      title: 'Scene One',
      left_pct: 0,
      width_pct: 0,
    }]);
    expect(shotTicksAsPct(idx)).toEqual([{
      id: 'shot-one',
      scene_id: 'scene-one',
      left_pct: 0,
      width_pct: 0,
    }]);
    expect(keyframeMarkersAsPct(idx, { include_secondary: true })).toEqual([{
      id: 'kf-one',
      label: 'Zero',
      left_pct: 0,
      importance: 'primary',
    }]);
  });

  it('clamps time and percent conversions at the extreme edges', () => {
    const idx = timelineIndex();

    expect(scrubberPctForTime(idx, -5)).toBe(0);
    expect(scrubberPctForTime(idx, 0)).toBe(0);
    expect(scrubberPctForTime(idx, 5)).toBe(50);
    expect(scrubberPctForTime(idx, 15)).toBe(100);
    expect(scrubberTimeForPct(idx, -10)).toBe(0);
    expect(scrubberTimeForPct(idx, 0)).toBe(0);
    expect(scrubberTimeForPct(idx, 75)).toBe(7.5);
    expect(scrubberTimeForPct(idx, 110)).toBe(10);
  });

  it('projects acts, scenes, and shots into percentage spans', () => {
    const idx = timelineIndex();

    expect(actSpansAsPct(idx)).toEqual([
      {
        id: 'act-one',
        title: 'Act One',
        left_pct: 0,
        width_pct: 50,
      },
      {
        id: 'act-two',
        title: 'Act Two',
        left_pct: 50,
        width_pct: 50,
      },
    ]);
    expect(sceneTicksAsPct(idx)).toEqual([
      {
        id: 'scene-one',
        title: 'Scene One',
        left_pct: 0,
        width_pct: 50,
      },
      {
        id: 'scene-two',
        title: 'Scene Two',
        left_pct: 50,
        width_pct: 50,
      },
    ]);
    expect(shotTicksAsPct(idx)).toEqual([
      {
        id: 'shot-one',
        scene_id: 'scene-one',
        left_pct: 0,
        width_pct: 20,
      },
      {
        id: 'shot-two',
        scene_id: 'scene-one',
        left_pct: 20,
        width_pct: 30,
      },
      {
        id: 'shot-three',
        scene_id: 'scene-two',
        left_pct: 50,
        width_pct: 50,
      },
    ]);
  });

  it('filters secondary keyframes unless requested', () => {
    const idx = timelineIndex();

    expect(keyframeMarkersAsPct(idx, { include_secondary: false })).toEqual([{
      id: 'kf-primary',
      label: 'Primary',
      left_pct: 25,
      importance: 'primary',
    }]);
    expect(keyframeMarkersAsPct(idx, { include_secondary: true })).toEqual([
      {
        id: 'kf-primary',
        label: 'Primary',
        left_pct: 25,
        importance: 'primary',
      },
      {
        id: 'kf-secondary',
        label: 'Secondary',
        left_pct: 75,
        importance: 'secondary',
      },
    ]);
  });

  it('returns empty tooltip/tick geometry for empty scenes', () => {
    const idx: TimelineIndex = {
      total_duration_s: 0,
      acts: [],
      scenes: [],
      shots: [],
      keyframes: [],
    };

    expect(sceneTicksAsPct(idx)).toEqual([]);
    expect(shotTicksAsPct(idx)).toEqual([]);
    expect(keyframeMarkersAsPct(idx, { include_secondary: true })).toEqual([]);
  });
});

function timelineIndex(): TimelineIndex {
  return {
    total_duration_s: 10,
    acts: [
      {
        id: 'act-one',
        title: 'Act One',
        start_s: 0,
        end_s: 5,
        scene_ids: ['scene-one'],
      },
      {
        id: 'act-two',
        title: 'Act Two',
        start_s: 5,
        end_s: 10,
        scene_ids: ['scene-two'],
      },
    ],
    scenes: [
      {
        id: 'scene-one',
        title: 'Scene One',
        act_id: 'act-one',
        start_s: 0,
        end_s: 5,
      },
      {
        id: 'scene-two',
        title: 'Scene Two',
        act_id: 'act-two',
        start_s: 5,
        end_s: 10,
      },
    ],
    shots: [
      {
        id: 'shot-one',
        scene_id: 'scene-one',
        start_s: 0,
        end_s: 2,
      },
      {
        id: 'shot-two',
        scene_id: 'scene-one',
        start_s: 2,
        end_s: 5,
      },
      {
        id: 'shot-three',
        scene_id: 'scene-two',
        start_s: 5,
        end_s: 10,
      },
    ],
    keyframes: [
      {
        id: 'kf-primary',
        scene_id: 'scene-one',
        shot_id: 'shot-two',
        at_s: 2.5,
        label: 'Primary',
        importance: 'primary',
      },
      {
        id: 'kf-secondary',
        scene_id: 'scene-two',
        shot_id: 'shot-three',
        at_s: 7.5,
        label: 'Secondary',
        importance: 'secondary',
      },
    ],
  };
}
