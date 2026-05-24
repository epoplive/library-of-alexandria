import type { z } from 'zod';
import type {
  AssetManifest,
  CastId,
  CastMember,
  Cue,
  Element,
  Layout,
  Production,
  ProductionId,
  Scene,
  SceneBackground,
  SceneId,
  Shot,
  ShotAddress,
  ShotId,
  Slot,
  SlotId,
  TransitionEdge,
} from '@/lib/lattice';
import type { InteractivesRegistry } from '@/lib/interactives';
import type { Diagnostic } from '@/lib/lesson-workflow/diagnostic-schema';
import type { ContentMap } from '@/lib/lesson-workflow/project-schema';
import type { ShotPlanKind } from '../types';

export { SHOT_PLAN_KINDS, type ShotPlanKind } from '../types';

export interface SpokenLine {
  id: string;
  cast_id: CastId;
  text: string;
  source_sentence_ids: string[];
  audio_slot_id: SlotId;
}

export type TransitionEdgeStub = Pick<TransitionEdge, 'kind' | 'duration_ms' | 'ease' | 'direction'>;

export interface PlanBase {
  kind: ShotPlanKind;
  shot_address: ShotAddress;
  source_beat_id?: string;
  speakers: CastId[];
  spoken_lines: SpokenLine[];
  transition_in?: TransitionEdgeStub;
  background_intent?: SceneBackground;
  duration_estimate_s: number;
}

export interface TitleCardPlan extends PlanBase {
  kind: 'title-card';
  eyebrow?: string;
  title: string;
  subtitle?: string;
}

export interface NarrativeShotPlan extends PlanBase {
  kind: 'narrative';
}

export interface NarratorOpenerPlan extends PlanBase {
  kind: 'narrator-opener';
  scene_eyebrow?: string;
  scene_title: string;
}

export interface CharacterDemoBeatPlan extends PlanBase {
  kind: 'character-demo-beat';
  characters_on_stage: CharacterOnStage[];
  action_cues: ActionCueHint[];
}

export interface CharacterOnStage {
  cast_id: CastId;
  enter_from?: 'left' | 'right' | 'top' | 'bottom';
}

export interface ActionCueHint {
  cast_id: CastId;
  at_s: number;
  component_id: string;
  method: string;
  args: unknown[];
}

export interface InteractiveTakeoverPlan extends PlanBase {
  kind: 'interactive-takeover';
  component_id: string;
  layout: Layout;
}

export type ShotPlan =
  | TitleCardPlan
  | NarrativeShotPlan
  | NarratorOpenerPlan
  | CharacterDemoBeatPlan
  | InteractiveTakeoverPlan;

export type SceneInit = Scene;
export type ShotInit = Shot;
export type SlotInit = Slot;

export interface ComposerDelta {
  add_scenes?: SceneInit[];
  add_shots?: { scene_id: SceneId; shot: ShotInit }[];
  add_elements?: { scene_id: SceneId; shot_id: ShotId; element: Element }[];
  add_cues?: { scene_id: SceneId; shot_id: ShotId; cue: Cue }[];
  add_transitions?: TransitionEdge[];
  set_scene_background?: { scene_id: SceneId; background: SceneBackground }[];
  add_slots?: SlotInit[];
  declared_components?: { scene_id: SceneId; shot_id: ShotId; component_id: string }[];
}

export type ReadonlyAssetManifest = Readonly<AssetManifest>;

export interface ComposerContext {
  production_id: ProductionId;
  cast: CastMember[];
  interactives: InteractivesRegistry;
  manifest_view: ReadonlyAssetManifest;
  contentMap?: ContentMap;
}

export interface ShotComposer<P extends ShotPlan = ShotPlan> {
  kind: P['kind'];
  schema: z.ZodSchema<P>;
  compose(ctx: ComposerContext, plan: P): ComposerDelta;
}

export interface ComposeProductionResult {
  production: Production;
  manifest: AssetManifest;
  diagnostics: Diagnostic[];
}
