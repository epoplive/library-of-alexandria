/* ============================================================
   LATTICE — The data contract.

   A Production is data. The Player and the authoring command CLI
   both operate on instances of these shapes. Future LLM agents
   produce instances of these shapes through a Dharma-graph workflow.

   The platform's job is to render and tool around this contract.
   The author's job (human or LLM) is to fill it in.

   Key principle: the lattice is rendered by the Stage primitive on
   React-Three-Fiber, so 2D and 3D content composite in a single
   scene graph. Elements live in 3D space (with z=0 being the
   default plane). Cues animate transforms + shader uniforms.

   See docs/VISION.md for the why.
   ============================================================ */

/* (Take.artifact is intentionally permissive — we want minimum
 *  shape that resolves to a renderable URL. The fuller Asset type
 *  from production-schema.ts is one possible payload; a simple
 *  {url, path, hash} bag is another, used by the hydrator when
 *  attaching pre-rendered files to a Take.) */

/* ---- Helpers + primitive types ----------------------------- */

/** ISO datetime string, e.g. "2026-05-23T12:00:00.000Z". */
export type ISODateTime = string;

/** A Slot id — a stable address an Element or Track references. */
export type SlotId = string;

/** A Cast member id. */
export type CastId = string;

/** A Cast pose name. Resolved through CastMember.pose_slots. */
export type PoseName = string;

/** An Element id, unique within a Shot. */
export type ElementId = string;

/** A Shot id, unique within a Scene. */
export type ShotId = string;

/** A Scene id, unique within a Production. */
export type SceneId = string;

/** A Production id (typically the publish slug). */
export type ProductionId = string;

/** 3D coordinates. x,y are 0..1 viewport-relative (origin top-left,
 *  x→right, y→down). z is depth in scene units (positive = toward camera). */
export type Vec3 = readonly [number, number, number];

/** Euler rotation (XYZ order), radians. */
export type Euler3 = readonly [number, number, number];

/** Uniform scale (number) or per-axis. */
export type Scale = number | readonly [number, number, number];

/** Color as hex string (#rrggbb / #rrggbbaa) or named token. */
export type Color = string;

/** Easing curve name; resolved against the canonical easing helpers. */
export type EaseCurve =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'spring';

/* ---- Layout — where an Element sits in the Stage ------------ */

/**
 * Layout in 3D space. x,y default to viewport-relative (0..1) so 2D
 * scene authoring is natural; z defaults to 0 for 2D-plane Elements.
 * Width/height are viewport-relative for plane-ish Elements; ignored
 * for 3D models that own their own geometry.
 */
export interface Layout {
  position?: Vec3;
  rotation?: Euler3;
  scale?: Scale;
  /** Viewport-relative size for plane-ish Elements (0..1). */
  size?: { width: number; height: number };
  /** Stacking hint for elements at the same z. Higher renders on top. */
  z_order?: number;
  /** Opacity 0..1. */
  opacity?: number;
}

export const DEFAULT_LAYOUT: Required<Pick<Layout, 'position' | 'rotation' | 'scale' | 'opacity' | 'z_order'>> = {
  position: [0.5, 0.5, 0],
  rotation: [0, 0, 0],
  scale: 1,
  opacity: 1,
  z_order: 0,
};

/** Layout transition for animated Cues. */
export interface LayoutTransition {
  /** Milliseconds. Omit for an instantaneous Cue. */
  duration_ms?: number;
  /** Default is author-provided; runtime requires a concrete curve for interpolation. */
  ease?: EaseCurve;
}

/** Optional clipping mask applied to an Element. */
export type Mask =
  | { kind: 'rect'; rounded?: number; feather?: number }
  | { kind: 'circle'; feather?: number }
  | { kind: 'ellipse'; feather?: number }
  | { kind: 'path'; svg_path: string; feather?: number }
  | { kind: 'shader'; /** GLSL fragment that returns alpha 0..1 from screen-space uv */ frag: string };

/* ---- Slot + Take — the asset address + tier ladder ---------- */

/** Tier on the production-quality ladder. v0.1 is the free baseline;
 *  v1.0 is full integrated video. Mastery tiers (for interactive
 *  Slots) use 'mastery:N' where N is the difficulty rank. */
