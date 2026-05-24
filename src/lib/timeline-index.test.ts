import { describe, expect, it } from 'vitest';
import type { Production } from './lattice';
import type { ContentMap } from './lesson-workflow/project-schema';
import {
  buildTimelineIndex,
  TimelineIndexError,
  type TimelineMapKeyframe,
} from './timeline-index';

describe('buildTimelineIndex', () => {
  it('builds an empty synthetic index for a Production with no scenes', () => {
    const idx = buildTimelineIndex(baseProduction([]), []);

    expect(idx).toEqual({
      total_duration_s: 0,
      acts: [{
        id: 'main',
        title: 'Timeline Test',
        start_s: 0,
        end_s: 0,
        scene_ids: [],
      }],
      scenes: [],
      shots: [],
      keyframes: [],
    });
  });

  it('builds a synthetic main Act when no ContentMap is provided', () => {
    const production = baseProduction([
      {
        id: 'scene-one',
        title: 'Opening Scene',
        shots: [{ id: 'shot-one', elements: [] }],
      },
    ]);

    expect(buildTimelineIndex(production, [4])).toEqual({
      total_duration_s: 4,
      acts: [{
        id: 'main',
        title: 'Timeline Test',
        start_s: 0,
        end_s: 4,
        scene_ids: ['scene-one'],
      }],
      scenes: [{
        id: 'scene-one',
        title: 'Opening Scene',
        act_id: 'main',
        start_s: 0,
        end_s: 4,
      }],
      shots: [{
        id: 'shot-one',
        scene_id: 'scene-one',
        start_s: 0,
        end_s: 4,
      }],
      keyframes: [],
    });
  });

  it('walks ContentMap acts, scenes, shots, and keyframes against canonical durations', () => {
    const production = baseProduction([
      {
        id: 'scene-one',
        title: 'Production Scene One',
        shots: [
          { id: 'shot-one', elements: [] },
          { id: 'shot-two', elements: [] },
        ],
      },
      {
        id: 'scene-two',
        title: 'Production Scene Two',
        shots: [{ id: 'shot-three', elements: [] }],
      },
    ]);
    const mapKeyframes: TimelineMapKeyframe[] = [
      {
        at: 0.5,
        beat: 'Primary beat',
        label: 'Primary marker',
        importance: 'primary',
        slot_refs: [],
        cue_refs: [],
      },
      {
        at: 1.25,
        beat: 'Secondary beat',
        label: 'Secondary marker',
        importance: 'secondary',
        slot_refs: [],
        cue_refs: [],
      },
    ];
    const contentMap = baseContentMap([
      {
        id: 'scene-one',
        act_id: 'act-one',
        title: 'Mapped Scene One',
        summary: 'First scene summary.',
        shot_maps: [
          shotMap('scene-one', 'shot-one', []),
          shotMap('scene-one', 'shot-two', mapKeyframes),
        ],
        interactive_contract_refs: [],
      },
      {
        id: 'scene-two',
        act_id: 'act-two',
        title: 'Mapped Scene Two',
        summary: 'Second scene summary.',
        shot_maps: [
          shotMap('scene-two', 'shot-three', []),
        ],
        interactive_contract_refs: [],
      },
    ], [
      {
        id: 'act-one',
        title: 'Act One',
        summary: 'Act one summary.',
        scene_refs: ['scene-one'],
      },
      {
        id: 'act-two',
        title: 'Act Two',
        summary: 'Act two summary.',
        scene_refs: ['scene-two'],
      },
    ]);

    const idx = buildTimelineIndex(production, [2, 3, 5], contentMap);

    expect(idx.total_duration_s).toBe(10);
    expect(idx.acts).toEqual([
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
    ]);
    expect(idx.scenes).toEqual([
      {
        id: 'scene-one',
        title: 'Mapped Scene One',
        act_id: 'act-one',
        start_s: 0,
        end_s: 5,
      },
      {
        id: 'scene-two',
        title: 'Mapped Scene Two',
        act_id: 'act-two',
        start_s: 5,
        end_s: 10,
      },
    ]);
    expect(idx.shots).toEqual([
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
    ]);
    expect(idx.keyframes).toEqual([
      {
        id: 'scene-one.shot-two.keyframe.1',
        scene_id: 'scene-one',
        shot_id: 'shot-two',
        at_s: 2.5,
        label: 'Primary marker',
        importance: 'primary',
      },
      {
        id: 'scene-one.shot-two.keyframe.2',
        scene_id: 'scene-one',
        shot_id: 'shot-two',
        at_s: 3.25,
        label: 'Secondary marker',
        importance: 'secondary',
      },
    ]);
  });

  it('defaults current-schema keyframes to primary and uses beat as the label', () => {
    const production = baseProduction([
      {
        id: 'scene-one',
        title: 'Scene One',
        shots: [{ id: 'shot-one', elements: [] }],
      },
    ]);
    const contentMap = baseContentMap([
      {
        id: 'scene-one',
        act_id: 'act-one',
        title: 'Mapped Scene One',
        summary: 'Scene summary.',
        shot_maps: [
          shotMap('scene-one', 'shot-one', [{
            at: 1,
            beat: 'Schema beat',
            slot_refs: [],
            cue_refs: [],
          }]),
        ],
        interactive_contract_refs: [],
      },
    ], [
      {
        id: 'act-one',
        title: 'Act One',
        summary: 'Act summary.',
        scene_refs: ['scene-one'],
      },
    ]);

    expect(buildTimelineIndex(production, [3], contentMap).keyframes).toEqual([{
      id: 'scene-one.shot-one.keyframe.1',
      scene_id: 'scene-one',
      shot_id: 'shot-one',
      at_s: 1,
      label: 'Schema beat',
      importance: 'primary',
    }]);
  });

  it('throws a structured diagnostic when ContentMap references an unknown scene', () => {
    const production = baseProduction([]);
    const contentMap = baseContentMap([
      {
        id: 'missing-scene',
        act_id: 'act-one',
        title: 'Missing Scene',
        summary: 'Scene summary.',
        shot_maps: [],
        interactive_contract_refs: [],
      },
    ], [
      {
        id: 'act-one',
        title: 'Act One',
        summary: 'Act summary.',
        scene_refs: ['missing-scene'],
      },
    ]);

    expectDiagnostic(contentMap, production, [], 'timeline.scene.unknown');
  });

  it('throws a structured diagnostic when ContentMap references an unknown shot', () => {
    const production = baseProduction([
      {
        id: 'scene-one',
        title: 'Scene One',
        shots: [],
      },
    ]);
    const contentMap = baseContentMap([
      {
        id: 'scene-one',
        act_id: 'act-one',
        title: 'Scene One',
        summary: 'Scene summary.',
        shot_maps: [shotMap('scene-one', 'missing-shot', [])],
        interactive_contract_refs: [],
      },
    ], [
      {
        id: 'act-one',
        title: 'Act One',
        summary: 'Act summary.',
        scene_refs: ['scene-one'],
      },
    ]);

    expectDiagnostic(contentMap, production, [], 'timeline.shot.unknown');
  });

  it('throws a structured diagnostic when ContentMap omits a Production shot', () => {
    const production = baseProduction([
      {
        id: 'scene-one',
        title: 'Scene One',
        shots: [{ id: 'shot-one', elements: [] }],
      },
    ]);
    const contentMap = baseContentMap([
      {
        id: 'scene-one',
        act_id: 'act-one',
        title: 'Scene One',
        summary: 'Scene summary.',
        shot_maps: [],
        interactive_contract_refs: [],
      },
    ], [
      {
        id: 'act-one',
        title: 'Act One',
        summary: 'Act summary.',
        scene_refs: ['scene-one'],
      },
    ]);

    expectDiagnostic(contentMap, production, [2], 'timeline.shot.unknown');
  });

  it('throws a structured diagnostic for invalid shot durations', () => {
    const production = baseProduction([
      {
        id: 'scene-one',
        title: 'Scene One',
        shots: [{ id: 'shot-one', elements: [] }],
      },
    ]);

    expect(() => buildTimelineIndex(production, [Number.NaN]))
      .toThrow(TimelineIndexError);

    try {
      buildTimelineIndex(production, [-1]);
    } catch (error) {
      if (!(error instanceof TimelineIndexError)) {
        throw error;
      }
      expect(error.diagnostics[0].code).toBe('timeline.shot.duration_missing');
      expect(error.diagnostics[0].path).toEqual(['shotDurations', 0]);
      return;
    }
    throw new Error('Expected TimelineIndexError');
  });
});

