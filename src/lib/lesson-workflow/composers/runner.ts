import type { z } from 'zod';
import {
  addBackground,
  addCast,
  addCue,
  addElement,
  addScene,
  addShot,
  addTransition,
  newAssetManifest,
  newProduction,
  upsertSlot,
} from '@/lib/loa-commands';
import type { Diagnostic } from '@/lib/lesson-workflow/diagnostic-schema';
import { LatticeDiagnosticError, normalizeProduction } from '@/lib/lattice-normalize';
import type {
  AssetManifest,
  CastId,
  Cue,
  Element,
  Production,
  Scene,
  SceneId,
  Shot,
  ShotAddress,
  ShotId,
  Slot,
  SlotId,
  TransitionEdge,
} from '@/lib/lattice';
import { getInteractive } from '@/lib/interactives';
import { COMPOSERS } from './index';
import { backgroundSlots } from './helpers';
import { getComposer } from './registry';
import type {
  CharacterDemoBeatPlan,
  ComposerContext,
  ComposerDelta,
  ComposeProductionResult,
  ReadonlyAssetManifest,
  ShotPlan,
} from './types';

interface PendingTransition {
  edge: TransitionEdge;
  path: Array<string | number>;
}

interface DeclaredComponent {
  scene_id: SceneId;
  shot_id: ShotId;
  component_id: string;
}

interface ApplyState {
  production: Production;
  manifest: AssetManifest;
  diagnostics: Diagnostic[];
  pendingTransitions: PendingTransition[];
  declaredComponents: DeclaredComponent[];
  shotAddCounts: Map<string, number>;
}

interface SlotReference {
  slot_id: SlotId;
  path: Array<string | number>;
}

export function composeProduction(
  plans: ShotPlan[],
  ctx: ComposerContext,
): ComposeProductionResult {
  const diagnostics: Diagnostic[] = [];
  const deltas: ComposerDelta[] = [];

  for (let i = 0; i < plans.length; i += 1) {
    const plan = plans[i];
    const composer = getComposer(COMPOSERS, plan.kind);
    if (composer === undefined) {
      diagnostics.push({
        code: 'composer.kind.unknown',
        path: ['plans', i, 'kind'],
        actual: plan.kind,
        expected: 'registered ShotComposer kind',
        repair: 'register a composer for this ShotPlan kind or change the plan kind.',
        severity: 'error',
      });
      continue;
    }

    const parsed = composer.schema.safeParse(plan);
    if (!parsed.success) {
      diagnostics.push(...schemaDiagnostics(parsed.error, i, plan.kind));
      continue;
    }

    diagnostics.push(...validatePlanCastReferences(parsed.data, ctx, i));

    try {
      deltas.push(composer.compose(ctx, parsed.data));
    } catch (error) {
      diagnostics.push(composerThrownDiagnostic(error, i, plan.kind));
    }
  }

  let state = initialApplyState(ctx, diagnostics);
  for (let i = 0; i < deltas.length; i += 1) {
    state = applyDelta(state, deltas[i], i);
  }
  state = applyPendingTransitions(state);
  state = validateInvariants(state, ctx, plans);

  let production = state.production;
  try {
    production = normalizeProduction(production);
  } catch (error) {
    state.diagnostics.push(...diagnosticsFromError(error, ['transitions']));
  }

  return {
    production,
    manifest: state.manifest,
    diagnostics: state.diagnostics,
  };
}

function initialApplyState(
  ctx: ComposerContext,
  diagnostics: Diagnostic[],
): ApplyState {
  let production = newProduction({
    id: ctx.production_id,
    title: ctx.production_id,
    summary: 'Composer-generated production from ShotPlans.',
    tags: ['composer'],
    authors: ['Library of Alexandria Composer'],
  });
  for (const member of ctx.cast) {
    production = addCast(production, member);
  }
  return {
    production,
    manifest: newAssetManifest(ctx.production_id),
    diagnostics: [...diagnostics],
    pendingTransitions: [],
    declaredComponents: [],
    shotAddCounts: new Map(),
  };
}

