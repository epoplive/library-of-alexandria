import { z } from 'zod';
import type { Cue, Element, Layout } from '@/lib/lattice';
import {
  dialogueSegmentForLine,
  dialogueSlots,
  emptyShot,
  PlanBaseFields,
  transitionInEdgeStub,
} from './helpers';
import type {
  CharacterDemoBeatPlan,
  ComposerDelta,
  ShotComposer,
} from './types';

const CharacterOnStageSchema = z.object({
  cast_id: z.string().min(1),
  enter_from: z.enum(['left', 'right', 'top', 'bottom']).optional(),
}).strict();

const ActionCueHintSchema = z.object({
  cast_id: z.string().min(1),
  at_s: z.number().nonnegative(),
  component_id: z.string().min(1),
  method: z.string().min(1),
  args: z.array(z.unknown()),
}).strict();

export const CharacterDemoBeatPlanSchema: z.ZodSchema<CharacterDemoBeatPlan> = z.object({
  kind: z.literal('character-demo-beat'),
  ...PlanBaseFields,
  characters_on_stage: z.array(CharacterOnStageSchema),
  action_cues: z.array(ActionCueHintSchema),
}).strict();

/**
 * Character-demo-beat composer.
 *
 * **Schema slice** — `CharacterDemoBeatPlan`, the beat where visible
 * Cast members enter, speak, and trigger interactive action cues.
 * **Decomposition** — The authoring agent chooses who is on stage,
 * optional entrance sides, ordered dialogue lines, and component method
 * calls that demonstrate the interactive.
 * **Format gate** — The Zod schema validates character/action hint
 * structure. The runner validates cast membership and that each action
 * method exists on the declared interactive contract.
 * **Test corpus** — `character-demo-beat.test.ts` covers off-stage
 * character starts, enter transforms, ordered dialogue segments,
 * dialogue slots, declared components, and action cue output.
 */
export const characterDemoBeatComposer: ShotComposer<CharacterDemoBeatPlan> = {
  kind: 'character-demo-beat',
  schema: CharacterDemoBeatPlanSchema,
  compose(ctx, plan) {
    void ctx;
    const dialogue = plan.spoken_lines.map(dialogueSegmentForLine);
    const shot = emptyShot({
      id: plan.shot_address.shot_id,
      duration_s: plan.duration_estimate_s,
      dialogue,
    });
    const elements: Element[] = [];
    const cues: Cue[] = [];

    for (let i = 0; i < plan.characters_on_stage.length; i += 1) {
      const character = plan.characters_on_stage[i];
      const targetLayout = characterTargetLayout(i, plan.characters_on_stage.length);
      const enterFrom = character.enter_from !== undefined ? character.enter_from : 'left';
      const element_id = characterElementId(character.cast_id);
      elements.push({
        id: element_id,
        kind: 'character',
        cast_id: character.cast_id,
        pose_policy: { mode: 'dialogue-auto' },
        initial_layout: offstageLayout(targetLayout, enterFrom),
      });
      cues.push({
        kind: 'transform',
        id: `${element_id}.enter`,
        element_id,
        at: 0,
        layout: targetLayout,
        transition: {
          duration_ms: 600,
          ease: 'easeOut',
        },
      });
    }

    for (let i = 0; i < plan.action_cues.length; i += 1) {
      const action = plan.action_cues[i];
      cues.push({
        kind: 'action',
        id: `action.${action.component_id}.${action.method}.${i}`,
        element_id: action.component_id,
        method: action.method,
        args: action.args,
        at: action.at_s,
      });
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
      declared_components: declaredComponents(plan),
    };

    if (plan.spoken_lines.length > 0) {
      delta.add_slots = dialogueSlots(plan.spoken_lines);
    }
    if (plan.transition_in !== undefined) {
      delta.add_transitions = [transitionInEdgeStub(plan.shot_address, plan.transition_in)];
    }
    return delta;
  },
};

function characterElementId(cast_id: string): string {
  return `character.${cast_id}`;
}

function characterTargetLayout(index: number, count: number): Layout {
  const spacing = 0.18;
  const centerOffset = (index - (count - 1) / 2) * spacing;
  return {
    position: [0.5 + centerOffset, 0.62, 0],
    scale: 1,
    opacity: 1,
    z_order: 30 + index,
    size: { width: 0.22, height: 0.46 },
  };
}

function offstageLayout(
  target: Layout,
  side: 'left' | 'right' | 'top' | 'bottom',
): Layout {
  const position = target.position;
  if (position === undefined) {
    throw new Error('character target layout requires position');
  }
  switch (side) {
    case 'left':
      return { ...target, position: [-0.2, position[1], position[2]] };
    case 'right':
      return { ...target, position: [1.2, position[1], position[2]] };
    case 'top':
      return { ...target, position: [position[0], -0.2, position[2]] };
    case 'bottom':
      return { ...target, position: [position[0], 1.2, position[2]] };
  }
}

function declaredComponents(
  plan: CharacterDemoBeatPlan,
): NonNullable<ComposerDelta['declared_components']> {
  const componentIds = new Set<string>();
  const declared: NonNullable<ComposerDelta['declared_components']> = [];
  for (const action of plan.action_cues) {
    if (componentIds.has(action.component_id)) {
      continue;
    }
    componentIds.add(action.component_id);
    declared.push({
      scene_id: plan.shot_address.scene_id,
      shot_id: plan.shot_address.shot_id,
      component_id: action.component_id,
    });
  }
  return declared;
}
