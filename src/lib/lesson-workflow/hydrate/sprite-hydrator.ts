import type { AssetManifest, CastMember, Slot, SlotId, Take } from '@/lib/lattice';
import { generatePlaceholderSprite } from '@/lib/placeholder-sprite';
import type { Diagnostic } from '../diagnostic-schema';
import { hasReadyV01Take } from './audio-resolver';
import type { PoseSlotSpec } from './types';

export interface HydrateSpritesArgs {
  manifest: AssetManifest;
  cast: CastMember[];
}

export interface SpriteHydrateResult {
  manifest: AssetManifest;
  attachedSlotIds: Set<SlotId>;
  poseSlots: PoseSlotSpec[];
  diagnostics: Diagnostic[];
}

export function hydrateSprites(args: HydrateSpritesArgs): SpriteHydrateResult {
  const slots = cloneSlots(args.manifest);
  const attachedSlotIds = new Set<SlotId>();
  const poseSlots = collectPoseSlots(args.cast);
  const diagnostics: Diagnostic[] = [];

  for (const poseSlot of poseSlots) {
    const slot = slots[poseSlot.slot_id];
    if (slot === undefined) continue;
    if (hasReadyV01Take(slot)) continue;

    try {
      const sprite = generatePlaceholderSprite({
        cast_id: poseSlot.cast_id,
        pose: poseSlot.pose_name,
      });
      const take: Take = {
        tier: 'v0.1',
        status: 'ready',
        artifact: {
          url: sprite.data_url,
          path: `placeholder-sprite://${poseSlot.cast_id}/${poseSlot.pose_name}.svg`,
          hash: sprite.hash,
          mime: 'image/svg+xml',
        },
        provenance: {
          provider: 'placeholder-sprite',
        },
      };
      slots[slot.id] = {
        ...slot,
        takes: [...slot.takes, take],
      };
      attachedSlotIds.add(slot.id);
    } catch (error) {
      diagnostics.push({
        code: 'hydrate.sprite.placeholder_failed',
        path: ['cast', poseSlot.cast_id, 'pose_slots', poseSlot.pose_name],
        actual: errorMessage(error),
        expected: 'deterministic placeholder SVG generated for pose slot',
        repair: 'check the cast id and pose name passed to generatePlaceholderSprite.',
        severity: 'error',
      });
    }
  }

  return {
    manifest: {
      ...args.manifest,
      slots,
    },
    attachedSlotIds,
    poseSlots,
    diagnostics,
  };
}

export function collectPoseSlots(cast: CastMember[]): PoseSlotSpec[] {
  const poseSlots: PoseSlotSpec[] = [];
  for (const castMember of cast) {
    if (castMember.pose_slots === undefined) continue;
    const poseNames = Object.keys(castMember.pose_slots).sort((left, right) => left.localeCompare(right));
    for (const poseName of poseNames) {
      poseSlots.push({
        slot_id: castMember.pose_slots[poseName],
        cast_id: castMember.id,
        pose_name: poseName,
      });
    }
  }
  return poseSlots;
}

function cloneSlots(manifest: AssetManifest): { [slotId: string]: Slot } {
  const slots: { [slotId: string]: Slot } = {};
  for (const slotId of Object.keys(manifest.slots)) {
    const slot = manifest.slots[slotId];
    slots[slotId] = {
      ...slot,
      takes: slot.takes.slice(),
    };
  }
  return slots;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
