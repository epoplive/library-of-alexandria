import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineInteractiveContract } from './define-interactive-contract';

describe('defineInteractiveContract', () => {
  it('returns the component id and preserves method argument tuple shapes', () => {
    const contract = defineInteractiveContract({
      component_id: 'demo',
      methods: {
        reset: z.tuple([]),
        setStep: z.tuple([z.number()]),
      },
    });

    expect(contract.component_id).toBe('demo');
    expect(contract.methods.reset.args.parse([])).toEqual([]);
    expect(contract.methods.setStep.args.parse([3])).toEqual([3]);
  });

  it('allows a contract with zero methods', () => {
    const contract = defineInteractiveContract({
      component_id: 'display-only',
      methods: {},
    });

    expect(Object.keys(contract.methods)).toEqual([]);
  });
});