function applyDelta(
  state: ApplyState,
  delta: ComposerDelta,
  deltaIndex: number,
): ApplyState {
  let production = state.production;
  let manifest = state.manifest;
  const diagnostics = state.diagnostics;

  if (delta.add_scenes !== undefined) {
    for (let i = 0; i < delta.add_scenes.length; i += 1) {
      const scene = delta.add_scenes[i];
      try {
        production = addScene(production, scene);
      } catch (error) {
        diagnostics.push(commandDiagnostic(error, ['deltas', deltaIndex, 'add_scenes', i]));
      }
    }
  }

  if (delta.add_shots !== undefined) {
    for (let i = 0; i < delta.add_shots.length; i += 1) {
      const entry = delta.add_shots[i];
      production = ensureScene(production, entry.scene_id);
      const key = addressKey({ scene_id: entry.scene_id, shot_id: entry.shot.id });
      const count = state.shotAddCounts.get(key);
      if (count !== undefined) {
        state.shotAddCounts.set(key, count + 1);
        diagnostics.push({
          code: 'composer.shot.duplicate',
          path: ['deltas', deltaIndex, 'add_shots', i, 'shot', 'id'],
          actual: { scene_id: entry.scene_id, shot_id: entry.shot.id },
          expected: 'one add_shots entry for each Shot address',
          repair: 'deduplicate ShotPlans or assign a unique shot_address.',
          severity: 'error',
        });
        continue;
      }
      state.shotAddCounts.set(key, 1);
      production = addShot(production, entry.scene_id, entry.shot);
    }
  }

  if (delta.add_elements !== undefined) {
    for (let i = 0; i < delta.add_elements.length; i += 1) {
      const entry = delta.add_elements[i];
      if (!hasShot(production, entry.scene_id, entry.shot_id)) {
        diagnostics.push(missingShotDiagnostic(
          ['deltas', deltaIndex, 'add_elements', i],
          entry.scene_id,
          entry.shot_id,
        ));
        continue;
      }
      try {
        production = addElement(production, entry.scene_id, entry.shot_id, entry.element);
      } catch (error) {
        diagnostics.push(commandDiagnostic(error, ['deltas', deltaIndex, 'add_elements', i]));
      }
    }
  }

  if (delta.add_cues !== undefined) {
    for (let i = 0; i < delta.add_cues.length; i += 1) {
      const entry = delta.add_cues[i];
      if (!hasShot(production, entry.scene_id, entry.shot_id)) {
        diagnostics.push(missingShotDiagnostic(
          ['deltas', deltaIndex, 'add_cues', i],
          entry.scene_id,
          entry.shot_id,
        ));
        continue;
      }
      production = addCue(production, entry.scene_id, entry.shot_id, entry.cue);
    }
  }

  if (delta.set_scene_background !== undefined) {
    for (let i = 0; i < delta.set_scene_background.length; i += 1) {
      const entry = delta.set_scene_background[i];
      production = ensureScene(production, entry.scene_id);
      try {
        production = addBackground(production, entry.scene_id, entry.background);
      } catch (error) {
        diagnostics.push(commandDiagnostic(error, ['deltas', deltaIndex, 'set_scene_background', i]));
      }
    }
  }

  if (delta.add_slots !== undefined) {
    for (let i = 0; i < delta.add_slots.length; i += 1) {
      manifest = upsertSlot(manifest, delta.add_slots[i]);
    }
  }

  if (delta.declared_components !== undefined) {
    for (let i = 0; i < delta.declared_components.length; i += 1) {
      state.declaredComponents.push(delta.declared_components[i]);
    }
  }

  if (delta.add_transitions !== undefined) {
    for (let i = 0; i < delta.add_transitions.length; i += 1) {
      state.pendingTransitions.push({
        edge: delta.add_transitions[i],
        path: ['deltas', deltaIndex, 'add_transitions', i],
      });
    }
  }

  return {
    ...state,
    production,
    manifest,
  };
}