export type Tier = 'v0.1' | 'v0.3' | 'v0.6' | 'v0.9' | 'v1.0' | `mastery:${number}`;

/** What kind of asset a Slot holds. */
export type SlotKind =
  | 'audio-vo'           // voiceover clip
  | 'audio-dialogue'     // on-screen Cast dialogue clip
  | 'audio-music'        // music bed
  | 'audio-sfx'          // sound effect
  | 'image'              // still image
  | 'video'              // video clip (with optional alpha mask)
  | 'model-3d'           // glTF / OBJ
  | 'sprite-sheet'       // animated sprite frames
  | 'lookup-text';       // simple text payload (e.g., translated VO transcript)

/** A reference to a Slot. Used by Elements and Tracks to address
 *  the asset they need; the Asset Manifest resolves it to a Take. */
export interface SlotRef {
  slot_id: SlotId;
  /** If omitted, the Player picks the best available Take per the
   *  selection policy (typically: highest production tier rendered,
   *  with mastery tier filtered by the learner's current mastery
   *  level for interactive Slots). */
  preferred_tier?: Tier;
}

/** One rendered version of a Slot's content at a particular tier.
 *  Takes are referenced from the Asset Manifest, not embedded in the
 *  Production data itself, so the same Production stays addressable
 *  while Takes are re-rendered. */
/** Minimum artifact shape — a rendered file the Player can resolve to
 *  a URL. Producers can attach richer fields (the production-schema
 *  Asset shape, sprite-sheet metadata, etc.) on top. */
export interface ArtifactRef {
  url?: string;
  path?: string;
  hash?: string;
  /** Bytes if known. */
  size?: number;
  /** MIME type if known. */
  mime?: string;
  [extra: string]: unknown;
}

/** Per-chunk timing entry. Chunk-level today (sentence-aligned by
 *  gen-audio's splitter); word-level when we add forced alignment in a
 *  v0.3 upgrade. Drives transcript highlight + scrubber readouts. */
export interface AudioTiming {
  text: string;
  startMs: number;
  durationMs: number;
}

export interface Take {
  tier: Tier;
  /** The rendered artifact. May be a file URL, a sprite-sheet pack,
   *  a glTF, etc. — resolved by the Asset Manifest. */
  artifact?: ArtifactRef;
  status: 'pending' | 'queued' | 'rendering' | 'ready' | 'failed' | 'superseded';
  /** USD cost to produce this Take, if known. */
  cost_usd?: number;
  /** Playback-time alignment for audio Takes — chunks the chrome lights
   *  up as the playhead crosses them. */
  timings?: AudioTiming[];
  /** Provider + model used to render this Take (for receipts + reproducibility). */
  provenance?: {
    provider: string;     // e.g. 'kokoro', 'elevenlabs', 'openai-image', 'kling-i2v'
    model?: string;
    voice_id?: string;
    prompt?: string;
    seed?: number | string;
  };
  rendered_at?: ISODateTime;
  /** Optional free-form notes (e.g., "regenerated after style update"). */
  note?: string;
}

/** A Slot lives in the Asset Manifest. The Production data only
 *  references Slot ids via SlotRefs. */
export interface Slot {
  id: SlotId;
  kind: SlotKind;
  /** Author-friendly description, used in cost ledger + funding strip. */
  description: string;
  takes: Take[];
  /** Optional explicit selection policy override. */
  selection?: 'best-available' | 'lowest-tier' | { fixed: Tier };
}

/* ---- Cast — characters/voices ------------------------------- */

/** A voice service the gen-audio pipeline knows how to drive. */
export type VoiceService = 'kokoro' | 'elevenlabs' | 'openai' | 'orpheus' | 'cartesia';

export interface CastMember {
  id: CastId;
  name: string;
  /** Author/system notes about who this is + persona. */
  description: string;
  voice_profile: {
    service: VoiceService;
    voice_id: string;
    voice_model?: string;
    /** Per-service settings (ElevenLabs stability/similarity, etc). */
    settings?: Record<string, unknown>;
  };
  /** Pose name to Slot id. Character Elements resolve through this map. */
  pose_slots?: Record<PoseName, SlotId>;
  /** Identity reference for image gen consistency (a Slot whose Takes
   *  are reference images used to keep the character visually stable). */
  identity_ref?: SlotRef;
  /** Rights tier — public-domain, licensed, original-character. */
  rights?: 'public-domain' | 'licensed' | 'original' | 'public-figure';
}

