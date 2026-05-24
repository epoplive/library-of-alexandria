import { DiagnosticSchema, type Diagnostic } from '../diagnostic-schema';
import type { ContentMap } from '../project-schema';
import type {
  AssetManifest,
  Cue,
  Element,
  InteractiveGroupElement,
  Production,
  Scene,
  Shot,
  ShotAddress,
  SlotRef,
} from '@/lib/lattice';
import {
  type ConsistencyReport,
  ConsistencyReportSchema,
  type InteractiveRegistrySummary,
} from './types';

interface SlotReference {
  slot_id: string;
  path: Array<string | number>;
}

interface TimelineEntry {
  address: ShotAddress;
  sceneIndex: number;
  shotIndex: number;
  shot: Shot;
}

interface CueWrite {
  element_id: string;
  target_field: string;
  start: number;
  end: number;
  additive: boolean;
  path: Array<string | number>;
}

export interface BuildConsistencyReportArgs {
  lessonSlug: string;
  production: Production;
  manifest: AssetManifest;
  contentMap: ContentMap;
  interactives: InteractiveRegistrySummary;
}

export function buildConsistencyReport(args: BuildConsistencyReportArgs): ConsistencyReport {
  const timeline = canonicalTimeline(args.production);
  const gates = {
    cast_unknown: castUnknownDiagnostics(args.production),
    slot_unknown: slotUnknownDiagnostics(args.production, args.manifest),
    shot_silent: shotSilentDiagnostics(args.contentMap, timeline),
    action_method_unknown: actionMethodDiagnostics(args.production, args.interactives),
    interactive_unregistered: interactiveDiagnostics(args.production, args.interactives),
    transition_non_adjacent: transitionDiagnostics(args.production, timeline),
    field_overlap: fieldOverlapDiagnostics(args.production),
    map_completeness: mapCompletenessDiagnostics(args.contentMap),
  };
  const diagnostics = [
    ...gates.cast_unknown,
    ...gates.slot_unknown,
    ...gates.shot_silent,
    ...gates.action_method_unknown,
    ...gates.interactive_unregistered,
    ...gates.transition_non_adjacent,
    ...gates.field_overlap,
    ...gates.map_completeness,
  ];
  const hasError = diagnostics.some((entry) => entry.severity === 'error');
  return ConsistencyReportSchema.parse({
    schema_version: 'loa.consistency-report.v1',
    lesson_slug: args.lessonSlug,
    gates,
    overall_status: hasError ? 'fail' : 'pass',
  });
}

function castUnknownDiagnostics(production: Production): Diagnostic[] {
  const known = new Set(production.characters.map((character) => character.id));
  const diagnostics: Diagnostic[] = [];
  for (let sceneIndex = 0; sceneIndex < production.scenes.length; sceneIndex += 1) {
    const scene = production.scenes[sceneIndex];
    for (let shotIndex = 0; shotIndex < scene.shots.length; shotIndex += 1) {
      const shot = scene.shots[shotIndex];
      if (shot.vo !== undefined && !known.has(shot.vo.cast_id)) {
        diagnostics.push(diagnostic({
          code: 'consistency.cast.unknown',
          path: ['production', 'scenes', sceneIndex, 'shots', shotIndex, 'vo', 'cast_id'],
          actual: shot.vo.cast_id,
          expected: 'cast_id present in Production.characters',
          repair: 'add the cast member to Production.characters or update the VO cast_id',
          severity: 'error',
        }));
      }
      if (shot.dialogue === undefined) continue;
      for (let dialogueIndex = 0; dialogueIndex < shot.dialogue.length; dialogueIndex += 1) {
        const dialogue = shot.dialogue[dialogueIndex];
        if (known.has(dialogue.cast_id)) continue;
        diagnostics.push(diagnostic({
          code: 'consistency.cast.unknown',
          path: ['production', 'scenes', sceneIndex, 'shots', shotIndex, 'dialogue', dialogueIndex, 'cast_id'],
          actual: dialogue.cast_id,
          expected: 'cast_id present in Production.characters',
          repair: 'add the cast member to Production.characters or update the dialogue cast_id',
          severity: 'error',
        }));
      }
    }
  }
  return diagnostics;
}