function applyPendingTransitions(state: ApplyState): ApplyState {
  let production = state.production;
  const diagnostics = state.diagnostics;
  const timeline = productionTimeline(production);
  const indexByAddress = new Map<string, number>();
  for (let i = 0; i < timeline.length; i += 1) {
    indexByAddress.set(addressKey(timeline[i]), i);
  }

  for (const pending of state.pendingTransitions) {
    const stitched = stitchTransition(pending, timeline, indexByAddress, diagnostics);
    if (stitched === null) {
      continue;
    }
    try {
      production = addTransition(production, stitched);
    } catch (error) {
      diagnostics.push(...diagnosticsFromError(error, pending.path));
    }
  }

  return {
    ...state,
    production,
  };
}

function stitchTransition(
  pending: PendingTransition,
  timeline: ShotAddress[],
  indexByAddress: Map<string, number>,
  diagnostics: Diagnostic[],
): TransitionEdge | null {
  if (!sameAddress(pending.edge.from, pending.edge.to)) {
    return pending.edge;
  }
  const toIndex = indexByAddress.get(addressKey(pending.edge.to));
  if (toIndex === undefined) {
    diagnostics.push({
      code: 'composer.transition.to_missing',
      path: [...pending.path, 'to'],
      actual: pending.edge.to,
      expected: 'Shot address emitted by add_shots',
      repair: 'emit the target Shot before declaring transition_in.',
      severity: 'error',
    });
    return null;
  }
  if (toIndex === 0) {
    diagnostics.push({
      code: 'composer.transition.previous_missing',
      path: pending.path,
      actual: pending.edge.to,
      expected: 'a previous adjacent Shot for transition_in',
      repair: 'remove transition_in from the first Shot or add an earlier Shot.',
      severity: 'error',
    });
    return null;
  }
  const from = timeline[toIndex - 1];
  return {
    ...pending.edge,
    id: transitionEdgeId(from, pending.edge.to),
    from,
  };
}

function validateInvariants(
  state: ApplyState,
  ctx: ComposerContext,
  plans: ShotPlan[],
): ApplyState {
  const diagnostics = state.diagnostics;
  diagnostics.push(...validateProductionCastReferences(state.production, ctx));
  diagnostics.push(...validateActionCueContracts(state.production, ctx, state.declaredComponents));
  const slotValidation = validateSlotReferences(state.production, state.manifest, ctx.manifest_view);
  diagnostics.push(...slotValidation.diagnostics);
  diagnostics.push(...validateNoTakes(slotValidation.manifest));
  diagnostics.push(...validateShotCounts(plans, state.shotAddCounts));

  return {
    ...state,
    manifest: slotValidation.manifest,
  };
}

function validatePlanCastReferences(
  plan: ShotPlan,
  ctx: ComposerContext,
  planIndex: number,
): Diagnostic[] {
  const known = castIds(ctx);
  const diagnostics: Diagnostic[] = [];
  for (let i = 0; i < plan.speakers.length; i += 1) {
    pushMissingCastDiagnostic(diagnostics, known, plan.speakers[i], ['plans', planIndex, 'speakers', i]);
  }
  for (let i = 0; i < plan.spoken_lines.length; i += 1) {
    pushMissingCastDiagnostic(
      diagnostics,
      known,
      plan.spoken_lines[i].cast_id,
      ['plans', planIndex, 'spoken_lines', i, 'cast_id'],
    );
  }
  if (plan.kind === 'character-demo-beat') {
    diagnostics.push(...validateCharacterDemoPlanCasts(plan, known, planIndex));
  }
  return diagnostics;
}