/* ---- Elements — what's compositable on screen --------------- */

/** Base shape every Element shares. */
interface ElementBase {
  id: ElementId;
  /** Layout in the Stage at the start of the Shot. Cues mutate this. */
  initial_layout?: Layout;
  initial_mask?: Mask;
  initial_visible?: boolean;
  /** Pointer events pass through this Element (visual-only layer above
   *  an interactive). */
  pass_through?: boolean;
}

/** Text overlay — title cards, lower-thirds, math labels. */
export interface TextOverlayElement extends ElementBase {
  kind: 'text-overlay';
  text: string;
  style?: {
    font?: 'display' | 'sans' | 'mono';
    size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl';
    weight?: number;
    color?: Color;
    align?: 'left' | 'center' | 'right';
    /** If true, render as 3D text in the scene. Otherwise overlay HTML. */
    render_3d?: boolean;
  };
}

/** Math formula via KaTeX. */
export interface MathElement extends ElementBase {
  kind: 'math';
  latex: string;
  display?: boolean;
}

/** Image on a Three.js plane. */
export interface ImagePlaneElement extends ElementBase {
  kind: 'image-plane';
  source: SlotRef;
  alt?: string;
  /** If true the texture stretches; else it preserves aspect (fits). */
  stretch?: boolean;
}

/** Video clip on a Three.js plane, optionally chroma/alpha-masked. */
export interface VideoPlaneElement extends ElementBase {
  kind: 'video-plane';
  source: SlotRef;
  /** Optional mask Slot — a video alpha track for chroma-key /
   *  rotoscope masks (produced by i2v providers). */
  mask?: SlotRef;
  loop?: boolean;
  muted?: boolean;
  /** Trim window within the source clip (seconds). */
  segment?: { start: number; end: number };
}

/** Animated sprite — sprite-sheet driven plane. */
export interface SpriteElement extends ElementBase {
  kind: 'sprite';
  source: SlotRef;
  /** Sprite sheet frame count + tiling info baked in the Slot,
   *  but per-Shot fps override is allowed. */
  fps?: number;
}

/** 3D model (glTF/OBJ). Future: full character rigs. */
export interface Model3DElement extends ElementBase {
  kind: 'model-3d';
  source: SlotRef;
  /** Named animation clip to play on the model. */
  clip?: string;
}

export type CharacterPosePolicy =
  | { mode: 'cue-driven'; current_pose: PoseName }
  | { mode: 'dialogue-auto' };

/** Cast member rendered on-screen through pose Slots. */
export interface CharacterElement extends ElementBase {
  kind: 'character';
  cast_id: CastId;
  pose_policy: CharacterPosePolicy;
}

/** @deprecated Use CharacterElement. Retained for one migration phase. */
export interface ChromaKeyedTalentElement extends Omit<CharacterElement, 'kind'> {
  kind: 'chroma-keyed-talent';
}

/** Interactive — a React-Three-Fiber group authored as a custom
 *  Element component. The component receives a sizing prop + a ref
 *  handle so Cues can dispatch methods (setLevel, reset, halt, etc.). */
export interface InteractiveGroupElement extends ElementBase {
  kind: 'interactive-group';
  /** Stable component id; the Stage looks this up in the Production's
   *  interactive registry. */
  component_id: string;
  /** Props passed to the component on mount. */
  props?: Record<string, unknown>;
  /** Mastery axis: which Slot resolves the difficulty variant. The
   *  Take selection picks the right mastery tier per the learner's
   *  progress. */
  mastery_slot?: SlotRef;
}

/** B-roll / supporting visual element kept simple — e.g., a static
 *  geometric shape useful for diagrammatic moments. */
export interface ShapeElement extends ElementBase {
  kind: 'shape';
  shape: 'rect' | 'circle' | 'arrow' | 'line';
  color?: Color;
  /** Shape-specific data. */
  data?: Record<string, unknown>;
}

/** Discriminated union of all Element kinds. */
export type Element =
  | TextOverlayElement
  | MathElement
  | ImagePlaneElement
  | VideoPlaneElement
  | SpriteElement
  | Model3DElement
  | CharacterElement
  | ChromaKeyedTalentElement
  | InteractiveGroupElement
  | ShapeElement;