function expectDiagnostic(
  contentMap: ContentMap,
  production: Production,
  shotDurations: number[],
  code: string,
): void {
  try {
    buildTimelineIndex(production, shotDurations, contentMap);
  } catch (error) {
    if (!(error instanceof TimelineIndexError)) {
      throw error;
    }
    expect(error.diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
    return;
  }
  throw new Error(`Expected diagnostic ${code}`);
}

function baseProduction(scenes: Production['scenes']): Production {
  return {
    id: 'timeline-test',
    title: 'Timeline Test',
    summary: 'A test production for timeline indexing.',
    tags: ['test'],
    tier: 'v0.1',
    characters: [],
    scenes,
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

function baseContentMap(
  scenes: ContentMap['scenes'],
  acts: ContentMap['acts'],
): ContentMap {
  return {
    schema_version: 'loa.content-map.v1',
    lesson_slug: 'timeline-test',
    acts,
    scenes,
  };
}

function shotMap(
  sceneId: string,
  shotId: string,
  keyframes: ContentMap['scenes'][number]['shot_maps'][number]['keyframes'],
): ContentMap['scenes'][number]['shot_maps'][number] {
  return {
    id: `${shotId}-map`,
    address: {
      scene_id: sceneId,
      shot_id: shotId,
    },
    title: `Shot ${shotId}`,
    intent: `Intent for ${shotId}`,
    cast_refs: [],
    slot_refs: [],
    keyframes,
    variations: [],
  };
}
