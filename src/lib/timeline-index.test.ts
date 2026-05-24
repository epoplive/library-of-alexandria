import { describe, expect, it } from 'vitest';
import type { Diagnostic } from './lesson-workflow/diagnostic-schema';
import type { Production } from './lattice';
import {
  ContentMapSchema,
  defaultMapKeyframeId,
  type ContentMap,
  type MapKeyframe,
  type ShotMap,
} from './lesson-workflow/project-schema';
import {
  buildTimelineIndex,
  TimelineIndexError,
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

  it('returns empty mapped spans for a ContentMap with empty acts', () => {
    const idx = buildTimelineIndex(baseProduction([]), [], baseContentMap([]));

    expect(idx).toEqual({
      total_duration_s: 0,
      acts: [],
      scenes: [],
      shots: [],
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
    const mapKeyframes: MapKeyframe[] = [
      {
        id: 'primary-marker',
        shot_id: 'shot-two',
        at: 0.5,
        label: 'Primary marker',
        importance: 'primary',
      },
      {
        id: 'secondary-marker',
        shot_id: 'shot-two',
        at: 1.25,
        label: 'Secondary marker',
        importance: 'secondary',
      },
    ];
    const contentMap = baseContentMap([
      actMap('act-one', 'Act One', [
        sceneMap('scene-one', 'Mapped Scene One', [
          shotMap('shot-one', []),
          shotMap('shot-two', mapKeyframes),
        ]),
      ]),
      actMap('act-two', 'Act Two', [
        sceneMap('scene-two', 'Mapped Scene Two', [
          shotMap('shot-three', []),
        ]),
      ]),
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
        id: 'primary-marker',
        scene_id: 'scene-one',
        shot_id: 'shot-two',
        at_s: 2.5,
        label: 'Primary marker',
        importance: 'primary',
      },
      {
        id: 'secondary-marker',
        scene_id: 'scene-one',
        shot_id: 'shot-two',
        at_s: 3.25,
        label: 'Secondary marker',
        importance: 'secondary',
      },
    ]);
  });

  it('allows SceneMap without source_section_id at the timeline boundary', () => {
    const production = baseProduction([
      {
        id: 'scene-one',
        title: 'Scene One',
        shots: [{ id: 'shot-one', elements: [] }],
      },
    ]);
    const contentMap = baseContentMap([
      actMap('act-one', 'Act One', [
        sceneMap('scene-one', 'Mapped Scene One', [
          shotMap('shot-one', []),
        ]),
      ]),
    ]);

    expect(buildTimelineIndex(production, [3], contentMap).scenes).toEqual([{
      id: 'scene-one',
      title: 'Mapped Scene One',
      act_id: 'act-one',
      start_s: 0,
      end_s: 3,
    }]);
  });

  it('uses generated keyframe ids when ContentMapSchema parses missing keyframe id', () => {
    const contentMap = ContentMapSchema.parse({
      schema_version: 'loa.content-map.v1',
      lesson_slug: 'timeline-test',
      acts: [{
        id: 'act-one',
        title: 'Act One',
        scenes: [{
          id: 'scene-one',
          title: 'Scene One',
          cast_in_scene: [],
          discoveries: [],
          shots: [{
            id: 'shot-one',
            kind: 'narrative',
            speakers: [],
            duration_estimate_s: 3,
            keyframes: [{
              shot_id: 'shot-one',
              at: 1,
              label: 'Generated marker',
            }],
          }],
        }],
      }],
    });
    const expectedId = defaultMapKeyframeId('scene-one', 'shot-one', 1, 'Generated marker');
    const production = baseProduction([
      {
        id: 'scene-one',
        title: 'Scene One',
        shots: [{ id: 'shot-one', elements: [] }],
      },
    ]);

    expect(defaultMapKeyframeId('scene-one', 'shot-one', 1, 'Generated marker')).toBe(expectedId);
    expect(contentMap.acts[0].scenes[0].shots[0].keyframes[0].id).toBe(expectedId);
    expect(buildTimelineIndex(production, [3], contentMap).keyframes[0].id).toBe(expectedId);
  });

  it('derives stable default keyframe ids across re-runs', () => {
    const first = defaultMapKeyframeId('scene-one', 'shot-one', 1.25, 'Stable marker');
    const second = defaultMapKeyframeId('scene-one', 'shot-one', 1.25, 'Stable marker');

    expect(first).toBe(second);
  });

  it('throws a structured diagnostic when ContentMap references an unknown scene', () => {
    const production = baseProduction([]);
    const contentMap = baseContentMap([
      actMap('act-one', 'Act One', [
        sceneMap('missing-scene', 'Missing Scene', []),
      ]),
    ]);

    const diagnostics = expectDiagnostics(contentMap, production, [], 'timeline.scene.unknown');
    expect(diagnostics[0].path).toEqual(['acts', 0, 'scenes', 0, 'id']);
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
      actMap('act-one', 'Act One', [
        sceneMap('scene-one', 'Scene One', [
          shotMap('missing-shot', []),
        ]),
      ]),
    ]);

    const diagnostics = expectDiagnostics(contentMap, production, [], 'timeline.shot.unknown');
    expect(diagnostics[0].path).toEqual(['acts', 0, 'scenes', 0, 'shots', 0, 'id']);
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
      actMap('act-one', 'Act One', [
        sceneMap('scene-one', 'Scene One', []),
      ]),
    ]);

    const diagnostics = expectDiagnostics(contentMap, production, [2], 'timeline.shot.unknown');
    expect(diagnostics[0].path).toEqual(['scenes', 0, 'shots', 0, 'id']);
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

function expectDiagnostics(
  contentMap: ContentMap,
  production: Production,
  shotDurations: number[],
  code: string,
): Diagnostic[] {
  try {
    buildTimelineIndex(production, shotDurations, contentMap);
  } catch (error) {
    if (!(error instanceof TimelineIndexError)) {
      throw error;
    }
    expect(error.diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
    return error.diagnostics;
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

function baseContentMap(acts: ContentMap['acts']): ContentMap {
  return {
    schema_version: 'loa.content-map.v1',
    lesson_slug: 'timeline-test',
    acts,
  };
}

function actMap(
  id: string,
  title: string,
  scenes: ContentMap['acts'][number]['scenes'],
): ContentMap['acts'][number] {
  return {
    id,
    title,
    scenes,
  };
}

function sceneMap(
  id: string,
  title: string,
  shots: ContentMap['acts'][number]['scenes'][number]['shots'],
): ContentMap['acts'][number]['scenes'][number] {
  return {
    id,
    title,
    cast_in_scene: [],
    discoveries: [],
    shots,
  };
}

function shotMap(
  shotId: string,
  keyframes: MapKeyframe[],
): ShotMap {
  return {
    id: shotId,
    kind: 'narrative',
    speakers: [],
    duration_estimate_s: 1,
    keyframes,
  };
}
