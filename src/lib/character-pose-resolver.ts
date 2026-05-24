import type {
  CastId,
  CastMember,
  CharacterElement,
  ChromaKeyedTalentElement,
  PoseName,
  SlotId,
} from './lattice';
import type { Diagnostic } from './lesson-workflow/diagnostic-schema';

export type CharacterPoseElement = CharacterElement | ChromaKeyedTalentElement;

export interface CharacterPoseResolutionState {
  activeSpeakerCastId: CastId | null;
  cast: Pick<CastMember, 'id' | 'pose_slots'>;
}

export interface ResolvedCharacterPose {
  pose_name: PoseName;
  slot_id: SlotId;
}

export class CharacterPoseDiagnosticError extends Error {
  readonly diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic) {
    super(diagnostic.code);
    this.name = 'CharacterPoseDiagnosticError';
    this.diagnostic = diagnostic;
  }
}

export function resolveCharacterPose(
  element: CharacterPoseElement,
  state: CharacterPoseResolutionState,
): ResolvedCharacterPose {
  if (state.cast.id !== element.cast_id) {
    throw new CharacterPoseDiagnosticError({
      code: 'character.cast.mismatch',
      path: ['characters', state.cast.id],
      actual: state.cast.id,
      expected: element.cast_id,
      repair: 'pass the CastMember whose id matches the character Element cast_id.',
      severity: 'error',
    });
  }

  const poseName = poseNameForPolicy(element, state.activeSpeakerCastId);
  const poseSlots = state.cast.pose_slots;
  if (poseSlots === undefined) {
    throw missingPoseDiagnostic(element, poseName);
  }

  const slotId = poseSlots[poseName];
  if (slotId === undefined) {
    throw missingPoseDiagnostic(element, poseName);
  }

  return {
    pose_name: poseName,
    slot_id: slotId,
  };
}

function poseNameForPolicy(
  element: CharacterPoseElement,
  activeSpeakerCastId: CastId | null,
): PoseName {
  switch (element.pose_policy.mode) {
    case 'cue-driven':
      return element.pose_policy.current_pose;
    case 'dialogue-auto':
      return activeSpeakerCastId === element.cast_id ? 'speaking' : 'idle';
  }
  const exhaustive: never = element.pose_policy;
  return exhaustive;
}

function missingPoseDiagnostic(
  element: CharacterPoseElement,
  poseName: PoseName,
): CharacterPoseDiagnosticError {
  return new CharacterPoseDiagnosticError({
    code: 'character.pose_slot.missing',
    path: ['elements', element.id, 'pose_policy'],
    actual: poseName,
    expected: 'declared pose_slots entry on the referenced CastMember',
    repair: `add pose_slots.${poseName} to CastMember "${element.cast_id}".`,
    severity: 'error',
  });
}
