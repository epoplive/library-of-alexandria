import { z } from 'zod';
import {
  emptyShot,
  narrationSlots,
  narrationTracks,
  PlanBaseFields,
  transitionInEdgeStub,
} from './helpers';
import type {
  ComposerDelta,
  NarrativeShotPlan,
  ShotComposer,
} from './types';

export const NarrativeShotPlanSchema: z.ZodSchema<NarrativeShotPlan> = z.object({
  kind: z.literal('narrative'),
  ...PlanBaseFields,
}).strict();

/**
 * Narrative-shot composer.
 *
 * **Schema slice** — `NarrativeShotPlan`, the default spoken beat for
 * narrator-led exposition.
 * **Decomposition** — The authoring agent emits one natural-language
 * beat, stable spoken-line ids, and one audio slot per line. It may
 * request an inbound transition from the previous Shot.
 * **Format gate** — The Zod schema enforces the base ShotPlan shape;
 * the runner checks cast references, slot declarations, transition
 * adjacency, and overlap diagnostics.
 * **Test corpus** — `narrative-shot.test.ts` covers VO track emission,
 * multi-line dialogue spillover, slot declaration, and transition stub
 * output.
 */
export const narrativeShotComposer: ShotComposer<NarrativeShotPlan> = {
  kind: 'narrative',
  schema: NarrativeShotPlanSchema,
  compose(ctx, plan) {
    void ctx;
    const tracks = narrationTracks(plan.spoken_lines);
    const shot = emptyShot({
      id: plan.shot_address.shot_id,
      duration_s: plan.duration_estimate_s,
      vo: tracks.vo,
      dialogue: tracks.dialogue,
    });
    const delta: ComposerDelta = {
      add_shots: [{
        scene_id: plan.shot_address.scene_id,
        shot,
      }],
    };
    if (plan.spoken_lines.length > 0) {
      delta.add_slots = narrationSlots(plan.spoken_lines);
    }
    if (plan.transition_in !== undefined) {
      delta.add_transitions = [transitionInEdgeStub(plan.shot_address, plan.transition_in)];
    }
    return delta;
  },
};
