import type { Diagnostic } from './lesson-workflow/diagnostic-schema';
import type { AssetManifest, Scene, Tier } from './lattice';

export function validateSceneBackground(
  scene: Scene,
  manifest: AssetManifest,
  options: { tier: Tier },
): Diagnostic[] {
  void options;
  const background = scene.background;
  if (background === undefined) {
    return [];
  }

  switch (background.kind) {
    case 'none':
      return [];
    case 'gradient':
      return validateGradientStops(scene);
    case 'image-pan':
      if (manifest.slots[background.slot_id] !== undefined) {
        return [];
      }
      return [{
        code: 'background.image_pan.slot_missing',
        path: ['background', 'slot_id'],
        actual: background.slot_id,
        expected: 'Slot declared in AssetManifest.slots',
        repair: `declare image Slot "${background.slot_id}" for Scene "${scene.id}" background.`,
        severity: 'error',
      }];
    case 'parallax':
      return validateParallaxDepth(scene);
  }
  const exhaustive: never = background;
  return exhaustive;
}

function validateGradientStops(scene: Scene): Diagnostic[] {
  const background = scene.background;
  if (background === undefined || background.kind !== 'gradient') {
    return [];
  }
  for (let i = 1; i < background.stops.length; i += 1) {
    if (background.stops[i - 1].offset <= background.stops[i].offset) {
      continue;
    }
    return [{
      code: 'background.gradient.stops_unsorted',
      path: ['background', 'stops'],
      actual: background.stops.map((stop) => stop.offset),
      expected: 'monotonic ascending offsets',
      repair: `sort Scene "${scene.id}" gradient stops by offset.`,
      severity: 'error',
    }];
  }
  return [];
}

function validateParallaxDepth(scene: Scene): Diagnostic[] {
  const background = scene.background;
  if (background === undefined || background.kind !== 'parallax') {
    return [];
  }
  for (let i = 1; i < background.layers.length; i += 1) {
    if (background.layers[i - 1].depth <= background.layers[i].depth) {
      continue;
    }
    return [{
      code: 'background.parallax.depth_unsorted',
      path: ['background', 'layers'],
      actual: background.layers.map((layer) => layer.depth),
      expected: 'monotonic ascending depth',
      repair: `sort Scene "${scene.id}" parallax layers by depth.`,
      severity: 'error',
    }];
  }
  return [];
}