function slotUnknownDiagnostics(production: Production, manifest: AssetManifest): Diagnostic[] {
  const references = slotReferences(production);
  const diagnostics: Diagnostic[] = [];
  for (const reference of references) {
    const slot = manifest.slots[reference.slot_id];
    if (slot !== undefined) continue;
    diagnostics.push(diagnostic({
      code: 'consistency.slot.unknown',
      path: reference.path,
      actual: reference.slot_id,
      expected: 'slot_id present in AssetManifest.slots',
      repair: 'add the slot to the AssetManifest or update the Production slot reference',
      severity: 'error',
    }));
  }
  return diagnostics;
}

function shotSilentDiagnostics(contentMap: ContentMap, timeline: TimelineEntry[]): Diagnostic[] {
  const kindByAddress = shotKindByAddress(contentMap);
  const diagnostics: Diagnostic[] = [];
  for (const entry of timeline) {
    const shot = entry.shot;
    const hasVo = shot.vo !== undefined;
    const dialogueCount = shot.dialogue === undefined ? 0 : shot.dialogue.length;
    if (hasVo || dialogueCount > 0) continue;
    const kind = kindByAddress.get(addressKey(entry.address));
    if (kind === 'title-card') continue;
    diagnostics.push(diagnostic({
      code: 'consistency.shot.silent',
      path: ['production', 'scenes', entry.sceneIndex, 'shots', entry.shotIndex],
      actual: 'no VO or dialogue',
      expected: 'VO, dialogue, or title-card kind',
      repair: 'add spoken audio or mark the mapped shot as title-card',
      severity: 'warning',
    }));
  }
  return diagnostics;
}

function actionMethodDiagnostics(
  production: Production,
  interactives: InteractiveRegistrySummary,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (let sceneIndex = 0; sceneIndex < production.scenes.length; sceneIndex += 1) {
    const scene = production.scenes[sceneIndex];
    for (let shotIndex = 0; shotIndex < scene.shots.length; shotIndex += 1) {
      const shot = scene.shots[shotIndex];
      if (shot.cues === undefined) continue;
      const interactiveById = interactiveElementsById(shot.elements);
      for (let cueIndex = 0; cueIndex < shot.cues.length; cueIndex += 1) {
        const cue = shot.cues[cueIndex];
        if (cue.kind !== 'action') continue;
        const target = interactiveById.get(cue.element_id);
        if (target === undefined) {
          diagnostics.push(diagnostic({
            code: 'consistency.action.method_unknown',
            path: ['production', 'scenes', sceneIndex, 'shots', shotIndex, 'cues', cueIndex, 'method'],
            actual: cue.method,
            expected: 'action cue element_id targets an interactive-group with a registered method',
            repair: 'point the action cue at an interactive element or remove the action cue',
            severity: 'error',
          }));
          continue;
        }
        if (methodExists(interactives, target.component_id, cue.method)) continue;
        diagnostics.push(diagnostic({
          code: 'consistency.action.method_unknown',
          path: ['production', 'scenes', sceneIndex, 'shots', shotIndex, 'cues', cueIndex, 'method'],
          actual: {
            component_id: target.component_id,
            method: cue.method,
          },
          expected: 'method name declared by the referenced InteractiveContract',
          repair: 'add the method to the InteractiveContract or update the action cue method',
          severity: 'error',
        }));
      }
    }
  }
  return diagnostics;
}

function interactiveDiagnostics(
  production: Production,
  interactives: InteractiveRegistrySummary,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (let sceneIndex = 0; sceneIndex < production.scenes.length; sceneIndex += 1) {
    const scene = production.scenes[sceneIndex];
    for (let shotIndex = 0; shotIndex < scene.shots.length; shotIndex += 1) {
      const shot = scene.shots[shotIndex];
      for (let elementIndex = 0; elementIndex < shot.elements.length; elementIndex += 1) {
        const element = shot.elements[elementIndex];
        if (element.kind !== 'interactive-group') continue;
        if (componentRegistered(interactives, element.component_id)) continue;
        diagnostics.push(diagnostic({
          code: 'consistency.interactive.unregistered',
          path: ['production', 'scenes', sceneIndex, 'shots', shotIndex, 'elements', elementIndex, 'component_id'],
          actual: element.component_id,
          expected: 'component_id registered in INTERACTIVES_REGISTRY',
          repair: 'register this component in INTERACTIVES_REGISTRY',
          severity: interactives.complete ? 'error' : 'warning',
        }));
      }
    }
  }
  return diagnostics;
}

