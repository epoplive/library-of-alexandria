import { INTERACTIVES_REGISTRY as LOOPING_LLMS_INTERACTIVES_REGISTRY } from '../../../../lessons/looping-llms/interactives/registry';
import type { InteractivesRegistry } from '@/lib/interactives';
import { getInteractive } from '@/lib/interactives';
import { DiagnosticSchema, type Diagnostic } from '../diagnostic-schema';
import type { LessonCorpus } from '../ingest/types';
import type { SceneMapArtifact } from '../scene-map/types';
import type { ActionCueHint, ShotPlan, Storyboard } from './types';

interface KnownComponentRegistry {
  size: number;
  complete: boolean;
  has: (componentId: string) => boolean;
}

export interface ValidateStoryboardContext {
  corpus: LessonCorpus;
  sceneMap: SceneMapArtifact;
  interactives?: InteractivesRegistry;
}

const KNOWN_INTERACTIVE_REGISTRIES: Array<{
  slug: string;
  registry: KnownComponentRegistry;
}> = [
  {
    slug: 'looping-llms',
    registry: LOOPING_LLMS_INTERACTIVES_REGISTRY,
  },
];

export function validateStoryboard(storyboard: Storyboard, ctx: ValidateStoryboardContext): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  diagnostics.push(...validateLineAnchors(storyboard, ctx.sceneMap));
  diagnostics.push(...validateActionMethods(storyboard, ctx.interactives));
  diagnostics.push(...validateTransitionAdjacency(storyboard, ctx.sceneMap));
  diagnostics.push(...validateMissingSpeakers(storyboard));
  diagnostics.push(...validateTakeoverComponents(storyboard, ctx));
  diagnostics.push(...validateOpeners(storyboard));
  diagnostics.push(...validateAudioSlots(storyboard));
  return diagnostics;
}

function validateLineAnchors(storyboard: Storyboard, sceneMap: SceneMapArtifact): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const sentenceIds = new Set<string>();
  for (const scene of sceneMap.detail.scenes) {
    for (const sentence of scene.sentences) {
      sentenceIds.add(sentence.id);
    }
  }

  storyboard.plans.forEach((plan, planIndex) => {
    plan.spoken_lines.forEach((line, lineIndex) => {
      line.source_sentence_ids.forEach((sentenceId, sentenceIndex) => {
        if (sentenceIds.has(sentenceId)) return;
        diagnostics.push(diagnostic({
          code: 'storyboard.line.unanchored',
          path: ['plans', planIndex, 'spoken_lines', lineIndex, 'source_sentence_ids', sentenceIndex],
          actual: sentenceId,
          expected: 'sentence id from scene-map.detail.scenes[].sentences[]',
          repair: 'use a source sentence id from the scene-map detail or remove the spoken line',
          severity: 'error',
        }));
      });
    });
  });

  return diagnostics;
}

function validateActionMethods(storyboard: Storyboard, interactives: InteractivesRegistry | undefined): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (interactives === undefined) return diagnostics;

  storyboard.plans.forEach((plan, planIndex) => {
    if (plan.kind !== 'character-demo-beat') return;
    plan.action_cues.forEach((action, actionIndex) => {
      const entry = getInteractive(interactives, action.component_id);
      if (entry === undefined) return;
      const validMethods = Object.keys(entry.contract.methods).sort();
      if (entry.contract.methods[action.method] !== undefined) return;
      diagnostics.push(actionMethodDiagnostic(action, planIndex, actionIndex, validMethods));
    });
  });

  return diagnostics;
}

function actionMethodDiagnostic(
  action: ActionCueHint,
  planIndex: number,
  actionIndex: number,
  validMethods: string[],
): Diagnostic {
  const repair = validMethods.length === 0
    ? 'remove the action cue because the component contract has no methods'
    : `use one of: ${validMethods.join(', ')}`;
  return diagnostic({
    code: 'storyboard.action.unknown_method',
    path: ['plans', planIndex, 'action_cues', actionIndex, 'method'],
    actual: action.method,
    expected: validMethods,
    repair,
    severity: 'error',
  });
}

function validateTransitionAdjacency(storyboard: Storyboard, sceneMap: SceneMapArtifact): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const sceneOrder = sceneOrderMap(sceneMap);
  const maxShotOrdinals = maxShotOrdinalByScene(storyboard.plans);

  for (let index = 1; index < storyboard.plans.length; index += 1) {
    const plan = storyboard.plans[index];
    if (plan.transition_in === undefined) continue;
    const previous = storyboard.plans[index - 1];
    if (areAdjacent(previous, plan, sceneOrder, maxShotOrdinals)) continue;
    diagnostics.push(diagnostic({
      code: 'storyboard.transition.non_adjacent',
      path: ['plans', index, 'transition_in'],
      actual: `${previous.shot_address.scene_id}/${previous.shot_address.shot_id} -> ${plan.shot_address.scene_id}/${plan.shot_address.shot_id}`,
      expected: 'same scene consecutive shot index or previous scene boundary',
      repair: 'order ShotPlans canonically or remove the transition from this non-adjacent shot',
      severity: 'error',
    }));
  }

  return diagnostics;
}

function sceneOrderMap(sceneMap: SceneMapArtifact): Map<string, number> {
  const sceneOrder = new Map<string, number>();
  for (let index = 0; index < sceneMap.detail.scenes.length; index += 1) {
    sceneOrder.set(sceneMap.detail.scenes[index].scene_id, index);
  }
  return sceneOrder;
}