function validateCharacterDemoPlanCasts(
  plan: CharacterDemoBeatPlan,
  known: Set<CastId>,
  planIndex: number,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (let i = 0; i < plan.characters_on_stage.length; i += 1) {
    pushMissingCastDiagnostic(
      diagnostics,
      known,
      plan.characters_on_stage[i].cast_id,
      ['plans', planIndex, 'characters_on_stage', i, 'cast_id'],
    );
  }
  for (let i = 0; i < plan.action_cues.length; i += 1) {
    pushMissingCastDiagnostic(
      diagnostics,
      known,
      plan.action_cues[i].cast_id,
      ['plans', planIndex, 'action_cues', i, 'cast_id'],
    );
  }
  return diagnostics;
}

function validateProductionCastReferences(
  production: Production,
  ctx: ComposerContext,
): Diagnostic[] {
  const known = castIds(ctx);
  const diagnostics: Diagnostic[] = [];
  for (let sceneIndex = 0; sceneIndex < production.scenes.length; sceneIndex += 1) {
    const scene = production.scenes[sceneIndex];
    for (let shotIndex = 0; shotIndex < scene.shots.length; shotIndex += 1) {
      const shot = scene.shots[shotIndex];
      if (shot.vo !== undefined) {
        pushMissingCastDiagnostic(
          diagnostics,
          known,
          shot.vo.cast_id,
          ['scenes', sceneIndex, 'shots', shotIndex, 'vo', 'cast_id'],
        );
      }
      if (shot.dialogue !== undefined) {
        for (let i = 0; i < shot.dialogue.length; i += 1) {
          pushMissingCastDiagnostic(
            diagnostics,
            known,
            shot.dialogue[i].cast_id,
            ['scenes', sceneIndex, 'shots', shotIndex, 'dialogue', i, 'cast_id'],
          );
        }
      }
      for (let elementIndex = 0; elementIndex < shot.elements.length; elementIndex += 1) {
        const element = shot.elements[elementIndex];
        if (element.kind === 'character' || element.kind === 'chroma-keyed-talent') {
          pushMissingCastDiagnostic(
            diagnostics,
            known,
            element.cast_id,
            ['scenes', sceneIndex, 'shots', shotIndex, 'elements', elementIndex, 'cast_id'],
          );
        }
      }
    }
  }
  return diagnostics;
}

