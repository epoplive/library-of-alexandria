/* ============================================================
   Asset resolver — turn a SlotRef into a renderable URL/value.

   Walks the AssetManifest. Per the Slot's selection policy, picks
   the best available Take and exposes its artifact URL (or whatever
   the Element renderer needs).

   v0.1: handles image-plane, video-plane, audio Slots. Sprite-sheet
   and model-3d come later.
   ============================================================ */

import type { AssetManifest, SlotRef, Take } from '@/lib/lattice';
import { selectTake } from '@/lib/lattice';

export interface ResolvedAsset {
  /** Public URL (or blob URL) of the rendered Take's artifact. */
  url: string | null;
  take: Take | null;
  /** True when the Slot exists but no Take is ready yet. The renderer
   *  should fall back to a placeholder. */
  pending: boolean;
}

export function resolveSlot(
  ref: SlotRef | undefined,
  manifest: AssetManifest,
  context?: { mastery_level?: number },
): ResolvedAsset {
  if (!ref) return { url: null, take: null, pending: false };
  const slot = manifest.slots[ref.slot_id];
  if (!slot) return { url: null, take: null, pending: false };

  // Honor preferred_tier if explicitly requested
  if (ref.preferred_tier) {
    const t = slot.takes.find((x) => x.tier === ref.preferred_tier && x.status === 'ready');
    if (t) return { url: artifactUrl(t), take: t, pending: false };
  }

  const take = selectTake(slot, context);
  if (!take) return { url: null, take: null, pending: slot.takes.length > 0 };
  return { url: artifactUrl(take), take, pending: false };
}

function artifactUrl(take: Take): string | null {
  if (!take.artifact) return null;
  // production-schema Asset shape: { url } or { path } — accept both.
  const a = take.artifact as { url?: string; path?: string };
  return a.url ?? a.path ?? null;
}
