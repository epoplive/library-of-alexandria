import type {
  Production,
  Scene,
  SceneId,
  Shot,
  ShotId,
} from './lattice';
import type { Diagnostic } from './lesson-workflow/diagnostic-schema';
import type {
  ContentMap,
  MapKeyframe,
  SceneMap,
  ShotMap,
} from './lesson-workflow/project-schema';

export type KeyframeImportance = 'primary' | 'secondary';

export interface TimelineIndex {
  total_duration_s: number;
  acts: ActSpan[];
  scenes: SceneSpan[];
  shots: ShotSpan[];
  keyframes: KeyframeMarker[];
}

export interface ActSpan {
  id: string;
  title: string;
  start_s: number;
  end_s: number;
  scene_ids: SceneId[];
}

export interface SceneSpan {
  id: SceneId;
  title: string;
  act_id: string;
  start_s: number;
  end_s: number;
}

export interface ShotSpan {
  id: ShotId;
  scene_id: SceneId;
  start_s: number;
  end_s: number;
}

export interface KeyframeMarker {
  id: string;
  scene_id: SceneId;
  shot_id: ShotId;
  at_s: number;
  label?: string;
  importance: KeyframeImportance;
}

export type TimelineMapKeyframe = MapKeyframe & {
  label?: string;
  importance?: KeyframeImportance;
};

interface CanonicalShotEntry {
  scene: Scene;
  shot: Shot;
  scene_index: number;
  shot_index: number;
  timeline_index: number;
  start_s: number;
  end_s: number;
}

interface CanonicalSceneEntry {
  scene: Scene;
  scene_index: number;
  start_s: number;
  end_s: number;
}

interface CanonicalTimeline {
  total_duration_s: number;
  scenes: CanonicalSceneEntry[];
  shots: CanonicalShotEntry[];
  shot_by_address: Map<string, CanonicalShotEntry>;
  scene_by_id: Map<SceneId, CanonicalSceneEntry>;
}

export class TimelineIndexError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic[]) {
    super('Timeline index build failed');
    this.name = 'TimelineIndexError';
    this.diagnostics = diagnostics;
  }
}

export function buildTimelineIndex(
  production: Production,
  shotDurations: number[],
  contentMap?: ContentMap,
): TimelineIndex {
  const timeline = canonicalTimeline(production, shotDurations);
  if (contentMap !== undefined) {
    return buildMappedTimelineIndex(production, timeline, contentMap);
  }
  return buildSyntheticTimelineIndex(production, timeline);
}

function canonicalTimeline(production: Production, shotDurations: number[]): CanonicalTimeline {
  const diagnostics: Diagnostic[] = [];
  const sceneEntries: CanonicalSceneEntry[] = [];
  const shotEntries: CanonicalShotEntry[] = [];
  const shotByAddress = new Map<string, CanonicalShotEntry>();
  const sceneById = new Map<SceneId, CanonicalSceneEntry>();
  let elapsed = 0;
  let timelineIndex = 0;

  for (let sceneIndex = 0; sceneIndex < production.scenes.length; sceneIndex += 1) {
    const scene = production.scenes[sceneIndex];
    const sceneStart = elapsed;

    for (let shotIndex = 0; shotIndex < scene.shots.length; shotIndex += 1) {
      const shot = scene.shots[shotIndex];
      const duration = shotDurations[timelineIndex];
      if (!isValidDuration(duration)) {
        diagnostics.push(durationDiagnostic(timelineIndex, duration));
        timelineIndex += 1;
        continue;
      }
      const entry: CanonicalShotEntry = {
        scene,
        shot,
        scene_index: sceneIndex,
        shot_index: shotIndex,
        timeline_index: timelineIndex,
        start_s: elapsed,
        end_s: elapsed + duration,
      };
      shotEntries.push(entry);
      shotByAddress.set(addressKey(scene.id, shot.id), entry);
      elapsed += duration;
      timelineIndex += 1;
    }

    const sceneEntry: CanonicalSceneEntry = {
      scene,
      scene_index: sceneIndex,
      start_s: sceneStart,
      end_s: elapsed,
    };
    sceneEntries.push(sceneEntry);
    sceneById.set(scene.id, sceneEntry);
  }

  if (diagnostics.length > 0) {
    throw new TimelineIndexError(diagnostics);
  }

  return {
    total_duration_s: elapsed,
    scenes: sceneEntries,
    shots: shotEntries,
    shot_by_address: shotByAddress,
    scene_by_id: sceneById,
  };
}