function maxShotOrdinalByScene(plans: ShotPlan[]): Map<string, number> {
  const maxOrdinals = new Map<string, number>();
  for (const plan of plans) {
    const ordinal = shotOrdinal(plan.shot_address.shot_id);
    if (ordinal === undefined) continue;
    const sceneId = plan.shot_address.scene_id;
    const current = maxOrdinals.get(sceneId);
    if (current === undefined || ordinal > current) maxOrdinals.set(sceneId, ordinal);
  }
  return maxOrdinals;
}

function areAdjacent(
  previous: ShotPlan,
  current: ShotPlan,
  sceneOrder: Map<string, number>,
  maxShotOrdinals: Map<string, number>,
): boolean {
  const previousOrdinal = shotOrdinal(previous.shot_address.shot_id);
  const currentOrdinal = shotOrdinal(current.shot_address.shot_id);
  if (previousOrdinal === undefined || currentOrdinal === undefined) return false;

  if (previous.shot_address.scene_id === current.shot_address.scene_id) {
    return currentOrdinal === previousOrdinal + 1;
  }

  const previousSceneIndex = sceneOrder.get(previous.shot_address.scene_id);
  const currentSceneIndex = sceneOrder.get(current.shot_address.scene_id);
  if (previousSceneIndex === undefined || currentSceneIndex === undefined) return false;
  const previousSceneMaxOrdinal = maxShotOrdinals.get(previous.shot_address.scene_id);
  if (previousSceneMaxOrdinal === undefined) return false;
  if (currentSceneIndex !== previousSceneIndex + 1) return false;
  if (previousOrdinal !== previousSceneMaxOrdinal) return false;
  return currentOrdinal === 1;
}

function shotOrdinal(shotId: string): number | undefined {
  const match = /-(\d+)$/.exec(shotId);
  if (match === null) return undefined;
  return Number.parseInt(match[1], 10);
}

function validateMissingSpeakers(storyboard: Storyboard): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  storyboard.plans.forEach((plan, planIndex) => {
    if (plan.kind === 'title-card') return;
    if (plan.speakers.length > 0) return;
    diagnostics.push(diagnostic({
      code: 'storyboard.shot.missing_speaker',
      path: ['plans', planIndex, 'speakers'],
      actual: 0,
      expected: 'at least one speaker for non-title-card shots',
      repair: 'add a cast id to speakers or change the plan kind to title-card',
      severity: 'error',
    }));
  });
  return diagnostics;
}

function validateTakeoverComponents(storyboard: Storyboard, ctx: ValidateStoryboardContext): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const customRegistry = ctx.interactives;
  const knownRegistry = customRegistry === undefined
    ? knownRegistryForSlug(ctx.corpus.slug)
    : undefined;
  const complete = customRegistry === undefined
    ? knownRegistryComplete(knownRegistry)
    : Object.keys(customRegistry).length > 0;

  storyboard.plans.forEach((plan, planIndex) => {
    if (plan.kind !== 'interactive-takeover') return;
    if (hasComponent(plan.component_id, customRegistry, knownRegistry)) return;
    const severity = complete ? 'error' : 'warning';
    diagnostics.push(diagnostic({
      code: 'storyboard.takeover.unknown_component',
      path: ['plans', planIndex, 'component_id'],
      actual: plan.component_id,
      expected: `registered component id for lessons/${ctx.corpus.slug}`,
      repair: complete
        ? 'register the component or use a known interactive component id'
        : 'register the component before visual execution uses this storyboard',
      severity,
    }));
  });

  return diagnostics;
}

function knownRegistryComplete(registry: KnownComponentRegistry | undefined): boolean {
  if (registry === undefined) return false;
  return registry.complete;
}

function hasComponent(
  componentId: string,
  interactives: InteractivesRegistry | undefined,
  knownRegistry: KnownComponentRegistry | undefined,
): boolean {
  if (interactives !== undefined) {
    return getInteractive(interactives, componentId) !== undefined;
  }
  if (knownRegistry === undefined) return false;
  return knownRegistry.has(componentId);
}

function knownRegistryForSlug(slug: string): KnownComponentRegistry | undefined {
  for (const entry of KNOWN_INTERACTIVE_REGISTRIES) {
    if (entry.slug === slug) return entry.registry;
  }
  return undefined;
}

function validateOpeners(storyboard: Storyboard): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  storyboard.plans.forEach((plan, planIndex) => {
    if (plan.kind !== 'narrator-opener') return;
    if (plan.scene_title.trim().length > 0) return;
    diagnostics.push(diagnostic({
      code: 'storyboard.opener.missing_title',
      path: ['plans', planIndex, 'scene_title'],
      actual: plan.scene_title,
      expected: 'non-empty scene title',
      repair: 'copy the scene title from scene-map.detail.scenes[].title',
      severity: 'error',
    }));
  });
  return diagnostics;
}

function validateAudioSlots(storyboard: Storyboard): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  storyboard.plans.forEach((plan, planIndex) => {
    const seen = new Set<string>();
    plan.spoken_lines.forEach((line, lineIndex) => {
      if (!seen.has(line.audio_slot_id)) {
        seen.add(line.audio_slot_id);
        return;
      }
      diagnostics.push(diagnostic({
        code: 'storyboard.audio.duplicate_slot',
        path: ['plans', planIndex, 'spoken_lines', lineIndex, 'audio_slot_id'],
        actual: line.audio_slot_id,
        expected: 'unique audio_slot_id within the ShotPlan',
        repair: 'derive a distinct audio slot id for this spoken line',
        severity: 'error',
      }));
    });
  });
  return diagnostics;
}

function diagnostic(args: Diagnostic): Diagnostic {
  return DiagnosticSchema.parse(args);
}