function validateActionCueContracts(
  production: Production,
  ctx: ComposerContext,
  declaredComponents: DeclaredComponent[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const componentByTarget = actionTargetComponents(production, declaredComponents);
  for (let sceneIndex = 0; sceneIndex < production.scenes.length; sceneIndex += 1) {
    const scene = production.scenes[sceneIndex];
    for (let shotIndex = 0; shotIndex < scene.shots.length; shotIndex += 1) {
      const shot = scene.shots[shotIndex];
      const cues = shot.cues;
      if (cues === undefined) {
        continue;
      }
      for (let cueIndex = 0; cueIndex < cues.length; cueIndex += 1) {
        const cue = cues[cueIndex];
        if (cue.kind !== 'action') {
          continue;
        }
        const path = ['scenes', sceneIndex, 'shots', shotIndex, 'cues', cueIndex, 'method'];
        const componentId = componentByTarget.get(componentTargetKey(scene.id, shot.id, cue.element_id));
        if (componentId === undefined) {
          diagnostics.push({
            code: 'composer.action.target_missing',
            path,
            actual: cue.element_id,
            expected: 'interactive-group Element id or declared component id',
            repair: 'declare the component in the composer delta or target an interactive-group Element.',
            severity: 'error',
          });
          continue;
        }
        const entry = getInteractive(ctx.interactives, componentId);
        if (entry === undefined) {
          diagnostics.push({
            code: 'interactive.component.unregistered',
            path,
            actual: componentId,
            expected: 'component_id registered in InteractivesRegistry',
            repair: `register interactive component "${componentId}".`,
            severity: 'error',
          });
          continue;
        }
        const validMethods = Object.keys(entry.contract.methods);
        if (entry.contract.methods[cue.method] !== undefined) {
          continue;
        }
        diagnostics.push({
          code: 'interactive.action.unknown_method',
          path,
          actual: {
            component_id: componentId,
            method: cue.method,
          },
          expected: validMethods,
          repair: `use one of ${validMethods.join(', ')} on "${componentId}".`,
          severity: 'error',
        });
      }
    }
  }
  return diagnostics;
}

function validateSlotReferences(
  production: Production,
  manifest: AssetManifest,
  manifestView: ReadonlyAssetManifest,
): { manifest: AssetManifest; diagnostics: Diagnostic[] } {
  let nextManifest = manifest;
  const diagnostics: Diagnostic[] = [];
  const refs = slotReferences(production);
  for (const ref of refs) {
    if (nextManifest.slots[ref.slot_id] !== undefined) {
      continue;
    }
    const viewedSlot = manifestView.slots[ref.slot_id];
    if (viewedSlot !== undefined) {
      nextManifest = upsertSlot(nextManifest, slotWithoutTakes(viewedSlot));
      continue;
    }
    diagnostics.push({
      code: 'composer.slot.missing',
      path: ref.path,
      actual: ref.slot_id,
      expected: 'Slot declared in AssetManifest.slots',
      repair: `declare Slot "${ref.slot_id}" in the composer delta or manifest view.`,
      severity: 'error',
    });
  }
  return {
    manifest: nextManifest,
    diagnostics,
  };
}

function validateNoTakes(manifest: AssetManifest): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const slotIds = Object.keys(manifest.slots);
  for (const slotId of slotIds) {
    const slot = manifest.slots[slotId];
    if (slot.takes.length === 0) {
      continue;
    }
    diagnostics.push({
      code: 'composer.manifest.takes_attached',
      path: ['manifest', 'slots', slotId, 'takes'],
      actual: slot.takes.length,
      expected: 0,
      repair: 'composers declare Slots only; attach Takes in the hydration step.',
      severity: 'error',
    });
  }
  return diagnostics;
}

function validateShotCounts(
  plans: ShotPlan[],
  shotAddCounts: Map<string, number>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const expected = new Map<string, number>();
  for (let i = 0; i < plans.length; i += 1) {
    const key = addressKey(plans[i].shot_address);
    const count = expected.get(key);
    expected.set(key, count === undefined ? 1 : count + 1);
  }
  for (const entry of expected) {
    const key = entry[0];
    const expectedCount = entry[1];
    const actualCount = shotAddCounts.get(key);
    if (actualCount === expectedCount && actualCount === 1) {
      continue;
    }
    diagnostics.push({
      code: 'composer.shot.count',
      path: ['plans'],
      actual: {
        address: key,
        add_shots: actualCount === undefined ? 0 : actualCount,
      },
      expected: 1,
      repair: 'ensure each ShotPlan emits exactly one unique Shot address.',
      severity: 'error',
    });
  }
  return diagnostics;
}

function slotReferences(production: Production): SlotReference[] {
  const refs: SlotReference[] = [];
  for (let sceneIndex = 0; sceneIndex < production.scenes.length; sceneIndex += 1) {
    const scene = production.scenes[sceneIndex];
    if (scene.background !== undefined) {
      const slots = backgroundSlots(scene.background);
      for (let i = 0; i < slots.length; i += 1) {
        refs.push({
          slot_id: slots[i],
          path: ['scenes', sceneIndex, 'background'],
        });
      }
    }
    for (let shotIndex = 0; shotIndex < scene.shots.length; shotIndex += 1) {
      refs.push(...slotReferencesForShot(scene.shots[shotIndex], ['scenes', sceneIndex, 'shots', shotIndex]));
    }
  }
  return refs;
}

