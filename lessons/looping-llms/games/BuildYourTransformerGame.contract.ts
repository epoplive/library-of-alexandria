import { z } from 'zod';
import { defineInteractiveContract } from '@/lib/interactives';

export const BuildYourTransformerGameContract = defineInteractiveContract({
  component_id: 'BuildYourTransformerGame',
  methods: {
    reset: z.tuple([]),
    setM: z.tuple([z.number().int().nonnegative()]),
    setK: z.tuple([z.number().int().nonnegative()]),
  },
});
