import { easingFor, linear } from '@/lib/easing';
import type { Production, Shot, ShotAddress, TransitionEdge } from '@/lib/lattice';

export interface TransitionEnvelopeState {
  activeShot: Shot;
  envelope?: {
    prevShot: Shot;
    nextShot: Shot;
    edge: TransitionEdge;
    progress: number;
    prevShotTime: number;
    nextShotTime: number;
  };
}

interface TimelineEntry {
  address: ShotAddress;
  shot: Shot;
}

export function resolveTransitionEnvelope(
  production: Production,
  shotIndex: number,
  shotTime: number,
): TransitionEnvelopeState | null {
  const timeline = canonicalTimeline(production);
  const activeEntry = timeline[shotIndex];

  if (activeEntry === undefined) {
    return null;
  }

  const nextEntry = timeline[shotIndex + 1];
  if (nextEntry === undefined) {
    return { activeShot: activeEntry.shot };
  }

  const edge = transitionBetween(production.transitions, activeEntry.address, nextEntry.address);
  if (edge === null || edge.kind === 'cut' || edge.duration === 0) {
    return { activeShot: activeEntry.shot };
  }

  const activeDuration = shotDurationSeconds(activeEntry.shot);
  if (activeDuration === null) {
    return { activeShot: activeEntry.shot };
  }

  const transitionDuration = edge.duration / 1000;
  const startsAt = activeDuration - transitionDuration;
  if (shotTime < startsAt) {
    return { activeShot: activeEntry.shot };
  }

  const rawProgress = (shotTime - startsAt) / transitionDuration;
  if (rawProgress > 1) {
    return { activeShot: activeEntry.shot };
  }

  const easing = edge.ease === undefined ? linear : easingFor(edge.ease);
  return {
    activeShot: activeEntry.shot,
    envelope: {
      prevShot: activeEntry.shot,
      nextShot: nextEntry.shot,
      edge,
      progress: easing(rawProgress),
      prevShotTime: activeDuration,
      nextShotTime: 0,
    },
  };
}

function canonicalTimeline(production: Production): TimelineEntry[] {
  const timeline: TimelineEntry[] = [];
  for (const scene of production.scenes) {
    for (const shot of scene.shots) {
      timeline.push({
        address: { scene_id: scene.id, shot_id: shot.id },
        shot,
      });
    }
  }
  return timeline;
}

function transitionBetween(
  transitions: TransitionEdge[],
  from: ShotAddress,
  to: ShotAddress,
): TransitionEdge | null {
  for (const edge of transitions) {
    if (sameAddress(edge.from, from) && sameAddress(edge.to, to)) {
      return edge;
    }
  }
  return null;
}

function shotDurationSeconds(shot: Shot): number | null {
  if (shot.duration !== undefined) {
    return shot.duration;
  }
  if (shot.vo !== undefined && shot.vo.duration_override !== undefined) {
    return shot.vo.duration_override;
  }
  return null;
}

function sameAddress(a: ShotAddress, b: ShotAddress): boolean {
  return a.scene_id === b.scene_id && a.shot_id === b.shot_id;
}