function slotReferencesForShot(shot: Shot, path: Array<string | number>): SlotReference[] {
  const refs: SlotReference[] = [];
  if (shot.vo !== undefined) {
    refs.push({
      slot_id: shot.vo.audio.slot_id,
      path: [...path, 'vo', 'audio', 'slot_id'],
    });
  }
  if (shot.dialogue !== undefined) {
    for (let i = 0; i < shot.dialogue.length; i += 1) {
      refs.push({
        slot_id: shot.dialogue[i].audio.slot_id,
        path: [...path, 'dialogue', i, 'audio', 'slot_id'],
      });
    }
  }
  if (shot.music !== undefined) {
    refs.push({
      slot_id: shot.music.source.slot_id,
      path: [...path, 'music', 'source', 'slot_id'],
    });
  }
  if (shot.sfx !== undefined) {
    for (let i = 0; i < shot.sfx.length; i += 1) {
      refs.push({
        slot_id: shot.sfx[i].source.slot_id,
        path: [...path, 'sfx', i, 'source', 'slot_id'],
      });
    }
  }
  for (let elementIndex = 0; elementIndex < shot.elements.length; elementIndex += 1) {
    refs.push(...slotReferencesForElement(
      shot.elements[elementIndex],
      [...path, 'elements', elementIndex],
    ));
  }
  const cues = shot.cues;
  if (cues === undefined) {
    return refs;
  }
  for (let cueIndex = 0; cueIndex < cues.length; cueIndex += 1) {
    const cue = cues[cueIndex];
    if (cue.kind === 'spawn') {
      refs.push(...slotReferencesForElement(cue.element, [...path, 'cues', cueIndex, 'element']));
    }
  }
  return refs;
}

function slotReferencesForElement(
  element: Element,
  path: Array<string | number>,
): SlotReference[] {
  switch (element.kind) {
    case 'image-plane':
    case 'sprite':
    case 'model-3d':
      return [{
        slot_id: element.source.slot_id,
        path: [...path, 'source', 'slot_id'],
      }];
    case 'video-plane': {
      const refs: SlotReference[] = [{
        slot_id: element.source.slot_id,
        path: [...path, 'source', 'slot_id'],
      }];
      if (element.mask !== undefined) {
        refs.push({
          slot_id: element.mask.slot_id,
          path: [...path, 'mask', 'slot_id'],
        });
      }
      return refs;
    }
    case 'interactive-group':
      if (element.mastery_slot === undefined) {
        return [];
      }
      return [{
        slot_id: element.mastery_slot.slot_id,
        path: [...path, 'mastery_slot', 'slot_id'],
      }];
    case 'text-overlay':
    case 'math':
    case 'character':
    case 'chroma-keyed-talent':
    case 'shape':
      return [];
  }
}

function actionTargetComponents(
  production: Production,
  declaredComponents: DeclaredComponent[],
): Map<string, string> {
  const components = new Map<string, string>();
  for (let sceneIndex = 0; sceneIndex < production.scenes.length; sceneIndex += 1) {
    const scene = production.scenes[sceneIndex];
    for (let shotIndex = 0; shotIndex < scene.shots.length; shotIndex += 1) {
      const shot = scene.shots[shotIndex];
      for (const element of shot.elements) {
        if (element.kind === 'interactive-group') {
          components.set(componentTargetKey(scene.id, shot.id, element.id), element.component_id);
        }
      }
    }
  }
  for (const declared of declaredComponents) {
    components.set(
      componentTargetKey(declared.scene_id, declared.shot_id, declared.component_id),
      declared.component_id,
    );
  }
  return components;
}

function productionTimeline(production: Production): ShotAddress[] {
  const timeline: ShotAddress[] = [];
  for (const scene of production.scenes) {
    for (const shot of scene.shots) {
      timeline.push({ scene_id: scene.id, shot_id: shot.id });
    }
  }
  return timeline;
}

function ensureScene(production: Production, sceneId: SceneId): Production {
  if (production.scenes.find((scene) => scene.id === sceneId) !== undefined) {
    return production;
  }
  return addScene(production, defaultScene(sceneId));
}

