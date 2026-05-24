import { z } from 'zod';
import type { Cue, Element, Layout } from '@/lib/lattice';
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
  ShotComposer,
  TitleCardPlan,
} from './types';

export const TitleCardPlanSchema: z.ZodSchema<TitleCardPlan> = z.object({
  kind: z.literal('title-card'),
  ...PlanBaseFields,
  eyebrow: z.string().min(1).optional(),
  title: z.string().min(1),
  subtitle: z.string().min(1).optional(),
}).strict();

/**
 * Title-card composer.
 *
 * **Schema slice** — `TitleCardPlan`, the opening or section-title
 * ShotPlan kind with optional eyebrow/subtitle and narrator lines.
 * **Decomposition** — The authoring agent names the visual hierarchy,
 * assigns stable audio slot ids for any narration, and optionally
 * requests a scene background or inbound transition.
 * **Format gate** — The Zod schema enforces title text, positive
 * duration, structured shot address, spoken line ids, and transition
 * stubs. The runner validates cast, slot, and transition invariants.
 * **Test corpus** — `title-card.test.ts` covers title, eyebrow,
 * subtitle, VO slot declaration, background, and transition stub output.
 */
export const titleCardComposer: ShotComposer<TitleCardPlan> = {
  kind: 'title-card',
  schema: TitleCardPlanSchema,
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

    if (plan.eyebrow !== undefined) {
      const element_id = 'title-card.eyebrow';
      elements.push({
        id: element_id,
        kind: 'text-overlay',
        text: plan.eyebrow,
        initial_layout: {
          position: [0.5, 0.34, 0],
          opacity: 0,
          z_order: 20,
        },
        style: {
          font: 'sans',
          size: 'sm',
          weight: 700,
          color: '#f2c14e',
          align: 'center',
        },
      });
      cues.push(...staggeredFadeUpCues({
        element_id,
        at_offset_s: 0,
        duration_ms: 200,
      }));
    }

    const titleInitialLayout: Layout = {
      position: [0.5, 0.54, 0],
      opacity: 0,
      z_order: 21,
    };
    elements.push({
      id: 'title-card.title',
      kind: 'text-overlay',
      text: plan.title,
      initial_layout: titleInitialLayout,
      style: {
        font: 'display',
        size: '5xl',
        weight: 800,
        color: '#ffffff',
        align: 'center',
      },
    });
    cues.push({
      kind: 'transform',
      element_id: 'title-card.title',
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

    if (plan.subtitle !== undefined) {
      const element_id = 'title-card.subtitle';
      elements.push({
        id: element_id,
        kind: 'text-overlay',
        text: plan.subtitle,
        initial_layout: {
          position: [0.5, 0.64, 0],
          opacity: 0,
          z_order: 20,
        },
        style: {
          font: 'sans',
          size: 'lg',
          weight: 500,
          color: '#d9e3f0',
          align: 'center',
        },
      });
      cues.push(...staggeredFadeUpCues({
        element_id,
        at_offset_s: 0.4,
        duration_ms: 300,
      }));
    }

    const delta: ComposerDelta = {
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
