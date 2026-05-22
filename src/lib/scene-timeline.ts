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

export interface BoundingBox {
  /** Percentages, 0..1, relative to scene viewport. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A renderable position for a scene element. Extends BoundingBox with
 * transform properties so the player can animate between layouts.
 *
 * Coordinates are 0..1 of the stage viewport. The player applies the
 * transform via framer-motion so any change between beats animates.
 */
export interface Layout {
  /** Left edge as 0..1 of stage width. */
  x: number;
  /** Top edge as 0..1 of stage height. */
  y: number;
  /** Width as 0..1 of stage width. */
  width: number;
  /** Height as 0..1 of stage height. */
  height: number;
  /** Rotation in degrees. */
  rotate?: number;
  /** Opacity 0..1. */
  opacity?: number;
  /** Scale multiplier (1 = no scale). */
  scale?: number;
  /** Layer order (higher = on top). */
  z?: number;
}

/** Easing curve for layout transitions. */
export type EaseCurve = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring' | 'snap';

export interface LayoutTransition {
  /** Seconds. Default 0.5. */
  duration?: number;
  /** Default 'ease-in-out'. 'snap' = no animation. */
  ease?: EaseCurve;
  /** Optional delay before the transition starts (seconds). */
  delay?: number;
}

export const DEFAULT_LAYOUT: Layout = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  rotate: 0,
  opacity: 1,
  scale: 1,
  z: 0,
};

/* ============================================================
   Layers + Stage

   A scene's visual surface is a STAGE composed of LAYERS.
   Each layer is a renderable element (interactive React, image,
   video clip, character, math, text, or a sub-video clip). Layers
   are positioned with Layouts and optionally clipped by Masks.
   Beats animate layer transforms and dispatch interactive actions.
   ============================================================ */

/**
 * Sprite — a named video-loop / image that an interactive component
 * uses internally as part of its own visual surface. Lets a generated
 * goose-flap loop literally BE the draggable goose inside FixedPoint-
 * Hunter, instead of a static emoji.
 */
export type Sprite =
  | { kind: 'video-loop'; asset_id: string; muted?: boolean }
  | { kind: 'image'; asset_id: string }
  | { kind: 'sequence'; asset_ids: string[]; fps?: number };

/** Layer source — what's inside the layer. */
export type LayerSource =
  | {
      kind: 'interactive';
      component_id: string;
      /**
       * Named sprites the component can render internally. The Stage
       * resolves asset_ids to URLs and hands the resolved map to the
       * component as a `sprites` prop. The component decides how to
       * use them (e.g. swap an emoji for a video loop).
       */
      sprites?: Record<string, Sprite>;
    }
  | { kind: 'image'; asset_id: string; alt?: string }
  | { kind: 'video-clip'; asset_id: string; segment?: { start: number; end: number }; loop?: boolean; muted?: boolean }
  | { kind: 'character'; character_id: string; pose?: string }
  | { kind: 'math'; latex: string; display?: boolean }
  | { kind: 'text'; text: string; style?: TextStyle };

