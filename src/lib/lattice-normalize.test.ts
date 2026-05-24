import { describe, expect, it } from 'vitest';
import type { FundingBlock, Provenance, Shot } from './lattice';
import {
  LatticeDiagnosticError,
  normalizeProduction,
  type NormalizableProduction,
} from './lattice-normalize';

const funding: FundingBlock = {
  production_cost_usd: 0,
  donations_received_usd: 0,
  donation_links: {},
  planned_improvements: [],
  ledger: [],
};

const provenance: Provenance = {
  authors: ['test'],
  created_at: '2026-05-23T00:00:00.000Z',
  license: 'CC-BY-4.0',
};

describe('normalizeProduction', () => {
  it('collapses deprecated Shot transition fields into Production.transitions[]', () => {
    const production: NormalizableProduction = baseProduction([
      {
        id: 'a',
        duration: 1,
        elements: [],
        transition_out: { kind: 'fade', duration: 0.4 },
      },
      {
        id: 'b',
        duration: 1,
        elements: [],
        transition_in: { kind: 'fade', duration: 0.4 },
      },
    ]);

    expect(normalizeProduction(production)).toEqual({
      ...production,
      scenes: [{
        id: 's',
        title: 'Scene',
        shots: [
          { id: 'a', duration: 1, elements: [] },
          { id: 'b', duration: 1, elements: [] },
        ],
      }],
      transitions: [{
        id: 'transition.s.a.to.s.b',
        from: { scene_id: 's', shot_id: 'a' },
        to: { scene_id: 's', shot_id: 'b' },
        kind: 'fade',
        duration_ms: 400,
      }],
    });
  });

  it('throws structured diagnostics for conflicting deprecated fields', () => {
    const production: NormalizableProduction = baseProduction([
      {
        id: 'a',
        duration: 1,
        elements: [],
        transition_out: { kind: 'fade', duration: 0.4 },
      },
      {
        id: 'b',
        duration: 1,
        elements: [],
        transition_in: { kind: 'wipe', duration: 0.4 },
      },
    ]);

    expectDiagnosticCode(production, 'transition.edge.conflict');
  });

  it('throws structured diagnostics for non-adjacent explicit edges', () => {
    const production: NormalizableProduction = {
      ...baseProduction([
        { id: 'a', duration: 1, elements: [] },
        { id: 'b', duration: 1, elements: [] },
        { id: 'c', duration: 1, elements: [] },
      ]),
      transitions: [{
        id: 'skip',
        from: { scene_id: 's', shot_id: 'a' },
        to: { scene_id: 's', shot_id: 'c' },
        kind: 'fade',
        duration_ms: 300,
      }],
    };

    expectDiagnosticCode(production, 'transition.edge.non_adjacent');
  });
});

function baseProduction(shots: Shot[]): NormalizableProduction {
  return {
    id: 'p',
    title: 'Production',
    summary: 'A test production long enough for the schema.',
    tags: ['test'],
    tier: 'v0.1',
    characters: [],
    scenes: [{
      id: 's',
      title: 'Scene',
      shots,
    }],
    funding,
    provenance,
  };
}

function expectDiagnosticCode(production: NormalizableProduction, code: string): void {
  try {
    normalizeProduction(production);
  } catch (error) {
    if (!(error instanceof LatticeDiagnosticError)) {
      throw error;
    }
    expect(error.diagnostics[0].code).toBe(code);
    return;
  }
  throw new Error(`Expected diagnostic ${code}`);
}
