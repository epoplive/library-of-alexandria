import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineInteractiveContract } from './define-interactive-contract';
import {
  defineInteractivesRegistry,
  getInteractive,
  listInteractiveContracts,
} from './define-interactives-registry';

function FakeComponent() {
  return null;
}

describe('defineInteractivesRegistry', () => {
  it('returns registered entries by component id', () => {
    const contract = defineInteractiveContract({
      component_id: 'demo',
      methods: { reset: z.tuple([]) },
    });
    const registry = defineInteractivesRegistry({
      demo: { component: FakeComponent, contract },
    });

    expect(getInteractive(registry, 'demo')).toEqual({
      component: FakeComponent,
      contract,
    });
  });

  it('returns undefined for a missing component id', () => {
    expect(getInteractive(defineInteractivesRegistry({}), 'missing')).toBeUndefined();
  });

  it('enumerates all contracts', () => {
    const first = defineInteractiveContract({
      component_id: 'one',
      methods: {},
    });
    const second = defineInteractiveContract({
      component_id: 'two',
      methods: {},
    });
    const registry = defineInteractivesRegistry({
      one: { component: FakeComponent, contract: first },
      two: { component: FakeComponent, contract: second },
    });

    expect(listInteractiveContracts(registry)).toEqual([first, second]);
  });
});