function buildSyntheticTimelineIndex(
  production: Production,
  timeline: CanonicalTimeline,
): TimelineIndex {
  const scenes = timeline.scenes.map((entry) => ({
    id: entry.scene.id,
    title: entry.scene.title,
    act_id: 'main',
    start_s: entry.start_s,
    end_s: entry.end_s,
  }));
  const shots = timeline.shots.map((entry) => ({
    id: entry.shot.id,
    scene_id: entry.scene.id,
    start_s: entry.start_s,
    end_s: entry.end_s,
  }));

  const acts: ActSpan[] = [{
    id: 'main',
    title: production.title,
    start_s: 0,
    end_s: timeline.total_duration_s,
    scene_ids: production.scenes.map((scene) => scene.id),
  }];

  return {
    total_duration_s: timeline.total_duration_s,
    acts,
    scenes,
    shots,
    keyframes: [],
  };
}

function buildMappedTimelineIndex(
  production: Production,
  timeline: CanonicalTimeline,
  contentMap: ContentMap,
): TimelineIndex {
  const diagnostics: Diagnostic[] = [];
  const sceneMapsById = new Map<SceneId, SceneMap>();
  for (let i = 0; i < contentMap.scenes.length; i += 1) {
    const sceneMap = contentMap.scenes[i];
    sceneMapsById.set(sceneMap.id, sceneMap);
    if (!timeline.scene_by_id.has(sceneMap.id)) {
      diagnostics.push({
        code: 'timeline.scene.unknown',
        path: ['scenes', i, 'id'],
        actual: sceneMap.id,
        expected: 'Scene id declared in Production.scenes',
        repair: `add Scene "${sceneMap.id}" to the Production or remove it from the content map.`,
        severity: 'error',
      });
    }
  }

  const mappedShotKeys = new Set<string>();
  const mappedSceneIds = new Set<SceneId>();
  const scenes: SceneSpan[] = [];
  const shots: ShotSpan[] = [];
  const keyframes: KeyframeMarker[] = [];
  const acts: ActSpan[] = [];

  for (let actIndex = 0; actIndex < contentMap.acts.length; actIndex += 1) {
    const act = contentMap.acts[actIndex];
    const actSceneIds: SceneId[] = [];
    const actSceneSpans: SceneSpan[] = [];

    for (let sceneRefIndex = 0; sceneRefIndex < act.scene_refs.length; sceneRefIndex += 1) {
      const sceneId = act.scene_refs[sceneRefIndex];
      const sceneMap = sceneMapsById.get(sceneId);
      const canonicalScene = timeline.scene_by_id.get(sceneId);
      if (sceneMap === undefined || canonicalScene === undefined) {
        diagnostics.push({
          code: 'timeline.scene.unknown',
          path: ['acts', actIndex, 'scene_refs', sceneRefIndex],
          actual: sceneId,
          expected: 'Scene id declared in both ContentMap.scenes and Production.scenes',
          repair: `add Scene "${sceneId}" to both sources or remove the act scene_ref.`,
          severity: 'error',
        });
        continue;
      }

      const sceneSpan = sceneSpanFromMap(act.id, sceneMap, canonicalScene);
      scenes.push(sceneSpan);
      actSceneSpans.push(sceneSpan);
      actSceneIds.push(sceneMap.id);
      mappedSceneIds.add(sceneMap.id);

      for (let shotMapIndex = 0; shotMapIndex < sceneMap.shot_maps.length; shotMapIndex += 1) {
        const shotMap = sceneMap.shot_maps[shotMapIndex];
        const shotKey = addressKey(shotMap.address.scene_id, shotMap.address.shot_id);
        const canonicalShot = timeline.shot_by_address.get(shotKey);
        if (canonicalShot === undefined) {
          diagnostics.push(unknownShotDiagnostic(sceneMap, shotMap, shotMapIndex));
          continue;
        }
        mappedShotKeys.add(shotKey);
        const shotSpan: ShotSpan = {
          id: canonicalShot.shot.id,
          scene_id: canonicalShot.scene.id,
          start_s: canonicalShot.start_s,
          end_s: canonicalShot.end_s,
        };
        shots.push(shotSpan);
        keyframes.push(...keyframesForShotMap(sceneMap, shotMap, canonicalShot));
      }
    }

    acts.push({
      id: act.id,
      title: act.title,
      start_s: startForSceneSpans(actSceneSpans),
      end_s: endForSceneSpans(actSceneSpans),
      scene_ids: actSceneIds,
    });
  }

  for (let sceneIndex = 0; sceneIndex < production.scenes.length; sceneIndex += 1) {
    const scene = production.scenes[sceneIndex];
    if (!mappedSceneIds.has(scene.id)) {
      diagnostics.push({
        code: 'timeline.scene.unknown',
        path: ['scenes', sceneIndex, 'id'],
        actual: scene.id,
        expected: 'Scene id referenced by ContentMap.acts[].scene_refs',
        repair: `add "${scene.id}" to an act scene_refs list or remove the Production Scene.`,
        severity: 'error',
      });
    }
  }

  for (const entry of timeline.shots) {
    const key = addressKey(entry.scene.id, entry.shot.id);
    if (!mappedShotKeys.has(key)) {
      diagnostics.push({
        code: 'timeline.shot.unknown',
        path: ['scenes', entry.scene_index, 'shots', entry.shot_index, 'id'],
        actual: {
          scene_id: entry.scene.id,
          shot_id: entry.shot.id,
        },
        expected: 'ShotMap address declared in ContentMap.scenes[].shot_maps',
        repair: `add ShotMap "${entry.shot.id}" to SceneMap "${entry.scene.id}" or remove the Production Shot.`,
        severity: 'error',
      });
    }
  }

  if (diagnostics.length > 0) {
    throw new TimelineIndexError(diagnostics);
  }

  return {
    total_duration_s: timeline.total_duration_s,
    acts,
    scenes,
    shots,
    keyframes,
  };
}

