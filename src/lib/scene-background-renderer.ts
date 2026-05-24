import type {
  BoxRect,
  GradientBackground,
  ImagePanBackground,
  Production,
  Scene,
  SceneId,
  Shot,
  ShotAddress,
} from './lattice';

export function findActiveScene(production: Production, shotAddress: ShotAddress): Scene {
  for (const scene of production.scenes) {
    if (scene.id !== shotAddress.scene_id) {
      continue;
    }
    for (const shot of scene.shots) {
      if (shot.id === shotAddress.shot_id) {
        return scene;
      }
    }
    throw new Error(`shot "${shotAddress.shot_id}" not found in scene "${shotAddress.scene_id}"`);
  }
  throw new Error(`scene "${shotAddress.scene_id}" not found`);
}

export function sceneStartShotIndex(production: Production, sceneId: SceneId): number {
  let shotIndex = 0;
  for (const scene of production.scenes) {
    if (scene.id === sceneId) {
      return shotIndex;
    }
    shotIndex += scene.shots.length;
  }
  throw new Error(`scene "${sceneId}" not found`);
}

export function sceneElapsedSeconds(
  production: Production,
  shotAddress: ShotAddress,
  shotTime: number,
): number {
  const startIndex = sceneStartShotIndex(production, shotAddress.scene_id);
  const targetIndex = shotIndexForAddress(production, shotAddress);
  let elapsed = 0;
  let index = 0;
  for (const scene of production.scenes) {
    for (const shot of scene.shots) {
      if (index >= startIndex && index < targetIndex) {
        elapsed += shotDurationSeconds(shot);
      }
      if (index === targetIndex) {
        return elapsed + shotTime;
      }
      index += 1;
    }
  }
  throw new Error(`shot "${shotAddress.scene_id}.${shotAddress.shot_id}" not found`);
}

export function imagePanFrame(
  bg: ImagePanBackground,
  elapsed_s: number,
): { box: BoxRect; zoom: number } {
  const progress = progressForDuration(elapsed_s, bg.duration_s);
  return {
    box: {
      x: lerp(bg.pan.from.x, bg.pan.to.x, progress),
      y: lerp(bg.pan.from.y, bg.pan.to.y, progress),
      width: lerp(bg.pan.from.width, bg.pan.to.width, progress),
      height: lerp(bg.pan.from.height, bg.pan.to.height, progress),
    },
    zoom: bg.zoom === undefined
      ? 1
      : lerp(bg.zoom.from, bg.zoom.to, progress),
  };
}

export function gradientDriftOffset(
  bg: GradientBackground,
  elapsed_s: number,
): { x: number; y: number } {
  const drift = bg.drift;
  if (drift === undefined) {
    return { x: 0, y: 0 };
  }
  if (drift.speed_s <= 0) {
    return { x: 0, y: 0 };
  }

  const phase = wrapUnit(elapsed_s / drift.speed_s);
  switch (drift.direction) {
    case 'left':
      return { x: -phase, y: 0 };
    case 'right':
      return { x: phase, y: 0 };
    case 'up':
      return { x: 0, y: phase };
    case 'down':
      return { x: 0, y: -phase };
    case 'diagonal':
      return { x: phase, y: phase };
  }
  const exhaustive: never = drift.direction;
  return exhaustive;
}

function shotIndexForAddress(production: Production, address: ShotAddress): number {
  let index = 0;
  for (const scene of production.scenes) {
    for (const shot of scene.shots) {
      if (scene.id === address.scene_id && shot.id === address.shot_id) {
        return index;
      }
      index += 1;
    }
  }
  throw new Error(`shot "${address.scene_id}.${address.shot_id}" not found`);
}

function shotDurationSeconds(shot: Shot): number {
  if (shot.duration !== undefined) {
    return shot.duration;
  }
  if (shot.vo !== undefined && shot.vo.duration_override !== undefined) {
    return shot.vo.duration_override;
  }
  return 0;
}

function progressForDuration(elapsed_s: number, duration_s: number): number {
  if (duration_s <= 0) {
    return 1;
  }
  if (elapsed_s <= 0) {
    return 0;
  }
  if (elapsed_s >= duration_s) {
    return 1;
  }
  return elapsed_s / duration_s;
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function wrapUnit(value: number): number {
  const wrapped = value % 1;
  if (wrapped < 0) {
    return wrapped + 1;
  }
  return wrapped;
}