function transitionDiagnostics(production: Production, timeline: TimelineEntry[]): Diagnostic[] {
  const nextByAddress = new Map<string, ShotAddress>();
  for (let index = 0; index < timeline.length - 1; index += 1) {
    nextByAddress.set(addressKey(timeline[index].address), timeline[index + 1].address);
  }
  const diagnostics: Diagnostic[] = [];
  for (let transitionIndex = 0; transitionIndex < production.transitions.length; transitionIndex += 1) {
    const transition = production.transitions[transitionIndex];
    const expectedTo = nextByAddress.get(addressKey(transition.from));
    if (expectedTo !== undefined && sameAddress(expectedTo, transition.to)) continue;
    diagnostics.push(diagnostic({
      code: 'consistency.transition.non_adjacent',
      path: ['production', 'transitions', transitionIndex],
      actual: {
        from: addressKey(transition.from),
        to: addressKey(transition.to),
      },
      expected: 'transition connects adjacent shots in canonical timeline order',
      repair: 'connect this transition to the next canonical shot or remove it',
      severity: 'error',
    }));
  }
  return diagnostics;
}

function fieldOverlapDiagnostics(production: Production): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (let sceneIndex = 0; sceneIndex < production.scenes.length; sceneIndex += 1) {
    const scene = production.scenes[sceneIndex];
    for (let shotIndex = 0; shotIndex < scene.shots.length; shotIndex += 1) {
      const shot = scene.shots[shotIndex];
      const writes = cueWrites(shot, ['production', 'scenes', sceneIndex, 'shots', shotIndex, 'cues']);
      diagnostics.push(...overlapDiagnosticsForWrites(writes));
    }
  }
  return diagnostics;
}

function mapCompletenessDiagnostics(contentMap: ContentMap): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (let actIndex = 0; actIndex < contentMap.acts.length; actIndex += 1) {
    const act = contentMap.acts[actIndex];
    for (let sceneIndex = 0; sceneIndex < act.scenes.length; sceneIndex += 1) {
      const scene = act.scenes[sceneIndex];
      if (scene.shots.length > 0) continue;
      diagnostics.push(diagnostic({
        code: 'consistency.map.scene_empty',
        path: ['content_map', 'acts', actIndex, 'scenes', sceneIndex, 'shots'],
        actual: 0,
        expected: 'at least one shot in every ContentMap scene',
        repair: 'rerun storyboard so the scene-map content_map receives shot tier entries',
        severity: 'error',
      }));
    }
  }
  return diagnostics;
}

function slotReferences(production: Production): SlotReference[] {
  const references: SlotReference[] = [];
  for (let characterIndex = 0; characterIndex < production.characters.length; characterIndex += 1) {
    const character = production.characters[characterIndex];
    if (character.identity_ref !== undefined) {
      addSlotRef(references, character.identity_ref, ['production', 'characters', characterIndex, 'identity_ref', 'slot_id']);
    }
    if (character.pose_slots !== undefined) {
      const poseNames = Object.keys(character.pose_slots).sort();
      for (const poseName of poseNames) {
        references.push({
          slot_id: character.pose_slots[poseName],
          path: ['production', 'characters', characterIndex, 'pose_slots', poseName],
        });
      }
    }
  }

  for (let sceneIndex = 0; sceneIndex < production.scenes.length; sceneIndex += 1) {
    const scene = production.scenes[sceneIndex];
    addSceneBackgroundSlots(references, scene, ['production', 'scenes', sceneIndex, 'background']);
    for (let shotIndex = 0; shotIndex < scene.shots.length; shotIndex += 1) {
      const shot = scene.shots[shotIndex];
      addShotSlots(references, shot, ['production', 'scenes', sceneIndex, 'shots', shotIndex]);
    }
  }
  return references;
}

