import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Production, Shot } from './lattice';
import { defineInteractiveContract, defineInteractivesRegistry } from './interactives';
import {
  validateInteractiveActions,
  validateRegistryCoverage,
} from './interactive-validators';

function FakeComponent() {
  return null;
}

describe('validateRegistryCoverage', () => {
  it('reports an interactive-group Element whose component is not registered', () => {
    const production = baseProduction({
      id: 'game',
      kind: 'interactive-group',
      component_id: 'MissingGame',
    });

    expect(validateRegistryCoverage(production, defineInteractivesRegistry({}))).toEqual([{
      code: 'interactive.component.unregistered',
      path: ['scenes', 0, 'shots', 0, 'elements', 0, 'component_id'],
      actual: 'MissingGame',
      expected: 'component_id registered in InteractivesRegistry',
      repair: 'register interactive component "MissingGame".',
      severity: 'error',
    }]);
  });

  it('allows an empty registry when the Production has no interactive Elements', () => {
    expect(validateRegistryCoverage(baseProduction({
      id: 'label',
      kind: 'text-overlay',
      text: 'No game',
    }), defineInteractivesRegistry({}))).toEqual([]);
  });
});

describe('validateInteractiveActions', () => {
  it('reports an action Cue method missing from the component contract', () => {
    const production = baseProduction({
      id: 'game',
      kind: 'interactive-group',
      component_id: 'DemoGame',
    }, [{
      kind: 'action',
      element_id: 'game',
      method: 'jump',
      at: 0,
    }]);
    const contract = defineInteractiveContract({
      component_id: 'DemoGame',
      methods: {
        reset: z.tuple([]),
        setStep: z.tuple([z.number()]),
      },
    });
    const registry = defineInteractivesRegistry({
      DemoGame: { component: FakeComponent, contract },
    });

    expect(validateInteractiveActions(production, registry)).toEqual([{
      code: 'interactive.action.unknown_method',
      path: ['scenes', 0, 'shots', 0, 'cues', 0, 'method'],
      actual: {
        component_id: 'DemoGame',
        method: 'jump',
      },
      expected: ['reset', 'setStep'],
      repair: 'use one of reset, setStep on "DemoGame".',
      severity: 'error',
    }]);
  });

  it('allows actions against registered zero-argument methods', () => {
    const production = baseProduction({
      id: 'game',
      kind: 'interactive-group',
      component_id: 'DemoGame',
    }, [{
      kind: 'action',
      element_id: 'game',
      method: 'reset',
      at: 0,
    }]);
    const contract = defineInteractiveContract({
      component_id: 'DemoGame',
      methods: { reset: z.tuple([]) },
    });
    const registry = defineInteractivesRegistry({
      DemoGame: { component: FakeComponent, contract },
    });

    expect(validateInteractiveActions(production, registry)).toEqual([]);
  });
});

function baseProduction(
  element: Shot['elements'][number],
  cues?: Shot['cues'],
): Production {
  return {
    id: 'p',
    title: 'Production',
    summary: 'A test production for interactive validators.',
    tags: ['test'],
    tier: 'v0.1',
    characters: [],
    scenes: [{
      id: 's',
      title: 'Scene',
      shots: [{
        id: 'shot',
        duration: 1,
        elements: [element],
        cues,
      }],
    }],
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
