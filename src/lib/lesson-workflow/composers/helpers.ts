import { z } from 'zod';
import type {
  Cue,
  DialogueSegment,
  ElementId,
  SceneBackground,
  Shot,
  ShotAddress,
  Slot,
  SlotId,
  TransitionEdge,
  VOTrack,
} from '@/lib/lattice';
import type {
  SpokenLine,
  TransitionEdgeStub,
} from './types';

export const ShotAddressSchema = z.object({
  scene_id: z.string().min(1),
  shot_id: z.string().min(1),
}).strict();

export const SpokenLineSchema = z.object({
  id: z.string().min(1),
  cast_id: z.string().min(1),
  text: z.string().min(1),
  source_sentence_ids: z.array(z.string().min(1)),
  audio_slot_id: z.string().min(1),
}).strict();

export const EaseCurveSchema = z.enum([
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'spring',
]);

export const TransitionEdgeStubSchema = z.object({
  kind: z.enum([
    'cut',
    'fade',
    'cross-dissolve',
    'slide',
    'push',
    'wipe',
    'iris',
    'shader',
  ]),
  duration_ms: z.number().nonnegative(),
  ease: EaseCurveSchema.optional(),
  direction: z.enum(['left', 'right', 'up', 'down']).optional(),
}).strict();

export const LayoutSchema = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]).optional(),
  rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
  scale: z.union([
    z.number(),
    z.tuple([z.number(), z.number(), z.number()]),
  ]).optional(),
  size: z.object({
    width: z.number(),
    height: z.number(),
  }).strict().optional(),
  z_order: z.number().optional(),
  opacity: z.number().optional(),
}).strict();

const BoxRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
}).strict();

export const SceneBackgroundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({
    kind: z.literal('gradient'),
    stops: z.array(z.object({
      offset: z.number(),
      color: z.string().min(1),
    }).strict()),
    drift: z.object({
      speed_s: z.number().positive(),
      direction: z.enum(['left', 'right', 'up', 'down', 'diagonal']),
    }).strict().optional(),
  }).strict(),
  z.object({
    kind: z.literal('image-pan'),
    slot_id: z.string().min(1),
    pan: z.object({
      from: BoxRectSchema,
      to: BoxRectSchema,
    }).strict(),
    zoom: z.object({
      from: z.number().positive(),
      to: z.number().positive(),
    }).strict().optional(),
    duration_s: z.number().positive(),
  }).strict(),
  z.object({
    kind: z.literal('parallax'),
    layers: z.array(z.object({
      slot_id: z.string().min(1),
      depth: z.number(),
      offset: z.object({
        x: z.number(),
        y: z.number(),
      }).strict().optional(),
    }).strict()),
  }).strict(),
]);

export const PlanBaseFields = {
  shot_address: ShotAddressSchema,
  source_beat_id: z.string().min(1).optional(),
  speakers: z.array(z.string().min(1)),
  spoken_lines: z.array(SpokenLineSchema),
  transition_in: TransitionEdgeStubSchema.optional(),
  background_intent: SceneBackgroundSchema.optional(),
  duration_estimate_s: z.number().positive(),
};

export function slotIdForVO(shot_address: ShotAddress, line_index: number): SlotId {
  return `${shot_address.scene_id}.${shot_address.shot_id}.vo${line_index}`;
}

export function slotIdForDialogue(
  shot_address: ShotAddress,
  cast_id: string,
  line_index: number,
): SlotId {
  return `${shot_address.scene_id}.${shot_address.shot_id}.${cast_id}.dialogue${line_index}`;
}

export function defaultTransition(): TransitionEdgeStub {
  return {
    kind: 'cross-dissolve',
    duration_ms: 400,
    ease: 'easeOut',
  };
}

export function staggeredFadeUpCues(args: {
  element_id: ElementId;
  at_offset_s: number;
  duration_ms: number;
}): Cue[] {
  return [{
    kind: 'transform',
    element_id: args.element_id,
    at: args.at_offset_s,
    layout: { opacity: 1 },
    transition: {
      duration_ms: args.duration_ms,
      ease: 'easeOut',
    },
  }];
}

export function transitionInEdgeStub(
  shot_address: ShotAddress,
  transition: TransitionEdgeStub,
): TransitionEdge {
  return {
    id: `transition.in.${shot_address.scene_id}.${shot_address.shot_id}`,
    from: shot_address,
    to: shot_address,
    kind: transition.kind,
    duration_ms: transition.duration_ms,
    ease: transition.ease,
    direction: transition.direction,
  };
}

export function emptyShot(args: {
  id: string;
  duration_s: number;
  vo?: VOTrack;
  dialogue?: DialogueSegment[];
}): Shot {
  const shot: Shot = {
    id: args.id,
    duration: args.duration_s,
    elements: [],
  };
  if (args.vo !== undefined) {
    shot.vo = args.vo;
  }
  if (args.dialogue !== undefined && args.dialogue.length > 0) {
    shot.dialogue = args.dialogue;
  }
  return shot;
}

export function voTrackForLine(line: SpokenLine): VOTrack {
  return {
    cast_id: line.cast_id,
    line: { text: line.text },
    audio: { slot_id: line.audio_slot_id },
  };
}

export function dialogueSegmentForLine(line: SpokenLine): DialogueSegment {
  return {
    id: line.id,
    cast_id: line.cast_id,
    line: { text: line.text },
    audio: { slot_id: line.audio_slot_id },
  };
}

export function narrationSlots(lines: SpokenLine[]): Slot[] {
  const slots: Slot[] = [];
  for (const line of lines) {
    slots.push({
      id: line.audio_slot_id,
      kind: 'audio-vo',
      description: audioSlotDescription('Voiceover', line),
      takes: [],
      selection: 'best-available',
    });
  }
  return slots;
}

export function dialogueSlots(lines: SpokenLine[]): Slot[] {
  const slots: Slot[] = [];
  for (const line of lines) {
    slots.push({
      id: line.audio_slot_id,
      kind: 'audio-dialogue',
      description: audioSlotDescription('Dialogue', line),
      takes: [],
      selection: 'best-available',
    });
  }
  return slots;
}

export function narrationTracks(lines: SpokenLine[]): {
  vo?: VOTrack;
  dialogue?: DialogueSegment[];
} {
  if (lines.length === 0) {
    return {};
  }
  const dialogue: DialogueSegment[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    dialogue.push(dialogueSegmentForLine(lines[i]));
  }
  if (dialogue.length === 0) {
    return { vo: voTrackForLine(lines[0]) };
  }
  return {
    vo: voTrackForLine(lines[0]),
    dialogue,
  };
}

export function backgroundSlots(background: SceneBackground): SlotId[] {
  switch (background.kind) {
    case 'none':
    case 'gradient':
      return [];
    case 'image-pan':
      return [background.slot_id];
    case 'parallax': {
      const slotIds: SlotId[] = [];
      for (const layer of background.layers) {
        slotIds.push(layer.slot_id);
      }
      return slotIds;
    }
  }
}

function audioSlotDescription(prefix: string, line: SpokenLine): string {
  const excerpt = line.text.length > 80 ? `${line.text.slice(0, 77)}...` : line.text;
  return `${prefix} for ${line.cast_id}: ${excerpt}`;
}
