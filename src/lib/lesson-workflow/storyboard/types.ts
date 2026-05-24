import { z } from 'zod';
import type { Layout, SceneBackground } from '@/lib/lattice';
import { ShotAddressSchema } from '../project-schema';

const idPattern = /^[a-z0-9][a-z0-9-]{0,79}$/;

export const SpokenLineSchema = z.object({
  id: z.string().regex(idPattern),
  cast_id: z.string().min(1),
  text: z.string().min(1),
  source_sentence_ids: z.array(z.string().min(1)).min(1),
  audio_slot_id: z.string().min(1),
}).strict();

export const TRANSITION_KINDS = [
  'cut',
  'fade',
  'cross-dissolve',
  'slide',
  'push',
  'wipe',
  'iris',
  'shader',
] as const;

export const EASE_CURVES = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'spring',
] as const;

export const TRANSITION_DIRECTIONS = ['left', 'right', 'up', 'down'] as const;

export const TransitionEdgeStubSchema = z.object({
  kind: z.enum(TRANSITION_KINDS),
  duration_ms: z.number().int().nonnegative(),
  ease: z.enum(EASE_CURVES).optional(),
  direction: z.enum(TRANSITION_DIRECTIONS).optional(),
}).strict();

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
const ScaleSchema = z.union([
  z.number(),
  Vec3Schema,
]);

export const LayoutSchema: z.ZodType<Layout> = z.object({
  position: Vec3Schema.optional(),
  rotation: Vec3Schema.optional(),
  scale: ScaleSchema.optional(),
  size: z.object({
    width: z.number(),
    height: z.number(),
  }).strict().optional(),
  z_order: z.number().optional(),
  opacity: z.number().optional(),
}).strict();

const GradientStopSchema = z.object({
  offset: z.number(),
  color: z.string().min(1),
}).strict();

const BoxRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
}).strict();

const ParallaxLayerSchema = z.object({
  slot_id: z.string().min(1),
  depth: z.number(),
  offset: z.object({
    x: z.number(),
    y: z.number(),
  }).strict().optional(),
}).strict();

export const SceneBackgroundSchema: z.ZodType<SceneBackground> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('none'),
  }).strict(),
  z.object({
    kind: z.literal('gradient'),
    stops: z.array(GradientStopSchema),
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
    layers: z.array(ParallaxLayerSchema),
  }).strict(),
]);

const PlanBaseShape = {
  shot_address: ShotAddressSchema,
  source_beat_id: z.string().min(1).optional(),
  speakers: z.array(z.string().min(1)),
  spoken_lines: z.array(SpokenLineSchema),
  transition_in: TransitionEdgeStubSchema.optional(),
  duration_estimate_s: z.number().nonnegative(),
};

export const TitleCardPlanSchema = z.object({
  kind: z.literal('title-card'),
  ...PlanBaseShape,
  background_intent: SceneBackgroundSchema.optional(),
  eyebrow: z.string().min(1).optional(),
  title: z.string().min(1),
  subtitle: z.string().min(1).optional(),
}).strict();

export const NarrativeShotPlanSchema = z.object({
  kind: z.literal('narrative'),
  ...PlanBaseShape,
  background_intent: SceneBackgroundSchema.optional(),
}).strict();

export const NarratorOpenerPlanSchema = z.object({
  kind: z.literal('narrator-opener'),
  ...PlanBaseShape,
  background_intent: SceneBackgroundSchema.optional(),
  scene_eyebrow: z.string().min(1).optional(),
  scene_title: z.string().min(1),
}).strict();

export const CharacterOnStageSchema = z.object({
  cast_id: z.string().min(1),
  enter_from: z.enum(['left', 'right', 'top', 'bottom']).optional(),
}).strict();

export const ActionCueHintSchema = z.object({
  cast_id: z.string().min(1),
  at_s: z.number().nonnegative(),
  component_id: z.string().min(1),
  method: z.string().min(1),
  args: z.array(z.unknown()),
}).strict();

export const CharacterDemoBeatPlanSchema = z.object({
  kind: z.literal('character-demo-beat'),
  ...PlanBaseShape,
  background_intent: SceneBackgroundSchema.optional(),
  characters_on_stage: z.array(CharacterOnStageSchema),
  action_cues: z.array(ActionCueHintSchema),
}).strict();

export const InteractiveTakeoverPlanSchema = z.object({
  kind: z.literal('interactive-takeover'),
  ...PlanBaseShape,
  background_intent: SceneBackgroundSchema.optional(),
  component_id: z.string().min(1),
  layout: LayoutSchema,
}).strict();

export const ShotPlanSchema = z.discriminatedUnion('kind', [
  TitleCardPlanSchema,
  NarrativeShotPlanSchema,
  NarratorOpenerPlanSchema,
  CharacterDemoBeatPlanSchema,
  InteractiveTakeoverPlanSchema,
]);

export const StoryboardSchema = z.object({
  schema_version: z.literal('loa.storyboard.v1'),
  plans: z.array(ShotPlanSchema),
}).strict().describe('loa.storyboard.v1');

export type SpokenLine = z.infer<typeof SpokenLineSchema>;
export type TransitionEdgeStub = z.infer<typeof TransitionEdgeStubSchema>;
export type TitleCardPlan = z.infer<typeof TitleCardPlanSchema>;
export type NarrativeShotPlan = z.infer<typeof NarrativeShotPlanSchema>;
export type NarratorOpenerPlan = z.infer<typeof NarratorOpenerPlanSchema>;
export type CharacterOnStage = z.infer<typeof CharacterOnStageSchema>;
export type ActionCueHint = z.infer<typeof ActionCueHintSchema>;
export type CharacterDemoBeatPlan = z.infer<typeof CharacterDemoBeatPlanSchema>;
export type InteractiveTakeoverPlan = z.infer<typeof InteractiveTakeoverPlanSchema>;
export type ShotPlan = z.infer<typeof ShotPlanSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;
