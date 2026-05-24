import { describe, expect, it } from 'vitest';
import type { AssetManifest, Scene } from './lattice';
import { validateSceneBackground } from './background-validators';

describe('validateSceneBackground', () => {
  it('reports unsorted gradient stops', () => {
    const scene: Scene = {
      id: 's',
      title: 'Scene',
      background: {
        kind: 'gradient',
        stops: [
          { offset: 0.8, color: '#fff' },
          { offset: 0.2, color: '#000' },
        ],
      },
      shots: [],
    };

    expect(validateSceneBackground(scene, emptyManifest(), { tier: 'v0.1' })[0].code)
      .toBe('background.gradient.stops_unsorted');
  });

  it('allows a one-stop gradient', () => {
    const scene: Scene = {
      id: 's',
      title: 'Scene',
      background: {
        kind: 'gradient',
        stops: [{ offset: 0, color: '#fff' }],
      },
      shots: [],
    };

    expect(validateSceneBackground(scene, emptyManifest(), { tier: 'v0.1' })).toEqual([]);
  });

  it('reports a missing image-pan Slot', () => {
    const scene: Scene = {
      id: 's',
      title: 'Scene',
      background: {
        kind: 'image-pan',
        slot_id: 'missing',
        pan: {
          from: { x: 0, y: 0, width: 1, height: 1 },
          to: { x: 0, y: 0, width: 1, height: 1 },
        },
        duration_s: 10,
      },
      shots: [],
    };

    expect(validateSceneBackground(scene, emptyManifest(), { tier: 'v0.1' })[0].code)
      .toBe('background.image_pan.slot_missing');
  });

  it('reports unsorted parallax depths', () => {
    const scene: Scene = {
      id: 's',
      title: 'Scene',
      background: {
        kind: 'parallax',
        layers: [
          { slot_id: 'front', depth: 0.7 },
          { slot_id: 'back', depth: 0.2 },
        ],
      },
      shots: [],
    };

    expect(validateSceneBackground(scene, emptyManifest(), { tier: 'v0.1' })[0].code)
      .toBe('background.parallax.depth_unsorted');
  });

  it('allows a one-layer parallax background', () => {
    const scene: Scene = {
      id: 's',
      title: 'Scene',
      background: {
        kind: 'parallax',
        layers: [{ slot_id: 'single', depth: 0 }],
      },
      shots: [],
    };

    expect(validateSceneBackground(scene, emptyManifest(), { tier: 'v0.1' })).toEqual([]);
  });
});

function emptyManifest(): AssetManifest {
  return {
    production_id: 'p',
    slots: {},
  };
}
