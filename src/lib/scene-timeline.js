/* ============================================================
   Lesson schema — RUNTIME side.

   What the player consumes. Lives in `lessons/<slug>/manifest.json`
   alongside the React lesson file.

   Distribution model:
   - Video bytes live on YouTube / Vimeo / a CDN. The manifest holds
     only the source URL + time ranges. The player streams the video
     and overlays the React interactive on top.
   - All interactivity lives in this repo: manifest + react components.
   - Lessons with no video (legacy / lightweight) set `video: null`
     and fall back to React-only mode with transcripts.

   The separate production-side schema (which characters, shots, voice
   lines were used to produce the video) lives in `production-schema.ts`.
   The two are linked by `slug` and `provenance.video_production_id`.
   ============================================================ */
export const DEFAULT_LAYOUT = {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    rotate: 0,
    opacity: 1,
    scale: 1,
    z: 0,
};
/* ---- Helpers ---- */
export function totalDuration(manifest) {
    if (manifest.video)
        return manifest.video.duration;
    const last = manifest.scenes[manifest.scenes.length - 1];
    return last ? last.end : 0;
}
export function sceneAtTime(manifest, t) {
    return manifest.scenes.find((s) => t >= s.start && t < s.end);
}
export function beatAtTime(scene, t) {
    return scene.beats.find((b) => t >= b.at && (b.duration == null || t < b.at + b.duration));
}
export function nextBeat(scene, t) {
    return scene.beats.find((b) => b.at > t);
}
/**
 * Get all beats whose `at` falls within [from, to]. Used by the player
 * to find actions to fire on a tick boundary.
 */
export function beatsBetween(scene, from, to) {
    return scene.beats.filter((b) => b.at > from && b.at <= to);
}