function sceneSpanFromMap(
  actId: string,
  sceneMap: SceneMap,
  canonicalScene: CanonicalSceneEntry,
): SceneSpan {
  return {
    id: sceneMap.id,
    title: sceneMap.title,
    act_id: actId,
    start_s: canonicalScene.start_s,
    end_s: canonicalScene.end_s,
  };
}

function keyframesForShotMap(
  sceneMap: SceneMap,
  shotMap: ShotMap,
  canonicalShot: CanonicalShotEntry,
): KeyframeMarker[] {
  return shotMap.keyframes.map((rawKeyframe, keyframeIndex) => {
    const keyframe: TimelineMapKeyframe = rawKeyframe;
    const label = keyframe.label !== undefined ? keyframe.label : keyframe.beat;
    const importance = keyframe.importance !== undefined ? keyframe.importance : 'primary';
    return {
      id: `${sceneMap.id}.${shotMap.address.shot_id}.keyframe.${keyframeIndex + 1}`,
      scene_id: sceneMap.id,
      shot_id: shotMap.address.shot_id,
      at_s: canonicalShot.start_s + keyframe.at,
      label,
      importance,
    };
  });
}

function unknownShotDiagnostic(
  sceneMap: SceneMap,
  shotMap: ShotMap,
  shotMapIndex: number,
): Diagnostic {
  return {
    code: 'timeline.shot.unknown',
    path: ['scenes', sceneMap.id, 'shot_maps', shotMapIndex, 'address'],
    actual: {
      scene_id: shotMap.address.scene_id,
      shot_id: shotMap.address.shot_id,
    },
    expected: 'Shot id declared in the matching Production Scene',
    repair: `add Shot "${shotMap.address.shot_id}" to Production Scene "${shotMap.address.scene_id}" or remove it from the content map.`,
    severity: 'error',
  };
}

function startForSceneSpans(spans: SceneSpan[]): number {
  if (spans.length === 0) {
    return 0;
  }
  let start = spans[0].start_s;
  for (const span of spans) {
    if (span.start_s < start) {
      start = span.start_s;
    }
  }
  return start;
}

function endForSceneSpans(spans: SceneSpan[]): number {
  if (spans.length === 0) {
    return 0;
  }
  let end = spans[0].end_s;
  for (const span of spans) {
    if (span.end_s > end) {
      end = span.end_s;
    }
  }
  return end;
}

function isValidDuration(duration: number): boolean {
  return Number.isFinite(duration) && duration >= 0;
}

function durationDiagnostic(index: number, duration: number): Diagnostic {
  return {
    code: 'timeline.shot.duration_missing',
    path: ['shotDurations', index],
    actual: String(duration),
    expected: 'finite non-negative seconds',
    repair: 'pass Playback shotDurations indexed in canonical Production timeline order.',
    severity: 'error',
  };
}

function addressKey(sceneId: SceneId, shotId: ShotId): string {
  return `${sceneId}/${shotId}`;
}