/* ---- Cues — triggered mutations within a Shot --------------- */

/** A Cue fires at a specific moment within a Shot, mutating one
 *  Element or one Track. Cues are how animation works. */
export type Cue =
  | TransformCue
  | VisibilityCue
  | MaskCue
  | MaterialCue
  | ShaderUniformCue
  | ActionCue
  | SpawnCue
  | DespawnCue;

interface CueBase {
  /** Seconds within the Shot when the cue fires. Default 0. */
  at?: number;
  /** Optional id; useful for debugging + author tooling. */
  id?: string;
  /** Additive composition is accepted by validation; runtime support lands when first needed. */
  composition?: 'additive';
}

/** Animate an Element's Layout (position / rotation / scale / opacity). */
export interface TransformCue extends CueBase {
  kind: 'transform';
  element_id: ElementId;
  layout: Layout;
  transition?: LayoutTransition;
}

/** Toggle Element visibility. */
export interface VisibilityCue extends CueBase {
  kind: 'visibility';
  element_id: ElementId;
  visible: boolean;
  transition?: LayoutTransition;
}

/** Change an Element's mask (or null to remove). */
export interface MaskCue extends CueBase {
  kind: 'mask';
  element_id: ElementId;
  mask: Mask | null;
  transition?: LayoutTransition;
}

/** Mutate material parameters on the Element's R3F material. */
export interface MaterialCue extends CueBase {
  kind: 'material';
  element_id: ElementId;
  /** Material parameter name → new value. */
  params: Record<string, number | Color | boolean | Vec3>;
  transition?: LayoutTransition;
}

/** Mutate a shader uniform (for Elements that opt into a custom shader). */
export interface ShaderUniformCue extends CueBase {
  kind: 'shader-uniform';
  element_id: ElementId;
  uniforms: Record<string, number | Vec3 | Color>;
  transition?: LayoutTransition;
}

/** Dispatch a method on an Interactive Element's ref handle. */
export interface ActionCue extends CueBase {
  kind: 'action';
  element_id: ElementId;
  method: string;
  args?: unknown[];
}

/** Spawn an Element mid-Shot (e.g., particle burst, popping text). */
export interface SpawnCue extends CueBase {
  kind: 'spawn';
  element: Element;
}

/** Remove a spawned Element. */
export interface DespawnCue extends CueBase {
  kind: 'despawn';
  element_id: ElementId;
}

/* ---- Tracks — parallel channels within a Shot --------------- */

/** Script line spoken by a Cast member or the narrator. */
export interface Line {
  /** Free text (what's said). */
  text: string;
  /** Optional discoveries — rabbit-hole tokens inside this Line. */
  discoveries?: string[];
}

/** Voiceover (narrator) track. One per Shot. */
export interface VOTrack {
  cast_id: CastId;
  line: Line;
  /** The Slot holding the rendered audio. */
  audio: SlotRef;
  /** Optional explicit duration override (seconds); else inferred
   *  from the rendered Take's duration. */
  duration_override?: number;
}

/** On-screen dialogue track — same shape as VO but tied to a
 *  Cast member rendered on-screen by a character Element. */
export interface DialogueSegment {
  id: string;
  cast_id: CastId;
  line: Line;
  /** The Slot holding the rendered dialogue audio. */
  audio: SlotRef;
  /** Optional explicit duration override (seconds); else inferred
   *  from the rendered Take's timings or the containing Shot duration. */
  duration_override?: number;
}

/** Music bed. */
export interface MusicTrack {
  source: SlotRef;
  gain_db?: number;
  loop?: boolean;
  /** Crossfade in/out (seconds). */
  fade_in?: number;
  fade_out?: number;
}

/** Sound effect. */
export interface SFXTrack {
  source: SlotRef;
  gain_db?: number;
  /** When to play within the Shot (seconds). */
  at?: number;
}

/** Camera state at the start of the Shot. Cues mutate it via TransformCue
 *  on the special element_id "$camera". */
export interface CameraTrack {
  /** World position. */
  position?: Vec3;
  /** Look-at target. */
  target?: Vec3;
  /** Field of view (perspective camera). Omit for orthographic. */
  fov?: number;
  /** Orthographic camera (good default for 2D scenes). */
  ortho?: boolean;
}