function addShotSlots(references: SlotReference[], shot: Shot, pathBase: Array<string | number>): void {
  if (shot.vo !== undefined) {
    addSlotRef(references, shot.vo.audio, [...pathBase, 'vo', 'audio', 'slot_id']);
  }
  if (shot.dialogue !== undefined) {
    for (let dialogueIndex = 0; dialogueIndex < shot.dialogue.length; dialogueIndex += 1) {
      addSlotRef(references, shot.dialogue[dialogueIndex].audio, [
        ...pathBase,
        'dialogue',
        dialogueIndex,
        'audio',
        'slot_id',
      ]);
    }
  }
  if (shot.music !== undefined) {
    addSlotRef(references, shot.music.source, [...pathBase, 'music', 'source', 'slot_id']);
  }
  if (shot.sfx !== undefined) {
    for (let sfxIndex = 0; sfxIndex < shot.sfx.length; sfxIndex += 1) {
      addSlotRef(references, shot.sfx[sfxIndex].source, [...pathBase, 'sfx', sfxIndex, 'source', 'slot_id']);
    }
  }
  for (let elementIndex = 0; elementIndex < shot.elements.length; elementIndex += 1) {
    addElementSlots(references, shot.elements[elementIndex], [...pathBase, 'elements', elementIndex]);
  }
  if (shot.cues === undefined) return;
  for (let cueIndex = 0; cueIndex < shot.cues.length; cueIndex += 1) {
    const cue = shot.cues[cueIndex];
    if (cue.kind !== 'spawn') continue;
    addElementSlots(references, cue.element, [...pathBase, 'cues', cueIndex, 'element']);
  }
}

function addElementSlots(references: SlotReference[], element: Element, pathBase: Array<string | number>): void {
  if (element.kind === 'image-plane') {
    addSlotRef(references, element.source, [...pathBase, 'source', 'slot_id']);
    return;
  }
  if (element.kind === 'video-plane') {
    addSlotRef(references, element.source, [...pathBase, 'source', 'slot_id']);
    if (element.mask !== undefined) {
      addSlotRef(references, element.mask, [...pathBase, 'mask', 'slot_id']);
    }
    return;
  }
  if (element.kind === 'sprite') {
    addSlotRef(references, element.source, [...pathBase, 'source', 'slot_id']);
    return;
  }
  if (element.kind === 'model-3d') {
    addSlotRef(references, element.source, [...pathBase, 'source', 'slot_id']);
    return;
  }
  if (element.kind !== 'interactive-group') return;
  if (element.mastery_slot === undefined) return;
  addSlotRef(references, element.mastery_slot, [...pathBase, 'mastery_slot', 'slot_id']);
}

function addSceneBackgroundSlots(
  references: SlotReference[],
  scene: Scene,
  pathBase: Array<string | number>,
): void {
  if (scene.background === undefined) return;
  if (scene.background.kind === 'image-pan') {
    references.push({
      slot_id: scene.background.slot_id,
      path: [...pathBase, 'slot_id'],
    });
    return;
  }
  if (scene.background.kind !== 'parallax') return;
  for (let layerIndex = 0; layerIndex < scene.background.layers.length; layerIndex += 1) {
    references.push({
      slot_id: scene.background.layers[layerIndex].slot_id,
      path: [...pathBase, 'layers', layerIndex, 'slot_id'],
    });
  }
}

function addSlotRef(references: SlotReference[], slotRef: SlotRef, path: Array<string | number>): void {
  references.push({
    slot_id: slotRef.slot_id,
    path,
  });
}

function cueWrites(shot: Shot, cuePathBase: Array<string | number>): CueWrite[] {
  const writes: CueWrite[] = [];
  if (shot.cues === undefined) return writes;
  for (let cueIndex = 0; cueIndex < shot.cues.length; cueIndex += 1) {
    const cue = shot.cues[cueIndex];
    const path = [...cuePathBase, cueIndex];
    for (const field of targetFieldsForCue(cue)) {
      writes.push({
        element_id: field.element_id,
        target_field: field.target_field,
        start: cueStart(cue),
        end: cueEnd(cue),
        additive: cue.composition === 'additive',
        path,
      });
    }
  }
  return writes;
}

