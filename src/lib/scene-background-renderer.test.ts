import { describe, expect, it } from 'vitest';
import type { GradientBackground, ImagePanBackground, Production } from './lattice';
import {
  findActiveScene,
  gradientDriftOffset,
  imagePanFrame,
  sceneElapsedSeconds,
  sceneStartShotIndex,
} from './scene-background-renderer';

describe('imagePanFrame', () => {
  const background: ImagePanBackground = {
    kind: 'image-pan',
    slot_id: 'bg',
    pan: {
      from: { x: 0, y: 0, width: 1, height: 1 },
      to: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 },
    },
    zoom: { from: 1, to: 2 },
    duration_s: 10,
  };

  it('returns the start frame at t=0', () => {
    expect(imagePanFrame(background, 0)).toEqual({
      box: { x: 0, y: 0, width: 1, height: 1 },
      zoom: 1,
    });
  });

  it('interpolates the pan and zoom halfway through', () => {
    expect(imagePanFrame(background, 5)).toEqual({
      box: { x: 0.1, y: 0.05, width: 0.8, height: 0.9 },
      zoom: 1.5,
    });
  });

  it('returns the final frame after the duration elapses', () => {
    expect(imagePanFrame(background, 12)).toEqual({
      box: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 },
      zoom: 2,
    });
  });

  it('keeps degenerate boxes static when from equals to', () => {
    const staticBackground: ImagePanBackground = {
      kind: 'image-pan',
      slot_id: 'bg',
      pan: {
        from: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
        to: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      },
      duration_s: 10,
    };

    expect(imagePanFrame(staticBackground, 5)).toEqual({
      box: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      zoom: 1,
    });
  });
});

describe('gradientDriftOffset', () => {
  it('wraps back to the origin after one drift cycle', () => {
    const background: GradientBackground = {
      kind: 'gradient',
      stops: [{ offset: 0, color: '#000' }],
      drift: { speed_s: 4, direction: 'right' },
    };

    expect(gradientDriftOffset(background, 0)).toEqual({ x: 0, y: 0 });
    expect(gradientDriftOffset(background, 2)).toEqual({ x: 0.5, y: 0 });
    expect(gradientDriftOffset(background, 4)).toEqual({ x: 0, y: 0 });
  });
});

describe('findActiveScene', () => {
  it('returns the Scene containing the active Shot address', () => {
    const production = baseProduction();

    expect(findActiveScene(production, { scene_id: 's2', shot_id: 's2b' }).id).toBe('s2');
  });
});

describe('sceneStartShotIndex', () => {
  it('counts preceding Shots in canonical timeline order', () => {
    expect(sceneStartShotIndex(baseProduction(), 's2')).toBe(2);
  });
});

describe('sceneElapsedSeconds', () => {
  it('accumulates elapsed time within the active Scene only', () => {
    expect(sceneElapsedSeconds(baseProduction(), { scene_id: 's2', shot_id: 's2b' }, 0.5)).toBe(3.5);
  });
});

function baseProduction(): Production {
  return {
    id: 'p',
    title: 'Production',
    summary: 'A test production for scene background helpers.',
    tags: ['test'],
    tier: 'v0.1',
    characters: [],
    scenes: [
      {
        id: 's1',
        title: 'One',
        shots: [
          { id: 's1a', duration: 1, elements: [] },
          { id: 's1b', duration: 1, elements: [] },
        ],
      },
      {
        id: 's2',
        title: 'Two',
        shots: [
          { id: 's2a', duration: 3, elements: [] },
          { id: 's2b', duration: 2, elements: [] },
        ],
      },
    ],
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