function defaultScene(sceneId: SceneId): Scene {
  return {
    id: sceneId,
    title: sceneId,
    summary: `Composer-created scene ${sceneId}.`,
    shots: [],
  };
}

function hasShot(production: Production, sceneId: SceneId, shotId: ShotId): boolean {
  const scene = production.scenes.find((candidate) => candidate.id === sceneId);
  if (scene === undefined) {
    return false;
  }
  return scene.shots.find((shot) => shot.id === shotId) !== undefined;
}

function castIds(ctx: ComposerContext): Set<CastId> {
  const ids = new Set<CastId>();
  for (const member of ctx.cast) {
    ids.add(member.id);
  }
  return ids;
}

function pushMissingCastDiagnostic(
  diagnostics: Diagnostic[],
  known: Set<CastId>,
  castId: CastId,
  path: Array<string | number>,
): void {
  if (known.has(castId)) {
    return;
  }
  diagnostics.push({
    code: 'composer.cast.missing',
    path,
    actual: castId,
    expected: 'CastMember declared in ComposerContext.cast',
    repair: `add CastMember "${castId}" to the composer context or update the plan.`,
    severity: 'error',
  });
}

function schemaDiagnostics(
  error: z.ZodError,
  planIndex: number,
  kind: string,
): Diagnostic[] {
  return error.issues.map((issue) => ({
    code: 'composer.plan.schema',
    path: ['plans', planIndex, ...issue.path],
    actual: issue.message,
    expected: `${kind} schema field satisfying ${issue.code}`,
    repair: 'fix the ShotPlan payload before composing.',
    severity: 'error',
  }));
}

function composerThrownDiagnostic(
  error: unknown,
  planIndex: number,
  kind: string,
): Diagnostic {
  return {
    code: 'composer.compose.threw',
    path: ['plans', planIndex],
    actual: errorMessage(error),
    expected: `${kind} composer returns ComposerDelta`,
    repair: 'fix the composer implementation or invalid plan payload.',
    severity: 'error',
  };
}

function commandDiagnostic(
  error: unknown,
  path: Array<string | number>,
): Diagnostic {
  return {
    code: 'composer.delta.apply_failed',
    path,
    actual: errorMessage(error),
    expected: 'delta command applies cleanly',
    repair: 'fix the emitted ComposerDelta field.',
    severity: 'error',
  };
}

function diagnosticsFromError(
  error: unknown,
  path: Array<string | number>,
): Diagnostic[] {
  if (error instanceof LatticeDiagnosticError) {
    return error.diagnostics;
  }
  return [commandDiagnostic(error, path)];
}

function missingShotDiagnostic(
  path: Array<string | number>,
  sceneId: SceneId,
  shotId: ShotId,
): Diagnostic {
  return {
    code: 'composer.shot.missing',
    path,
    actual: { scene_id: sceneId, shot_id: shotId },
    expected: 'Shot emitted by add_shots before dependent delta fields',
    repair: 'emit the Shot in add_shots or fix the dependent scene_id/shot_id.',
    severity: 'error',
  };
}

function slotWithoutTakes(slot: Slot): Slot {
  return {
    ...slot,
    takes: [],
  };
}

function componentTargetKey(sceneId: SceneId, shotId: ShotId, elementId: string): string {
  return `${sceneId}/${shotId}/${elementId}`;
}

function addressKey(address: ShotAddress): string {
  return `${address.scene_id}/${address.shot_id}`;
}

function sameAddress(a: ShotAddress, b: ShotAddress): boolean {
  return a.scene_id === b.scene_id && a.shot_id === b.shot_id;
}

function transitionEdgeId(from: ShotAddress, to: ShotAddress): string {
  return `transition.${from.scene_id}.${from.shot_id}.to.${to.scene_id}.${to.shot_id}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
