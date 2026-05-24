import { z } from 'zod';
import { defineInteractiveContract } from '../define-interactive-contract';

export const fixedPointHunterContract = defineInteractiveContract({
  component_id: 'FixedPointHunter',
  methods: {
    setLevel: z.tuple([z.number()]),
    setZ0: z.tuple([z.tuple([z.number(), z.number()])]),
    setK: z.tuple([z.number()]),
    setFunction: z.tuple([z.string()]),
    submit: z.tuple([]),
    reset: z.tuple([]),
  },
});

export type FixedPointHunterMethod = keyof typeof fixedPointHunterContract.methods & string;
