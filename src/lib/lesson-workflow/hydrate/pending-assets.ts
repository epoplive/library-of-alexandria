import type { AssetManifest, Slot, SlotId } from '@/lib/lattice';
import type {
  MissingAudioAsset,
  PendingAsset,
  PendingAssetsArtifact,
  PoseSlotSpec,
} from './types';
import { PendingAssetsArtifactSchema } from './types';
import { hasReadyV01Take } from './audio-resolver';

export interface BuildPendingAssetsArgs {
  manifest: AssetManifest;
  missingAudio: MissingAudioAsset[];
  poseSlots: PoseSlotSpec[];
  referencedSlotIds: Set<SlotId>;
}

export function buildPendingAssets(args: BuildPendingAssetsArgs): PendingAssetsArtifact {
  const missingAudioBySlotId = missingAudioBySlot(args.missingAudio);
  const poseSlotBySlotId = poseSlotsBySlot(args.poseSlots);
  const assets: PendingAsset[] = [];
  const sortedSlotIds = Object.keys(args.manifest.slots).sort((left, right) => left.localeCompare(right));

  for (const slotId of sortedSlotIds) {
    const slot = args.manifest.slots[slotId];
    if (hasReadyV01Take(slot)) continue;
    const pendingAsset = pendingAssetForSlot({
      slot,
      missingAudioBySlotId,
      poseSlotBySlotId,
      referencedSlotIds: args.referencedSlotIds,
    });
    if (pendingAsset === undefined) continue;
    assets.push(pendingAsset);
  }

  return PendingAssetsArtifactSchema.parse({
    schema_version: 'loa.pending-assets.v1',
    assets,
  });
}

function pendingAssetForSlot(args: {
  slot: Slot;
  missingAudioBySlotId: Map<SlotId, MissingAudioAsset>;
  poseSlotBySlotId: Map<SlotId, PoseSlotSpec>;
  referencedSlotIds: Set<SlotId>;
}): PendingAsset | undefined {
  const priority = args.referencedSlotIds.has(args.slot.id) ? 'required' : 'optional';
  const poseSlot = args.poseSlotBySlotId.get(args.slot.id);
  if (poseSlot !== undefined) {
    return {
      slot_id: args.slot.id,
      kind: 'character-pose',
      target_tier: 'v0.1',
      spec: {
        kind: 'character-pose',
        cast_id: poseSlot.cast_id,
        pose_name: poseSlot.pose_name,
      },
      priority,
    };
  }

  if (args.slot.kind === 'audio-vo' || args.slot.kind === 'audio-dialogue') {
    const missingAudio = args.missingAudioBySlotId.get(args.slot.id);
    if (missingAudio !== undefined) {
      return {
        slot_id: args.slot.id,
        kind: args.slot.kind,
        target_tier: 'v0.1',
        spec: {
          kind: args.slot.kind,
          cast_id: missingAudio.cast_id,
          voice_id: missingAudio.voice_id,
          text: missingAudio.text,
        },
        priority,
      };
    }
    return {
      slot_id: args.slot.id,
      kind: args.slot.kind,
      target_tier: 'v0.1',
      spec: {
        kind: args.slot.kind,
        cast_id: '',
        voice_id: '',
        text: args.slot.description,
      },
      priority,
    };
  }

  if (args.slot.kind === 'image') {
    return {
      slot_id: args.slot.id,
      kind: 'image',
      target_tier: 'v0.1',
      spec: {
        kind: 'image',
        description: args.slot.description,
      },
      priority,
    };
  }

  if (args.slot.kind === 'video') {
    return {
      slot_id: args.slot.id,
      kind: 'video',
      target_tier: 'v0.1',
      spec: {
        kind: 'video',
        description: args.slot.description,
      },
      priority,
    };
  }

  return undefined;
}

function missingAudioBySlot(missingAudio: MissingAudioAsset[]): Map<SlotId, MissingAudioAsset> {
  const bySlot = new Map<SlotId, MissingAudioAsset>();
  for (const missing of missingAudio) {
    bySlot.set(missing.slot_id, missing);
  }
  return bySlot;
}

function poseSlotsBySlot(poseSlots: PoseSlotSpec[]): Map<SlotId, PoseSlotSpec> {
  const bySlot = new Map<SlotId, PoseSlotSpec>();
  for (const poseSlot of poseSlots) {
    bySlot.set(poseSlot.slot_id, poseSlot);
  }
  return bySlot;
}
