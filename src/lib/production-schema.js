/* ============================================================
   Production schema — OFFLINE side.

   This is what the gen-pipeline agent consumes to produce ONE final
   video that gets uploaded to YouTube. The agent reads it, generates
   reference images for characters, runs i2v on shots, synthesizes
   voice lines, stitches everything, uploads, and writes the resulting
   YouTube ID back into the lesson manifest (`video.source.id`).

   This file lives at `lessons/<slug>/production.json` and is
   committed for provenance / regen. The lesson manifest references
   it via `provenance.video_production_id`.

   Constraints baked in:
   - Most i2v services cap clips at 5–10 seconds. Shots are clip-sized.
   - Character coherence: every shot referencing a character must use
     the locked reference images from that character.
   - Cost tracking per asset, summed up for budget transparency.
   ============================================================ */
/* ---- Helpers ---- */
export function pendingAssets(prod) {
    return prod.assets.filter((a) => a.status === 'pending' || a.status === 'queued');
}
export function readyAssets(prod) {
    return prod.assets.filter((a) => a.status === 'ready');
}
export function totalSpend(prod) {
    return prod.assets.reduce((s, a) => s + (a.cost_usd ?? 0), 0);
}
export function shotByTime(prod, t) {
    return prod.shots.find((sh) => t >= sh.start && t < sh.start + sh.duration);
}
export function buildQueue(prod, lessonRoot) {
    return pendingAssets(prod).map((asset) => ({
        lesson_slug: prod.lesson_slug,
        production_id: prod.id,
        asset,
        dest_path: `${lessonRoot}/${prod.lesson_slug}/assets/${asset.id}`,
    }));
}
