import type { AssetManifest, SlotId } from '@/lib/lattice';
import type { Diagnostic } from '../diagnostic-schema';
import type { HydrateValidation, PendingAssetsArtifact, PoseSlotSpec } from './types';
import { hasReadyV01Take } from './audio-resolver';

export interface ValidateHydrateArgs {
  manifest: AssetManifest;
  pendingAssets: PendingAssetsArtifact;
  referencedSlotIds: Set<SlotId>;
  poseSlots: PoseSlotSpec[];
}

export interface ValidateHydrateResult {
  validation: HydrateValidation;
  diagnostics: Diagnostic[];
}

export function validateHydrate(args: ValidateHydrateArgs): ValidateHydrateResult {
  return {
    validation: {
      tier_v0_1: computeTierV01(args.manifest, args.referencedSlotIds),
      asset_coverage: computeCoverage(args.pendingAssets.assets),
      character_sprite_coverage: computeCharacterSpriteCoverage(args.pendingAssets, args.poseSlots),
    },
    diagnostics: unreferencedSlotDiagnostics(args.manifest, args.referencedSlotIds),
  };
}

function computeTierV01(manifest: AssetManifest, referencedSlotIds: Set<SlotId>): 'pass' | 'fail' {
  for (const slotId of referencedSlotIds) {
    const slot = manifest.slots[slotId];
    if (slot === undefined) return 'fail';
    if (!hasReadyV01Take(slot)) return 'fail';
  }
  return 'pass';
}

function computeCoverage(assets: PendingAssetsArtifact['assets']): 'ok' | 'partial' | 'missing' {
  if (assets.length === 0) return 'ok';
  for (const asset of assets) {
    if (asset.priority === 'required') return 'missing';
  }
  return 'partial';
}

function computeCharacterSpriteCoverage(
  pendingAssets: PendingAssetsArtifact,
  poseSlots: PoseSlotSpec[],
): 'ok' | 'partial' | 'missing' {
  if (poseSlots.length === 0) return 'ok';
  const pendingPoseAssets = pendingAssets.assets.filter((asset) => asset.kind === 'character-pose');
  if (pendingPoseAssets.length === 0) return 'ok';
  for (const asset of pendingPoseAssets) {
    if (asset.priority === 'required') return 'missing';
  }
  return 'partial';
}

function unreferencedSlotDiagnostics(
  manifest: AssetManifest,
  referencedSlotIds: Set<SlotId>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const sortedSlotIds = Object.keys(manifest.slots).sort((left, right) => left.localeCompare(right));
  for (const slotId of sortedSlotIds) {
    if (referencedSlotIds.has(slotId)) continue;
    diagnostics.push({
      code: 'hydrate.slot.unreferenced',
      path: ['manifest', 'slots', slotId],
      actual: 'unreferenced',
      expected: 'slot referenced by storyboard spoken_lines or cast pose_slots',
      repair: 'check compose output and remove unused asset slots or add the missing reference.',
      severity: 'warning',
    });
  }
  return diagnostics;
}
