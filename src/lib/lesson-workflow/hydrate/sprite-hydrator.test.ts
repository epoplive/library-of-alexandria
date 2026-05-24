import { describe, expect, it } from 'vitest';
import { hydrateSprites } from './sprite-hydrator';
import {
  hydrateCastFixture,
  hydrateCastWithoutPoseSlotsFixture,
  hydrateManifestFixture,
} from './test-fixtures';

describe('hydrateSprites', () => {
  it('attaches deterministic placeholder Takes for cast pose slots', () => {
    const first = hydrateSprites({
      manifest: hydrateManifestFixture(),
      cast: hydrateCastFixture(),
    });
    const second = hydrateSprites({
      manifest: hydrateManifestFixture(),
      cast: hydrateCastFixture(),
    });

    const firstTake = first.manifest.slots['pose.duck.idle'].takes[0];
    const secondTake = second.manifest.slots['pose.duck.idle'].takes[0];
    expect([...first.attachedSlotIds]).toEqual(['pose.duck.idle']);
    expect(firstTake).toEqual(secondTake);
    expect(firstTake).toMatchObject({
      tier: 'v0.1',
      status: 'ready',
      artifact: {
        mime: 'image/svg+xml',
        path: 'placeholder-sprite://duck/idle.svg',
      },
      provenance: {
        provider: 'placeholder-sprite',
      },
    });
    expect(firstTake.artifact).toBeDefined();
    if (firstTake.artifact === undefined) throw new Error('expected artifact');
    expect(firstTake.artifact.url).toContain('data:image/svg+xml;charset=utf-8,');
  });

  it('is a no-op when cast has no pose_slots', () => {
    const result = hydrateSprites({
      manifest: hydrateManifestFixture(),
      cast: hydrateCastWithoutPoseSlotsFixture(),
    });

    expect(result.attachedSlotIds.size).toBe(0);
    expect(result.poseSlots).toEqual([]);
    expect(result.manifest).toEqual(hydrateManifestFixture());
  });
});
