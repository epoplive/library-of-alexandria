import { describe, expect, it } from 'vitest';
import type { Production } from '@/lib/lattice';
import { resolveTransitionEnvelope } from './transition-envelope';

describe('resolveTransitionEnvelope', () => {
  it('returns the outgoing edge envelope during the transition window', () => {
    const state = resolveTransitionEnvelope(productionWithFade(), 0, 1.75);
    if (state === null || state.envelope === undefined) {
      throw new Error('Expected transition envelope');
    }

    expect(state.activeShot.id).toBe('a');
    expect(state.envelope.prevShot.id).toBe('a');
    expect(state.envelope.nextShot.id).toBe('b');
    expect(state.envelope.edge.id).toBe('a-to-b');
    expect(state.envelope.progress).toBeCloseTo(0.5);
    expect(state.envelope.prevShotTime).toBe(2);
    expect(state.envelope.nextShotTime).toBe(0);
  });

  it('returns only the active Shot outside the transition window', () => {
    const state = resolveTransitionEnvelope(productionWithFade(), 0, 1.2);
    if (state === null) {
      throw new Error('Expected active shot');
    }

    expect(state.activeShot.id).toBe('a');
    expect(state.envelope).toBeUndefined();
  });

  it('treats missing edges as cuts', () => {
    const production = productionWithFade();
    const state = resolveTransitionEnvelope({ ...production, transitions: [] }, 0, 1.75);
    if (state === null) {
      throw new Error('Expected active shot');
    }

    expect(state.activeShot.id).toBe('a');
    expect(state.envelope).toBeUndefined();
  });
});

function productionWithFade(): Production {
  return {
    id: 'p',
    title: 'Production',
    summary: 'A test production for transition envelope behavior.',
    tags: ['test'],
    tier: 'v0.1',
    characters: [],
    scenes: [{
      id: 's',
      title: 'Scene',
      shots: [
        { id: 'a', duration: 2, elements: [] },
        { id: 'b', duration: 2, elements: [] },
      ],
    }],
    transitions: [{
      id: 'a-to-b',
      from: { scene_id: 's', shot_id: 'a' },
      to: { scene_id: 's', shot_id: 'b' },
      kind: 'fade',
      duration: 500,
    }],
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
