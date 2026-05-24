import { z } from 'zod';
import type { Cue, Element } from '@/lib/lattice';
import {
  emptyShot,
  narrationSlots,
  narrationTracks,
  PlanBaseFields,
  staggeredFadeUpCues,
  transitionInEdgeStub,
} from './helpers';
import type {
  ComposerDelta,
  NarratorOpenerPlan,
  ShotComposer,
} from './types';

export const NarratorOpenerPlanSchema: z.ZodSchema<NarratorOpenerPlan> = z.object({
  kind: z.literal('narrator-opener'),
  ...PlanBaseFields,
  scene_eyebrow: z.string().min(1).optional(),
  scene_title: z.string().min(1),
}).strict();

/**
 * Narrator-opener composer.
 *
 * **Schema slice** — `NarratorOpenerPlan`, the first-shot pattern that
 * names a Scene and establishes its narrator line.
 * **Decomposition** — The authoring agent selects a scene title,
 * optional eyebrow, narration lines, and first-shot background intent.
 * **Format gate** — The Zod schema validates opener text and base
 * ShotPlan fields; the runner owns duplicate Scene, cast, slot, and
 * transition diagnostics.
 * **Test corpus** — `narrator-opener.test.ts` covers Scene creation,
 * staggered opener overlays, narration slots, background intent, and
 * transition stub output.
 */
export const narratorOpenerComposer: ShotComposer<NarratorOpenerPlan> = {
  kind: 'narrator-opener',
  schema: NarratorOpenerPlanSchema,
  compose(ctx, plan) {
    void ctx;
    const tracks = narrationTracks(plan.spoken_lines);
    const shot = emptyShot({
      id: plan.shot_address.shot_id,
      duration_s: plan.duration_estimate_s,
      vo: tracks.vo,
      dialogue: tracks.dialogue,
    });
    const elements: Element[] = [];
    const cues: Cue[] = [];

    if (plan.scene_eyebrow !== undefined) {
      const element_id = 'narrator-opener.eyebrow';
      elements.push({
        id: element_id,
        kind: 'text-overlay',
        text: plan.scene_eyebrow,
        initial_layout: {
          position: [0.5, 0.38, 0],
          opacity: 0,
          z_order: 20,
        },
        style: {
          font: 'sans',
          size: 'sm',
          weight: 700,
          color: '#9ad1ff',
          align: 'center',
        },
      });
      cues.push(...staggeredFadeUpCues({
        element_id,
        at_offset_s: 0,
        duration_ms: 200,
      }));
    }

    elements.push({
      id: 'narrator-opener.title',
      kind: 'text-overlay',
      text: plan.scene_title,
      initial_layout: {
        position: [0.5, 0.53, 0],
        opacity: 0,
        z_order: 21,
      },
      style: {
        font: 'display',
        size: '4xl',
        weight: 800,
        color: '#ffffff',
        align: 'center',
      },
    });
    cues.push({
      kind: 'transform',
      element_id: 'narrator-opener.title',
      at: 0.15,
      layout: {
        position: [0.5, 0.5, 0],
        opacity: 1,
      },
      transition: {
        duration_ms: 400,
        ease: 'easeOut',
      },
    });

    const delta: ComposerDelta = {
      add_scenes: [{
        id: plan.shot_address.scene_id,
        eyebrow: plan.scene_eyebrow,
        title: plan.scene_title,
        summary: `Opener for ${plan.scene_title}`,
        shots: [],
      }],
      add_shots: [{
        scene_id: plan.shot_address.scene_id,
        shot,
      }],
      add_elements: elements.map((element) => ({
        scene_id: plan.shot_address.scene_id,
        shot_id: plan.shot_address.shot_id,
        element,
      })),
      add_cues: cues.map((cue) => ({
        scene_id: plan.shot_address.scene_id,
        shot_id: plan.shot_address.shot_id,
        cue,
      })),
    };

    if (plan.spoken_lines.length > 0) {
      delta.add_slots = narrationSlots(plan.spoken_lines);
    }
    if (plan.background_intent !== undefined) {
      delta.set_scene_background = [{
        scene_id: plan.shot_address.scene_id,
        background: plan.background_intent,
      }];
    }
    if (plan.transition_in !== undefined) {
      delta.add_transitions = [transitionInEdgeStub(plan.shot_address, plan.transition_in)];
    }
    return delta;
  },
};