/** Lighting setup. v0.1 typically omits; the Stage applies a neutral
 *  ambient default if absent. */
export interface LightingTrack {
  ambient?: Color;
  /** A small set of directional / point lights. */
  lights?: Array<{
    kind: 'directional' | 'point' | 'spot';
    position?: Vec3;
    target?: Vec3;
    color?: Color;
    intensity?: number;
  }>;
}

/** Transition into or out of a Shot. */
export interface Transition {
  kind: 'cut' | 'dissolve' | 'fade' | 'wipe' | 'iris' | 'shader';
  /** Seconds. */
  duration?: number;
  /** For 'shader' transitions — GLSL frag shader source. */
  shader?: string;
  /** For 'wipe' — angle in degrees. */
  angle?: number;
}

export type ShotAddress = { scene_id: SceneId; shot_id: ShotId };

export interface TransitionEdge {
  id: string;
  from: ShotAddress;
  to: ShotAddress;
  kind: 'cut' | 'fade' | 'cross-dissolve' | 'slide' | 'push' | 'wipe' | 'iris' | 'shader';
  /** Milliseconds; `cut` is always duration_ms: 0. */
  duration_ms: number;
  ease?: EaseCurve;
  direction?: 'left' | 'right' | 'up' | 'down';
  shader?: string;
  angle?: number;
}

/* ---- Scene backgrounds ------------------------------------- */

export interface GradientStop {
  /** Offset along the gradient line, 0..1. */
  offset: number;
  color: string;
}

export interface BoxRect {
  /** Normalized source x, 0..1. */
  x: number;
  /** Normalized source y, 0..1. */
  y: number;
  /** Normalized source width, 0..1. */
  width: number;
  /** Normalized source height, 0..1. */
  height: number;
}

export interface ParallaxLayer {
  slot_id: SlotId;
  /** 0=front, 1=back. */
  depth: number;
  offset?: { x: number; y: number };
}

export interface NoneBackground {
  kind: 'none';
}

export interface GradientBackground {
  kind: 'gradient';
  stops: GradientStop[];
  drift?: {
    speed_s: number;
    direction: 'left' | 'right' | 'up' | 'down' | 'diagonal';
  };
}

export interface ImagePanBackground {
  kind: 'image-pan';
  slot_id: SlotId;
  pan: {
    from: BoxRect;
    to: BoxRect;
  };
  zoom?: {
    from: number;
    to: number;
  };
  duration_s: number;
}

export interface ParallaxBackground {
  kind: 'parallax';
  layers: ParallaxLayer[];
}

export type SceneBackground =
  | NoneBackground
  | GradientBackground
  | ImagePanBackground
  | ParallaxBackground;

/* ---- Shot — atomic unit of pacing --------------------------- */

export interface Shot {
  id: ShotId;
  /** Duration of the Shot in seconds. Inferred from VO Take duration
   *  if omitted; required for non-VO Shots. */
  duration?: number;

  /** Composition — the Elements visible during this Shot. */
  elements: Element[];

  /** Per-Shot Tracks. */
  vo?: VOTrack;
  dialogue?: DialogueSegment[];
  music?: MusicTrack;
  sfx?: SFXTrack[];
  camera?: CameraTrack;
  lighting?: LightingTrack;
  /** @deprecated Use Production.transitions[] edges instead. */
  transition_in?: Transition;
  /** @deprecated Use Production.transitions[] edges instead. */
  transition_out?: Transition;

  /** Cues fired during this Shot. */
  cues?: Cue[];

  /** Optional author-facing notes (stage directions). Shown in
   *  author-mode overlay. Not rendered to viewers. */
  director_notes?: string;
}

/* ---- Scene + Production ------------------------------------- */

/** A Scene groups Shots into a thematic unit. */
export interface Scene {
  id: SceneId;
  /** Eyebrow + title shown in chrome (e.g., "03 · puzzle" + "Banach's theorem"). */
  eyebrow?: string;
  title: string;
  /** Summary used in storyboard + library landing. */
  summary?: string;
  /** Scene-scoped backdrop rendered behind all Shot Elements. */
  background?: SceneBackground;
  shots: Shot[];
  /** Discoveries attached to this Scene that aren't tied to a
   *  specific Line — used by the rabbit-hole graph. */
  discoveries?: Record<string, {
    brief: string;
    deep?: string;
  }>;
}