export interface TextStyle {
  font?: 'display' | 'sans' | 'mono';
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
  weight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

/** Mask shapes for layer clipping. */
export type Mask =
  | { kind: 'rect'; rounded?: number; feather?: number }
  | { kind: 'circle'; feather?: number }
  | { kind: 'ellipse'; feather?: number }
  | { kind: 'path'; svg_path: string; feather?: number };

/** Initial state of a layer when the scene starts. */
export interface Layer {
  id: string;
  source: LayerSource;
  /** Default layout when scene begins. */
  initial_layout: Layout;
  /** Default mask. */
  initial_mask?: Mask;
  /** Visible when scene starts. Default true. */
  initial_visible?: boolean;
  /** Pointer-events should pass through this layer. Useful for visual-only layers above an interactive. */
  pass_through?: boolean;
}

/** Beat operations — multiple can fire at one beat boundary. */
export type BeatOp =
  | {
      kind: 'transform';
      layer_id: string;
      layout?: Partial<Layout>;
      mask?: Mask | null;
      transition?: LayoutTransition;
    }
  | {
      kind: 'visibility';
      layer_id: string;
      visible: boolean;
      transition?: LayoutTransition;
    }
  | {
      kind: 'action';
      layer_id: string;
      /** Method name on the layer's imperative ref. */
      method: string;
      args?: unknown[];
    };

/* ---- Video source ---- */

export type VideoSource =
  | { kind: 'youtube'; id: string }
  | { kind: 'vimeo'; id: string }
  | { kind: 'url'; src: string };

export interface VideoTrack {
  source: VideoSource;
  /** Total runtime in seconds. */
  duration: number;
  /** Resolved at build time; cached for offline preview. */
  thumbnail_url?: string;
}

/* ---- Interactive actions ---- */

/**
 * One unit of work dispatched onto an interactive component's
 * imperative ref. Components opt in via `useImperativeHandle`.
 */
export interface InteractiveAction {
  method: string;
  args?: unknown[];
}

/* ---- Annotations ---- */

/**
 * Optional overlay drawn on top of the video at a specific beat —
 * a label, arrow, highlight ring, etc. Coords are 0..1 of viewport.
 */
export interface Annotation {
  kind: 'label' | 'arrow' | 'ring' | 'box';
  text?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  duration?: number;
}

/* ---- Beats ---- */

export interface Beat {
  id: string;
  /** Absolute time in the video, seconds. */
  at: number;
  /** Optional explicit duration (else: until next beat). */
  duration?: number;
  /**
   * Beat operations — transforms, visibility changes, and imperative
   * actions to dispatch at this beat boundary. Multiple ops can fire
   * at once (e.g. move the interactive, fade in a formula, call
   * setLevel on the puzzle, all at the same moment).
   */
  ops?: BeatOp[];
  /**
   * Legacy single-action shortcut. If present, equivalent to one
   * `action` op targeting the scene's primary interactive layer.
   * Kept for backward compat with simple per-beat actions.
   */
  action?: InteractiveAction;
  /** Render an annotation overlay at this timestamp. */
  annotation?: Annotation;
  /** Narration text — used for transcript display and as TTS fallback when no video. */
  narration?: string;
  /** Which character is speaking — refs Character.id. */
  speaker_id?: string;
  /** Director / author notes for the production pipeline. */
  director_notes?: string;
}

/* ---- Scenes ---- */

/**
 * A scene is a stage of layers + a beat timeline. Beats animate the
 * layers and dispatch interactive actions; the stage composites them.
 */
export interface Scene {
  id: string;
  title: string;
  eyebrow?: string;
  /** Start time in the master video, seconds. 0 when no video. */
  start: number;
  /** End time in the master video, seconds. */
  end: number;
  /**
   * Layers composited on the stage, back-to-front (lowest z first).
   * For legacy/simple scenes you can leave layers empty and use
   * `component_id` for a single full-stage interactive.
   */
  layers?: Layer[];
  /**
   * Legacy: which React component renders as the sole interactive.
   * Equivalent to declaring a single layer with kind 'interactive'.
   */
  component_id?: string;
  /** Legacy: layout for the single interactive. */
  layout?: BoundingBox;
  /** Beats within this scene. */
  beats: Beat[];
}

/* ---- Provenance ---- */

export interface Provenance {
  authors: string[];
  /** ISO timestamp. */
  created_at: string;
  /** ISO timestamp of last regen / edit. */
  updated_at?: string;
  /** SPDX license id, e.g. "CC-BY-4.0". */
  license: string;
  /** Original lesson this branched from, if any. */
  forked_from?: string;
  /** Donation link. */
  donation_url?: string;
  /** Links the production manifest that built the video. */
  video_production_id?: string;
}

export interface CostLedger {
  /** Total production cost in USD (sum of asset gen costs). */
  spent_usd: number;
  /** Donations received. */
  received_donations_usd?: number;
  /** Per-service breakdown. */
  by_service?: Record<string, number>;
}

/* ---- Top-level manifest ---- */

export interface LessonManifest {
  slug: string;
  title: string;
  subtitle?: string;
  summary: string;
  tags: string[];
  provenance: Provenance;
  cost_ledger?: CostLedger;
  /** Null means the lesson is React-only with no video backing. */
  video: VideoTrack | null;
  scenes: Scene[];
  /** Rabbit-hole graph edges — slugs of related lessons. */
  rabbit_holes?: { slug: string; reason: string }[];
}

/* ---- Helpers ---- */

export function totalDuration(manifest: LessonManifest): number {
  if (manifest.video) return manifest.video.duration;
  const last = manifest.scenes[manifest.scenes.length - 1];
  return last ? last.end : 0;
}

export function sceneAtTime(manifest: LessonManifest, t: number): Scene | undefined {
  return manifest.scenes.find((s) => t >= s.start && t < s.end);
}

export function beatAtTime(scene: Scene, t: number): Beat | undefined {
  return scene.beats.find(
    (b) => t >= b.at && (b.duration == null || t < b.at + b.duration),
  );
}

export function nextBeat(scene: Scene, t: number): Beat | undefined {
  return scene.beats.find((b) => b.at > t);
}

/**
 * Get all beats whose `at` falls within [from, to]. Used by the player
 * to find actions to fire on a tick boundary.
 */
export function beatsBetween(scene: Scene, from: number, to: number): Beat[] {
  return scene.beats.filter((b) => b.at > from && b.at <= to);
}
