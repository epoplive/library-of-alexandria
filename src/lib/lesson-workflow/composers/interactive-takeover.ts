import { z } from 'zod';
import type { Element } from '@/lib/lattice';
import {
  emptyShot,
  LayoutSchema,
  narrationSlots,
  narrationTracks,
  PlanBaseFields,
  transitionInEdgeStub,
} from './helpers';
import type {
  ComposerDelta,
  InteractiveTakeoverPlan,
  ShotComposer,
} from './types';

export const InteractiveTakeoverPlanSchema: z.ZodSchema<InteractiveTakeoverPlan> = z.object({
  kind: z.literal('interactive-takeover'),
  ...PlanBaseFields,
  component_id: z.string().min(1),
  layout: LayoutSchema,
}).strict();

/**
 * Interactive-takeover composer.
 *
 * **Schema slice** — `InteractiveTakeoverPlan`, the beat that places a
 * custom interactive component into the Shot composition.
 * **Decomposition** — The authoring agent selects the component id,
 * layout, any narrator line, and optional inbound transition. Character
 * exits are intentionally planned as separate Shots.
 * **Format gate** — The Zod schema validates component id, layout, and
 * base ShotPlan fields. The runner validates component registration,
 * slot references, cast ids, and transition adjacency.
 * **Test corpus** — `interactive-takeover.test.ts` covers interactive
 * element emission, declared component registration, VO slot declaration,
 * and transition stub output.
 */
export const interactiveTakeoverComposer: ShotComposer<InteractiveTakeoverPlan> = {
  kind: 'interactive-takeover',
  schema: InteractiveTakeoverPlanSchema,
  compose(ctx, plan) {
    void ctx;
    const tracks = narrationTracks(plan.spoken_lines);
    const shot = emptyShot({
      id: plan.shot_address.shot_id,
      duration_s: plan.duration_estimate_s,
      vo: tracks.vo,
      dialogue: tracks.dialogue,
    });
    const element: Element = {
      id: plan.component_id,
      kind: 'interactive-group',
      component_id: plan.component_id,
      initial_layout: plan.layout,
    };
    const delta: ComposerDelta = {
      add_shots: [{
        scene_id: plan.shot_address.scene_id,
        shot,
      }],
      add_elements: [{
        scene_id: plan.shot_address.scene_id,
        shot_id: plan.shot_address.shot_id,
        element,
      }],
      declared_components: [{
        scene_id: plan.shot_address.scene_id,
        shot_id: plan.shot_address.shot_id,
        component_id: plan.component_id,
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
