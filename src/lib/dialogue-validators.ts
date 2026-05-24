import type {
  AssetManifest,
  CharacterElement,
  ChromaKeyedTalentElement,
  PoseName,
  Production,
  Shot,
  Slot,
  Take,
  Tier,
} from './lattice';
import type { Diagnostic } from './lesson-workflow/diagnostic-schema';

type CharacterPoseElement = CharacterElement | ChromaKeyedTalentElement;

export function validateShotDialogue(
  shot: Shot,
  manifest: AssetManifest,
  options: { tier: Tier },
): Diagnostic[] {
  const dialogue = shot.dialogue;
  if (dialogue === undefined) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];
  for (let i = 0; i < dialogue.length; i += 1) {
    const segment = dialogue[i];
    const slot = manifest.slots[segment.audio.slot_id];
    if (slot === undefined) {
      diagnostics.push({
        code: 'dialogue.audio.slot_missing',
        path: ['dialogue', i, 'audio', 'slot_id'],
        actual: segment.audio.slot_id,
        expected: 'Slot declared in AssetManifest.slots',
        repair: `declare audio-dialogue Slot "${segment.audio.slot_id}".`,
        severity: 'error',
      });
      continue;
    }

    const hasV01 = slot.takes.some((take) => take.tier === 'v0.1' && take.status === 'ready');
    if (!hasV01) {
      diagnostics.push({
        code: 'dialogue.audio.missing_v0_1',
        path: ['dialogue', i, 'audio', 'slot_id'],
        actual: {
          slot_id: segment.audio.slot_id,
          cast_id: segment.cast_id,
          line: excerpt(segment.line.text),
        },
        expected: 'ready v0.1 Take',
        repair: `render or attach a ready v0.1 Take for "${segment.audio.slot_id}".`,
        severity: 'error',
      });
    }

    if (options.tier !== 'v0.1' && selectReadyTakeAtOrBelowTier(slot, options.tier) === null) {
      diagnostics.push({
        code: 'dialogue.audio.missing_ready_tier',
        path: ['dialogue', i, 'audio', 'slot_id'],
        actual: {
          slot_id: segment.audio.slot_id,
          requested_tier: options.tier,
        },
        expected: 'ready Take at or below requested tier',
        repair: `attach a ready Take for "${segment.audio.slot_id}" at or below ${options.tier}.`,
        severity: 'error',
      });
    }
  }
  return diagnostics;
}

export function validateCharacterPoses(
  production: Production,
  manifest: AssetManifest,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (let sceneIndex = 0; sceneIndex < production.scenes.length; sceneIndex += 1) {
    const scene = production.scenes[sceneIndex];
    for (let shotIndex = 0; shotIndex < scene.shots.length; shotIndex += 1) {
      const shot = scene.shots[shotIndex];
      for (let elementIndex = 0; elementIndex < shot.elements.length; elementIndex += 1) {
        const element = shot.elements[elementIndex];
        switch (element.kind) {
          case 'character':
          case 'chroma-keyed-talent':
            diagnostics.push(...validateCharacterElement(
              element,
              production,
              manifest,
              ['scenes', sceneIndex, 'shots', shotIndex, 'elements', elementIndex],
            ));
            break;
          case 'text-overlay':
          case 'math':
          case 'image-plane':
          case 'video-plane':
          case 'sprite':
          case 'model-3d':
          case 'interactive-group':
          case 'shape':
            break;
        }
      }
    }
  }
  return diagnostics;
}

export function selectReadyTakeAtOrBelowTier(slot: Slot, maxTier: Tier): Take | null {
  const cap = tierRank(maxTier);
  let bestTake: Take | null = null;
  let bestRank = -1;
  for (const take of slot.takes) {
    if (take.status !== 'ready') {
      continue;
    }
    const rank = tierRank(take.tier);
    if (rank <= cap && rank > bestRank) {
      bestTake = take;
      bestRank = rank;
    }
  }
  return bestTake;
}

function validateCharacterElement(
  element: CharacterPoseElement,
  production: Production,
  manifest: AssetManifest,
  path: Array<string | number>,
): Diagnostic[] {
  const cast = production.characters.find((member) => member.id === element.cast_id);
  if (cast === undefined) {
    return [{
      code: 'character.cast.missing',
      path: [...path, 'cast_id'],
      actual: element.cast_id,
      expected: 'CastMember declared in Production.characters',
      repair: `add CastMember "${element.cast_id}" or update the character Element cast_id.`,
      severity: 'error',
    }];
  }

  const diagnostics: Diagnostic[] = [];
  const requiredPoses = requiredPoseNames(element);
  for (const poseName of requiredPoses) {
    const poseSlots = cast.pose_slots;
    if (poseSlots === undefined) {
      diagnostics.push(missingPoseDiagnostic(element, path, poseName));
      continue;
    }
    const slotId = poseSlots[poseName];
    if (slotId === undefined) {
      diagnostics.push(missingPoseDiagnostic(element, path, poseName));
      continue;
    }
    if (manifest.slots[slotId] === undefined) {
      diagnostics.push({
        code: 'character.pose_slot.slot_missing',
        path: [...path, 'pose_policy'],
        actual: slotId,
        expected: 'Slot declared in AssetManifest.slots',
        repair: `declare image Slot "${slotId}" for CastMember "${cast.id}" pose "${poseName}".`,
        severity: 'error',
      });
    }
  }
  return diagnostics;
}

function requiredPoseNames(element: CharacterPoseElement): PoseName[] {
  switch (element.pose_policy.mode) {
    case 'cue-driven':
      return [element.pose_policy.current_pose];
    case 'dialogue-auto':
      return ['idle', 'speaking'];
  }
  const exhaustive: never = element.pose_policy;
  return exhaustive;
}

function missingPoseDiagnostic(
  element: CharacterPoseElement,
  path: Array<string | number>,
  poseName: PoseName,
): Diagnostic {
  return {
    code: 'character.pose_slot.missing',
    path: [...path, 'pose_policy'],
    actual: {
      cast_id: element.cast_id,
      pose: poseName,
    },
    expected: 'pose_slots entry on the referenced CastMember',
    repair: `add pose_slots.${poseName} to CastMember "${element.cast_id}".`,
    severity: 'error',
  };
}

function excerpt(line: string): string {
  if (line.length <= 80) {
    return line;
  }
  return `${line.slice(0, 77)}...`;
}

function tierRank(tier: Tier): number {
  if (isMasteryTier(tier)) {
    return 1000 + Number.parseInt(tier.slice('mastery:'.length), 10);
  }
  switch (tier) {
    case 'v0.1':
      return 1;
    case 'v0.3':
      return 2;
    case 'v0.6':
      return 3;
    case 'v0.9':
      return 4;
    case 'v1.0':
      return 5;
  }
  const exhaustive: never = tier;
  return exhaustive;
}

function isMasteryTier(tier: Tier): tier is `mastery:${number}` {
  return tier.startsWith('mastery:');
}
