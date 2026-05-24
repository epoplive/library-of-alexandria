import type { AssetManifest, CastMember, SlotId } from '@/lib/lattice';
import type { Storyboard } from '../storyboard/types';
import type { AudioIndex, HydrateResult } from './types';
import { resolveAudio } from './audio-resolver';
import { buildPendingAssets } from './pending-assets';
import { collectPoseSlots, hydrateSprites } from './sprite-hydrator';
import { validateHydrate } from './hydrate-validators';

export interface RunHydrateArgs {
  manifest: AssetManifest;
  storyboard: Storyboard;
  audioIndex: AudioIndex;
  cast: CastMember[];
  lessonDir: string;
  lessonSlug: string;
}

export function runHydrate(args: RunHydrateArgs): HydrateResult {
  const audioResult = resolveAudio(args);
  const spriteResult = hydrateSprites({
    manifest: audioResult.manifest,
    cast: args.cast,
  });
  const referencedSlotIds = referencedSlotsFromStoryboardAndCast(args.storyboard, args.cast);
  const poseSlots = collectPoseSlots(args.cast);
  const pendingAssets = buildPendingAssets({
    manifest: spriteResult.manifest,
    missingAudio: audioResult.missing,
    poseSlots,
    referencedSlotIds,
  });
  const validationResult = validateHydrate({
    manifest: spriteResult.manifest,
    pendingAssets,
    referencedSlotIds,
    poseSlots,
  });
  const diagnostics = [
    ...audioResult.diagnostics,
    ...spriteResult.diagnostics,
    ...validationResult.diagnostics,
  ];

  return {
    manifest: spriteResult.manifest,
    pendingAssets,
    diagnostics,
    validation: validationResult.validation,
    stats: {
      slots_total: Object.keys(spriteResult.manifest.slots).length,
      attached: countReadyV01Slots(spriteResult.manifest),
      audio_attached: audioResult.attachedSlotIds.size,
      sprite_attached: spriteResult.attachedSlotIds.size,
      audio_slots_total: countAudioSlots(spriteResult.manifest),
      audio_slots_ready: countReadyAudioSlots(spriteResult.manifest),
      spoken_lines_total: countSpokenLines(args.storyboard),
      pending_required: pendingAssets.assets.filter((asset) => asset.priority === 'required').length,
      pending_optional: pendingAssets.assets.filter((asset) => asset.priority === 'optional').length,
    },
  };
}

export function referencedSlotsFromStoryboardAndCast(storyboard: Storyboard, cast: CastMember[]): Set<SlotId> {
  const referenced = new Set<SlotId>();
  for (const plan of storyboard.plans) {
    for (const spokenLine of plan.spoken_lines) {
      referenced.add(spokenLine.audio_slot_id);
    }
  }
  for (const poseSlot of collectPoseSlots(cast)) {
    referenced.add(poseSlot.slot_id);
  }
  return referenced;
}

function countReadyV01Slots(manifest: AssetManifest): number {
  let count = 0;
  for (const slot of Object.values(manifest.slots)) {
    if (slot.takes.some((take) => take.tier === 'v0.1' && take.status === 'ready')) count += 1;
  }
  return count;
}

function countAudioSlots(manifest: AssetManifest): number {
  let count = 0;
  for (const slot of Object.values(manifest.slots)) {
    if (slot.kind === 'audio-vo' || slot.kind === 'audio-dialogue') count += 1;
  }
  return count;
}

function countReadyAudioSlots(manifest: AssetManifest): number {
  let count = 0;
  for (const slot of Object.values(manifest.slots)) {
    if (slot.kind !== 'audio-vo' && slot.kind !== 'audio-dialogue') continue;
    if (slot.takes.some((take) => take.tier === 'v0.1' && take.status === 'ready')) count += 1;
  }
  return count;
}

function countSpokenLines(storyboard: Storyboard): number {
  let count = 0;
  for (const plan of storyboard.plans) {
    count += plan.spoken_lines.length;
  }
  return count;
}

export {
  AudioIndexSchema,
  PendingAssetSchema,
  PendingAssetSpecSchema,
  PendingAssetsArtifactSchema,
} from './types';
export type {
  AudioIndex,
  AudioIndexEntry,
  HydrateResult,
  HydrateStats,
  HydrateValidation,
  MissingAudioAsset,
  PendingAsset,
  PendingAssetsArtifact,
  PendingAssetSpec,
  PoseSlotSpec,
} from './types';
