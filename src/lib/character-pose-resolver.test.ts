import { describe, expect, it } from 'vitest';
import type { CharacterElement, CastMember } from './lattice';
import {
  CharacterPoseDiagnosticError,
  resolveCharacterPose,
} from './character-pose-resolver';

const cast: Pick<CastMember, 'id' | 'pose_slots'> = {
  id: 'duck',
  pose_slots: {
    idle: 'duck.idle',
    speaking: 'duck.speaking',
    pointing: 'duck.pointing',
  },
};

describe('resolveCharacterPose', () => {
  it('returns the declared cue-driven pose slot', () => {
    const element: CharacterElement = {
      id: 'duck-el',
      kind: 'character',
      cast_id: 'duck',
      pose_policy: { mode: 'cue-driven', current_pose: 'pointing' },
    };

    expect(resolveCharacterPose(element, {
      activeSpeakerCastId: null,
      cast,
    })).toEqual({
      pose_name: 'pointing',
      slot_id: 'duck.pointing',
    });
  });

  it('returns speaking for dialogue-auto when the Cast member is active', () => {
    const element: CharacterElement = {
      id: 'duck-el',
      kind: 'character',
      cast_id: 'duck',
      pose_policy: { mode: 'dialogue-auto' },
    };

    expect(resolveCharacterPose(element, {
      activeSpeakerCastId: 'duck',
      cast,
    })).toEqual({
      pose_name: 'speaking',
      slot_id: 'duck.speaking',
    });
  });

  it('returns idle for dialogue-auto when another Cast member is active', () => {
    const element: CharacterElement = {
      id: 'duck-el',
      kind: 'character',
      cast_id: 'duck',
      pose_policy: { mode: 'dialogue-auto' },
    };

    expect(resolveCharacterPose(element, {
      activeSpeakerCastId: 'narrator',
      cast,
    })).toEqual({
      pose_name: 'idle',
      slot_id: 'duck.idle',
    });
  });

  it('throws a structured diagnostic for an undeclared pose', () => {
    const element: CharacterElement = {
      id: 'duck-el',
      kind: 'character',
      cast_id: 'duck',
      pose_policy: { mode: 'cue-driven', current_pose: 'confused' },
    };

    expect(() => resolveCharacterPose(element, {
      activeSpeakerCastId: null,
      cast,
    })).toThrow(CharacterPoseDiagnosticError);

    try {
      resolveCharacterPose(element, {
        activeSpeakerCastId: null,
        cast,
      });
    } catch (error) {
      if (!(error instanceof CharacterPoseDiagnosticError)) {
        throw error;
      }
      expect(error.diagnostic.code).toBe('character.pose_slot.missing');
      return;
    }
    throw new Error('Expected missing pose diagnostic');
  });
});