/** Provenance — who/when/license. */
export interface Provenance {
  authors: string[];
  created_at: ISODateTime;
  updated_at?: ISODateTime;
  license: string; // SPDX id, e.g. "CC-BY-4.0"
  forked_from?: ProductionId;
}

/** Funding block — same shape as in meta.json today, kept in the
 *  Production manifest so the Player chrome can surface it. */
export interface FundingBlock {
  production_cost_usd: number;
  donations_received_usd: number;
  donation_links: {
    github_sponsors?: string;
    ko_fi?: string;
    open_collective?: string;
  };
  planned_improvements: Array<{
    slot?: SlotId;
    tier: Tier;
    cost_usd: number;
    what: string;
  }>;
  ledger?: Array<{
    date: ISODateTime;
    kind: 'spend' | 'donation';
    amount_usd: number;
    slot?: SlotId;
    note?: string;
    donor?: string;
  }>;
}

/** A complete Production. The Asset Manifest is separate — see below. */
export interface Production {
  id: ProductionId;
  title: string;
  subtitle?: string;
  summary: string;
  tags: string[];
  /** Production tier currently published (the BEST tier any Shot has
   *  reached; per-Slot tier can differ). Author-set; displayed in chrome. */
  tier: Tier;

  characters: CastMember[];
  scenes: Scene[];

  /** Explicit transition edges between adjacent Shots in canonical timeline order. */
  transitions: TransitionEdge[];

  /** Inter-Production graph edges (rabbit holes to other Productions). */
  rabbit_holes?: Array<{ slug: string; reason: string }>;

  /** Funding state. */
  funding: FundingBlock;

  provenance: Provenance;

  /** Default Stage aspect ratio. Camera + sizing constrain visuals to fit. */
  default_aspect?: '16:9' | '4:3' | '1:1' | '9:16';
}

/* ---- Asset Manifest — separate from Production -------------- */

/** The Asset Manifest lives next to a Production's data; the Stage
 *  loads both. Separating them lets Takes evolve without invalidating
 *  the Production's structural shape. */
export interface AssetManifest {
  production_id: ProductionId;
  slots: Record<SlotId, Slot>;
  /** Cross-cutting ledger (mirrors FundingBlock.ledger for queries). */
  ledger?: FundingBlock['ledger'];
  updated_at?: ISODateTime;
}

/* ---- Utility types ----------------------------------------- */

/** Element discriminator helper. */
export function isInteractive(el: Element): el is InteractiveGroupElement {
  return el.kind === 'interactive-group';
}

/** Pick the best Take for a Slot per the selection policy. */
export function selectTake(
  slot: Slot,
  context?: { mastery_level?: number },
): Take | null {
  const ready = slot.takes.filter((t) => t.status === 'ready');
  if (ready.length === 0) return null;
  if (slot.selection && typeof slot.selection === 'object' && 'fixed' in slot.selection) {
    return ready.find((t) => t.tier === slot.selection!['fixed' as keyof typeof slot.selection]) ?? null;
  }
  if (slot.selection === 'lowest-tier') {
    return [...ready].sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier])[0] ?? null;
  }
  // best-available is the default.
  // For mastery Slots, filter to mastery tiers ≤ learner level + 1.
  if (context?.mastery_level !== undefined) {
    const cap = context.mastery_level + 1;
    const mastery = ready.filter((t) => t.tier.startsWith('mastery:')).sort(
      (a, b) => masteryRank(b) - masteryRank(a),
    );
    const next = mastery.find((t) => masteryRank(t) <= cap);
    if (next) return next;
  }
  return [...ready].sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])[0] ?? null;
}

function masteryRank(t: Take): number {
  if (!t.tier.startsWith('mastery:')) return -1;
  return Number.parseInt(t.tier.slice('mastery:'.length), 10) || 0;
}

const TIER_RANK: Record<string, number> = {
  'v0.1': 1,
  'v0.3': 2,
  'v0.6': 3,
  'v0.9': 4,
  'v1.0': 5,
};

export { normalizeProduction } from './lattice-normalize';
