import type {
  KeyframeImportance,
  TimelineIndex,
} from './timeline-index';
import type { SceneId, ShotId } from './lattice';

export interface ActSpanPct {
  id: string;
  title: string;
  left_pct: number;
  width_pct: number;
}

export interface SceneTickPct {
  id: SceneId;
  title: string;
  left_pct: number;
  width_pct: number;
}

export interface ShotTickPct {
  id: ShotId;
  scene_id: SceneId;
  left_pct: number;
  width_pct: number;
}

export interface KeyframeMarkerPct {
  id: string;
  label?: string;
  left_pct: number;
  importance: KeyframeImportance;
}

export function scrubberPctForTime(timelineIndex: TimelineIndex, time_s: number): number {
  if (timelineIndex.total_duration_s <= 0) {
    return 0;
  }
  return clampPct((time_s / timelineIndex.total_duration_s) * 100);
}

export function scrubberTimeForPct(timelineIndex: TimelineIndex, pct: number): number {
  if (timelineIndex.total_duration_s <= 0) {
    return 0;
  }
  return (clampPct(pct) / 100) * timelineIndex.total_duration_s;
}

export function actSpansAsPct(timelineIndex: TimelineIndex): ActSpanPct[] {
  return timelineIndex.acts.map((act) => {
    const span = spanAsPct(timelineIndex, act.start_s, act.end_s);
    return {
      id: act.id,
      title: act.title,
      left_pct: span.left_pct,
      width_pct: span.width_pct,
    };
  });
}

export function sceneTicksAsPct(timelineIndex: TimelineIndex): SceneTickPct[] {
  return timelineIndex.scenes.map((scene) => {
    const span = spanAsPct(timelineIndex, scene.start_s, scene.end_s);
    return {
      id: scene.id,
      title: scene.title,
      left_pct: span.left_pct,
      width_pct: span.width_pct,
    };
  });
}

export function shotTicksAsPct(timelineIndex: TimelineIndex): ShotTickPct[] {
  return timelineIndex.shots.map((shot) => {
    const span = spanAsPct(timelineIndex, shot.start_s, shot.end_s);
    return {
      id: shot.id,
      scene_id: shot.scene_id,
      left_pct: span.left_pct,
      width_pct: span.width_pct,
    };
  });
}

export function keyframeMarkersAsPct(
  timelineIndex: TimelineIndex,
  opts: { include_secondary: boolean },
): KeyframeMarkerPct[] {
  return timelineIndex.keyframes
    .filter((keyframe) => opts.include_secondary || keyframe.importance === 'primary')
    .map((keyframe) => {
      const leftPct = scrubberPctForTime(timelineIndex, keyframe.at_s);
      const marker: KeyframeMarkerPct = {
        id: keyframe.id,
        left_pct: leftPct,
        importance: keyframe.importance,
      };
      if (keyframe.label !== undefined) {
        marker.label = keyframe.label;
      }
      return marker;
    });
}

function spanAsPct(
  timelineIndex: TimelineIndex,
  start_s: number,
  end_s: number,
): { left_pct: number; width_pct: number } {
  if (timelineIndex.total_duration_s <= 0) {
    return {
      left_pct: 0,
      width_pct: 0,
    };
  }
  const left = scrubberPctForTime(timelineIndex, start_s);
  const right = scrubberPctForTime(timelineIndex, end_s);
  return {
    left_pct: left,
    width_pct: Math.max(0, right - left),
  };
}

function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) {
    return 0;
  }
  if (pct < 0) {
    return 0;
  }
  if (pct > 100) {
    return 100;
  }
  return pct;
}