function targetFieldsForCue(cue: Cue): Array<{ element_id: string; target_field: string }> {
  if (cue.kind === 'transform') {
    return Object.keys(cue.layout).sort().map((key) => ({
      element_id: cue.element_id,
      target_field: `layout.${key}`,
    }));
  }
  if (cue.kind === 'visibility') {
    return [{ element_id: cue.element_id, target_field: 'visible' }];
  }
  if (cue.kind === 'mask') {
    return [{ element_id: cue.element_id, target_field: 'mask' }];
  }
  if (cue.kind === 'material') {
    return Object.keys(cue.params).sort().map((key) => ({
      element_id: cue.element_id,
      target_field: `material.${key}`,
    }));
  }
  if (cue.kind === 'shader-uniform') {
    return Object.keys(cue.uniforms).sort().map((key) => ({
      element_id: cue.element_id,
      target_field: `shader.${key}`,
    }));
  }
  return [];
}

function cueStart(cue: Cue): number {
  if (cue.at === undefined) return 0;
  return cue.at;
}

function cueEnd(cue: Cue): number {
  const start = cueStart(cue);
  if (cue.kind !== 'transform' && cue.kind !== 'visibility' && cue.kind !== 'mask' && cue.kind !== 'material' && cue.kind !== 'shader-uniform') {
    return start;
  }
  if (cue.transition === undefined) return start;
  if (cue.transition.duration_ms === undefined) return start;
  return start + cue.transition.duration_ms / 1000;
}

function overlapDiagnosticsForWrites(writes: CueWrite[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const priorWrites: CueWrite[] = [];
  for (const write of writes) {
    for (const prior of priorWrites) {
      if (prior.element_id !== write.element_id) continue;
      if (prior.target_field !== write.target_field) continue;
      if (prior.additive || write.additive) continue;
      if (!intervalsOverlap(prior, write)) continue;
      diagnostics.push(diagnostic({
        code: 'consistency.cue.field_overlap',
        path: write.path,
        actual: {
          element_id: write.element_id,
          target_field: write.target_field,
          start: write.start,
          end: write.end,
        },
        expected: 'non-overlapping cue writes unless composition is additive',
        repair: 'stagger these cues or mark the overlapping write composition as additive',
        severity: 'error',
      }));
    }
    priorWrites.push(write);
  }
  return diagnostics;
}

function intervalsOverlap(left: CueWrite, right: CueWrite): boolean {
  if (left.end <= left.start) return false;
  if (right.end <= right.start) return false;
  return left.start < right.end && right.start < left.end;
}

function canonicalTimeline(production: Production): TimelineEntry[] {
  const timeline: TimelineEntry[] = [];
  for (let sceneIndex = 0; sceneIndex < production.scenes.length; sceneIndex += 1) {
    const scene = production.scenes[sceneIndex];
    for (let shotIndex = 0; shotIndex < scene.shots.length; shotIndex += 1) {
      const shot = scene.shots[shotIndex];
      timeline.push({
        address: {
          scene_id: scene.id,
          shot_id: shot.id,
        },
        sceneIndex,
        shotIndex,
        shot,
      });
    }
  }
  return timeline;
}

function shotKindByAddress(contentMap: ContentMap): Map<string, string> {
  const kinds = new Map<string, string>();
  for (const act of contentMap.acts) {
    for (const scene of act.scenes) {
      for (const shot of scene.shots) {
        kinds.set(addressKey({ scene_id: scene.id, shot_id: shot.id }), shot.kind);
      }
    }
  }
  return kinds;
}

function interactiveElementsById(elements: Element[]): Map<string, InteractiveGroupElement> {
  const byId = new Map<string, InteractiveGroupElement>();
  for (const element of elements) {
    if (element.kind !== 'interactive-group') continue;
    byId.set(element.id, element);
  }
  return byId;
}

function componentRegistered(interactives: InteractiveRegistrySummary, componentId: string): boolean {
  if (interactives.size === 0) return false;
  return interactives.component_ids.includes(componentId);
}

function methodExists(interactives: InteractiveRegistrySummary, componentId: string, method: string): boolean {
  for (const contract of interactives.contracts) {
    if (contract.component_id !== componentId) continue;
    return contract.methods.includes(method);
  }
  return false;
}

function sameAddress(left: ShotAddress, right: ShotAddress): boolean {
  return left.scene_id === right.scene_id && left.shot_id === right.shot_id;
}

function addressKey(address: ShotAddress): string {
  return `${address.scene_id}/${address.shot_id}`;
}

function diagnostic(args: Diagnostic): Diagnostic {
  return DiagnosticSchema.parse(args);
}
