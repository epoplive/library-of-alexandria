/* ============================================================
   LOA authoring commands.

   Each function is a tool extracted from a real authoring substep.
   They mutate Production / AssetManifest data directly. Future
   versions wrap a CLI runner (`scripts/loa.mjs`); for now they're
   importable from TS so we can build Productions programmatically
   while we hand-author the first lesson.

   Tool-extraction notes per function live as jsdoc next to the
   command — schema slice it touches, decomposition the agent
   prompt would follow, format-gate validations, and the test
   corpus the function was calibrated against.

   When a function is ported to a dm-framework graph primitive,
   the jsdoc here becomes the primitive's contract spec.
   ============================================================ */

import type {
  AssetManifest,
  CastMember,
  CharacterElement,
  Cue,
  DialogueSegment,
  Element,
  ElementId,
  EaseCurve,
  FundingBlock,
  Layout,
  Production,
  ProductionId,
  Scene,
  SceneId,
  Shot,
  ShotId,
  Slot,
  SlotId,
  Take,
  Tier,
  TransitionEdge,
  VOTrack,
} from './lattice';
import { normalizeProduction } from './lattice-normalize';

/* ---- newProduction ---------------------------------------- */

/**
 * Initialize an empty Production with default funding + provenance.
 *
 * **Schema slice** — Production (top-level shell only; scenes empty)
 * **Decomposition** — Topic agent emits id/title/summary/tags/tier.
 * Provenance comes from author identity + timestamp; funding starts
 * at zero with empty improvement list (script-build step later
 * proposes planned improvements).
 * **Format gate** — id is kebab-case ≤ 60 chars; summary 30–200 chars;
 * tags is non-empty list of ≤ 4 short tokens.
 * **Test corpus** — looping-llms, every future Production.
 */
export function newProduction(args: {
  id: ProductionId;
  title: string;
  subtitle?: string;
  summary: string;
  tags: string[];
  tier?: Tier;
  authors: string[];
  license?: string;
}): Production {
  return {
    id: args.id,
    title: args.title,
    subtitle: args.subtitle,
    summary: args.summary,
    tags: args.tags,
    tier: args.tier ?? 'v0.1',
    characters: [],
    scenes: [],
    transitions: [],
    rabbit_holes: [],
    funding: {
      production_cost_usd: 0,
      donations_received_usd: 0,
      donation_links: {},
      planned_improvements: [],
      ledger: [],
    },
    provenance: {
      authors: args.authors,
      created_at: new Date().toISOString(),
      license: args.license ?? 'CC-BY-4.0',
    },
    default_aspect: '16:9',
  };
}

/* ---- addCast --------------------------------------------- */

/**
 * Add a Cast member to a Production.
 *
 * **Schema slice** — CastMember
 * **Decomposition** — Cast-assignment agent receives the Production
 * outline + tone/persona hints, emits one entry per distinct speaker
 * (narrator + named characters). voice_id is selected from the
 * service's catalog matched to persona.
 * **Format gate** — id matches /^[a-z0-9-]{2,32}$/; voice_id resolves
 * in the provider's catalog (offline validation against a fetched
 * list); rights tier set if name resembles a real person.
 */
export function addCast(production: Production, member: CastMember): Production {
  return { ...production, characters: [...production.characters, member] };
}

/* ---- addScene -------------------------------------------- */

/**
 * Append a Scene to a Production.
 *
 * **Schema slice** — Scene (id/title/eyebrow/summary, empty shots[])
 * **Decomposition** — Outline agent emits one Scene per major
 * thematic unit, with summary used downstream by the Storyboard
 * step.
 * **Format gate** — id unique within Production; title 6–80 chars;
 * eyebrow ≤ 24 chars; summary 30–400 chars.
 */
export function addScene(production: Production, scene: Scene): Production {
  if (production.scenes.find((s) => s.id === scene.id)) {
    throw new Error(`scene id "${scene.id}" already exists in production "${production.id}"`);
  }
  return { ...production, scenes: [...production.scenes, scene] };
}

/* ---- addShot --------------------------------------------- */

/**
 * Append a Shot to a Scene.
 *
 * **Schema slice** — Shot (with VOTrack + elements + cues + duration)
 * **Decomposition** — Storyboard agent walks the Scene's outline + a
 * sliding window of nearby Lines. For each natural beat:
 *   1) emit one VO line (≤ 280 chars target, hard cap 500)
 *   2) tentative duration = (chars / chars-per-sec) * speed-coef
 *   3) compose Elements visible during this Shot (carried over from
 *      prior Shot's composition unless explicitly replaced)
 *   4) propose Cues for transitions/transforms within the Shot
 * **Format gate** — Shot id unique within Scene; VO line non-empty
 * ≤ 500 chars; duration positive (or omitted to infer from VO Take);
 * cues reference existing Element ids (or spawn them via spawn-cue);
 * at-time of cues ≤ duration.
 */
export function addShot(
  production: Production,
  sceneId: SceneId,
  shot: Shot,
): Production {
  const scenes = production.scenes.map((s) =>
    s.id === sceneId ? { ...s, shots: [...s.shots, shot] } : s,
  );
  return { ...production, scenes };
}

/* ---- addTransition -------------------------------------- */

/**
 * Add a transition edge between adjacent Shots.
 *
 * **Schema slice** — Production.transitions[] (TransitionEdge)
 * **Decomposition** — Transition-planning agent reads the canonical
 * Scene/Shot order, selects one adjacent pair, chooses the cinematic
 * transition kind, duration_ms, optional ease/direction/shader fields,
 * then emits one edge from the outgoing Shot address to the incoming
 * Shot address.
 * **Format gate** — from/to must be adjacent in canonical timeline
 * order; kind is cut|fade|cross-dissolve|slide|push|wipe|iris|shader;
 * duration is milliseconds and non-negative; cut requires duration:0;
 * slide/push should include direction; shader transitions include shader.
 * **Test corpus** — add {from:{scene_id:'s',shot_id:'a'},
 * to:{scene_id:'s',shot_id:'b'},kind:'cross-dissolve',duration:600}
 * to a two-shot Production; normalizeProduction returns the same edge
 * in Production.transitions[] and no deprecated Shot transition fields.
 */
export function addTransition(production: Production, edge: TransitionEdge): Production {
  return normalizeProduction({
    ...production,
    transitions: [...production.transitions, edge],
  });
}

/* ---- addElement ------------------------------------------ */

/**
 * Add an Element to an existing Shot's composition.
 *
 * **Schema slice** — Element (one of the discriminated kinds)
 * **Decomposition** — Element agent receives the Shot's narrative
 * intent + the existing composition + available Cast portraits and
 * decides element kind + initial layout + which Slot (if any) the
 * Element references.
 * **Format gate** — element id unique within Shot; layout coords
 * in 0..1 for x/y; kind-specific required fields present (e.g.,
 * text-overlay needs text; image-plane needs source SlotRef).
 */
export function addElement(
  production: Production,
  sceneId: SceneId,
  shotId: ShotId,
  element: Element,
): Production {
  return mutateShot(production, sceneId, shotId, (shot) => {
    if (shot.elements.find((e) => e.id === element.id)) {
      throw new Error(`element id "${element.id}" exists in shot "${shotId}"`);
    }
    return { ...shot, elements: [...shot.elements, element] };
  });
}

/* ---- addCharacter --------------------------------------- */

/**
 * Add a character Element to an existing Shot's composition.
 *
 * **Schema slice** — CharacterElement (tier-neutral Element kind)
 * **Decomposition** — Character-composition agent receives the Shot
 * beat, Cast roster, and stage layout, selects a Cast member, chooses
 * cue-driven or dialogue-auto pose policy, and emits a character
 * Element with an on-stage initial_layout.
 * **Format gate** — element id unique within Shot; kind is character;
 * cast_id resolves in Production.characters; pose_policy is
 * cue-driven with a declared pose or dialogue-auto requiring idle and
 * speaking Cast pose_slots.
 * **Test corpus** — addCharacter(p,'s','a',{id:'duck-el',kind:'character',
 * cast_id:'duck',pose_policy:{mode:'dialogue-auto'},initial_layout:layout(...)})
 * appends that Element to Shot.elements[] without touching cues.
 */
export function addCharacter(
  production: Production,
  sceneId: SceneId,
  shotId: ShotId,
  characterElement: CharacterElement,
): Production {
  return addElement(production, sceneId, shotId, characterElement);
}

/* ---- characterEnter ------------------------------------- */

/**
 * Animate a character Element from off-stage to its declared layout.
 *
 * **Schema slice** — Shot.elements[] (character initial_layout) +
 * Shot.cues[] (TransformCue)
 * **Decomposition** — Blocking agent receives a character Element id,
 * entrance side, beat time, duration, and optional ease. It snapshots
 * the Element's declared initial_layout as the on-stage target,
 * computes the off-stage start position, stores that as the Element's
 * initial_layout, and appends one transform Cue back to the target.
 * **Format gate** — character Element exists in the Shot; kind is
 * character; initial_layout.position is declared; at >= 0;
 * duration_ms is non-negative; ease is a valid EaseCurve.
 * **Test corpus** — characterEnter(p,'s','a','duck-el',{from:'right',
 * at:0,duration_ms:600,ease:'easeOut'}) leaves duck-el starting just
 * off the right edge and adds a transform Cue to the original layout.
 */
export function characterEnter(
  production: Production,
  sceneId: SceneId,
  shotId: ShotId,
  characterElementId: ElementId,
  opts: {
    from: 'left' | 'right' | 'top' | 'bottom';
    at: number;
    duration_ms: number;
    ease?: EaseCurve;
  },
): Production {
  return mutateShot(production, sceneId, shotId, (shot) => {
    const character = characterElementInShot(shot, characterElementId);
    const targetLayout = declaredCharacterLayout(character);
    const startLayout = offstageLayout(targetLayout, opts.from);
    const ease = opts.ease === undefined ? 'easeOut' : opts.ease;
    const elements: Element[] = shot.elements.map((element) =>
      element.id === characterElementId ? { ...element, initial_layout: startLayout } : element,
    );
    return {
      ...shot,
      elements,
      cues: [
        ...(shot.cues ?? []),
        {
          kind: 'transform',
          element_id: characterElementId,
          at: opts.at,
          layout: targetLayout,
          transition: {
            duration_ms: opts.duration_ms,
            ease,
          },
        },
      ],
    };
  });
}

/* ---- characterExit -------------------------------------- */

/**
 * Animate a character Element from its current layout off-stage.
 *
 * **Schema slice** — Shot.cues[] (TransformCue + VisibilityCue)
 * **Decomposition** — Blocking agent receives a character Element id,
 * exit side, beat time, duration, and optional ease. It computes the
 * off-stage target from the Element's declared initial_layout, appends
 * a transform Cue to that target, then appends a visibility Cue at the
 * end of the move so downstream rendering omits the Element.
 * **Format gate** — character Element exists in the Shot; kind is
 * character; initial_layout.position is declared; to side is
 * left|right|top|bottom; duration_ms is non-negative.
 * **Test corpus** — characterExit(p,'s','a','duck-el',{to:'left',
 * at:2,duration_ms:400}) appends one transform Cue and one visibility
 * Cue with visible:false at 2.4 seconds.
 */
export function characterExit(
  production: Production,
  sceneId: SceneId,
  shotId: ShotId,
  characterElementId: ElementId,
  opts: {
    to: 'left' | 'right' | 'top' | 'bottom';
    at: number;
    duration_ms: number;
    ease?: EaseCurve;
  },
): Production {
  return mutateShot(production, sceneId, shotId, (shot) => {
    const character = characterElementInShot(shot, characterElementId);
    const targetLayout = offstageLayout(declaredCharacterLayout(character), opts.to);
    const ease = opts.ease === undefined ? 'easeIn' : opts.ease;
    return {
      ...shot,
      cues: [
        ...(shot.cues ?? []),
        {
          kind: 'transform',
          element_id: characterElementId,
          at: opts.at,
          layout: targetLayout,
          transition: {
            duration_ms: opts.duration_ms,
            ease,
          },
        },
        {
          kind: 'visibility',
          element_id: characterElementId,
          at: opts.at + opts.duration_ms / 1000,
          visible: false,
        },
      ],
    };
  });
}

/* ---- addCue ---------------------------------------------- */

/**
 * Append a Cue to a Shot.
 *
 * **Schema slice** — Cue (one of the discriminated kinds)
 * **Decomposition** — Cue-planning agent receives the Shot's
 * Elements + the VO line + the narrative intent. For each beat
 * inside the Shot where something should change visually, emit a
 * Cue. Common patterns: emphasize-one-dim-rest (transform with
 * scale+opacity), reveal (visibility), animate-along-camera-pan.
 * **Format gate** — at >= 0; at <= shot.duration (when set);
 * element_id resolves (unless spawn-cue creating it); transition
 * params non-negative.
 */
export function addCue(
  production: Production,
  sceneId: SceneId,
  shotId: ShotId,
  cue: Cue,
): Production {
  return mutateShot(production, sceneId, shotId, (shot) => ({
    ...shot,
    cues: [...(shot.cues ?? []), cue],
  }));
}

/* ---- addKeyframeCue ------------------------------------- */

/**
 * Append a transform keyframe Cue to a Shot.
 *
 * **Schema slice** — Shot.cues[] (TransformCue.transition)
 * **Decomposition** — Keyframe agent receives an Element id, target
 * Layout fields, beat time, duration_ms, and ease curve; it constructs
 * one transform Cue with transition populated, then delegates to addCue.
 * **Format gate** — at >= 0; at <= shot.duration when set; element_id
 * resolves in the Shot; layout contains absolute target values only;
 * duration_ms is non-negative; ease is linear|easeIn|easeOut|easeInOut|spring;
 * composition may only be additive when all same-field overlaps are additive.
 * **Test corpus** — addKeyframeCue(p,'s','a',{element_id:'card',
 * at:0,layout:{scale:1.2,opacity:1},duration_ms:600,ease:'easeOut'})
 * appends {kind:'transform',element_id:'card',transition:{duration_ms:600,
 * ease:'easeOut'}} to Shot.cues[].
 */
export function addKeyframeCue(
  production: Production,
  sceneId: SceneId,
  shotId: ShotId,
  cue: {
    id?: string;
    element_id: ElementId;
    at: number;
    layout: Layout;
    duration_ms: number;
    ease: EaseCurve;
    composition?: 'additive';
  },
): Production {
  return addCue(production, sceneId, shotId, {
    kind: 'transform',
    id: cue.id,
    element_id: cue.element_id,
    at: cue.at,
    layout: cue.layout,
    transition: {
      duration_ms: cue.duration_ms,
      ease: cue.ease,
    },
    composition: cue.composition,
  });
}

/* ---- setVO ----------------------------------------------- */

/**
 * Set or replace a Shot's voiceover track.
 *
 * **Schema slice** — VOTrack
 * **Decomposition** — Script agent emits the Line text. Cast-
 * assignment provides the speaker. The VO Slot id is derived from
 * (production_id, shot_id, "vo") deterministically so re-rendering
 * the same Shot updates the same Slot.
 * **Format gate** — line non-empty, ≤ 500 chars; speaker exists as
 * Cast in the Production; audio Slot id present.
 */
export function setVO(
  production: Production,
  sceneId: SceneId,
  shotId: ShotId,
  vo: VOTrack,
): Production {
  return mutateShot(production, sceneId, shotId, (shot) => ({ ...shot, vo }));
}

/* ---- addDialogue ---------------------------------------- */

/**
 * Append one dialogue segment to a Shot.
 *
 * **Schema slice** — Shot.dialogue[] (DialogueSegment)
 * **Decomposition** — Dialogue agent receives the beat-level script,
 * Cast assignment, and audio Slot plan, emits one ordered segment with
 * id, cast_id, line text, audio SlotRef, and optional duration
 * override. VO remains separate and plays before dialogue when both
 * are present.
 * **Format gate** — segment id unique within Shot.dialogue; cast_id
 * resolves in Production.characters; audio Slot id present; line text
 * non-empty; duration_override, when present, is positive.
 * **Test corpus** — addDialogue(p,'s','a',{id:'d1',cast_id:'duck',
 * line:{text:'Quack'},audio:{slot_id:'duck.line.1'}}) appends one
 * segment after any existing dialogue beats.
 */
export function addDialogue(
  production: Production,
  sceneId: SceneId,
  shotId: ShotId,
  segment: DialogueSegment,
): Production {
  return mutateShot(production, sceneId, shotId, (shot) => {
    const dialogue = shot.dialogue;
    if (dialogue !== undefined && dialogue.find((existing) => existing.id === segment.id)) {
      throw new Error(`dialogue id "${segment.id}" exists in shot "${shotId}"`);
    }
    return {
      ...shot,
      dialogue: [...(dialogue ?? []), segment],
    };
  });
}

/* ---- Asset Manifest ops --------------------------------- */

/**
 * Initialize an empty AssetManifest for a Production.
 */
export function newAssetManifest(production_id: ProductionId): AssetManifest {
  return {
    production_id,
    slots: {},
    ledger: [],
    updated_at: new Date().toISOString(),
  };
}

/**
 * Declare (or update) a Slot in an AssetManifest. Idempotent — if
 * the Slot exists its takes are merged (new takes appended).
 *
 * **Schema slice** — Slot
 * **Decomposition** — Asset-spec agent for a given Shot/Element
 * decides the Slot kind, writes a clear description (drives funding
 * chrome copy + image-gen prompts later), sets selection policy.
 * **Format gate** — id unique within manifest; description non-empty
 * 8–160 chars; kind valid.
 */
export function upsertSlot(manifest: AssetManifest, slot: Slot): AssetManifest {
  const prior = manifest.slots[slot.id];
  const merged: Slot = prior
    ? { ...prior, ...slot, takes: [...prior.takes, ...slot.takes.filter((t) => !prior.takes.find((p) => p.tier === t.tier))] }
    : slot;
  return {
    ...manifest,
    slots: { ...manifest.slots, [slot.id]: merged },
    updated_at: new Date().toISOString(),
  };
}

/**
 * Attach a rendered Take to a Slot. Marks status:'ready' unless
 * overridden. Used after gen-audio / gen-image renders successfully.
 *
 * **Schema slice** — Take
 * **Decomposition** — Asset-render step in a workflow graph. Receives
 * the Slot's spec + provider config (Kokoro/ElevenLabs/Codex-image/
 * Kling-i2v), produces the artifact, records cost + provenance.
 * **Format gate** — artifact has resolvable url/path; tier valid;
 * provenance.provider non-empty.
 */
export function attachTake(
  manifest: AssetManifest,
  slotId: SlotId,
  take: Take,
): AssetManifest {
  const slot = manifest.slots[slotId];
  if (!slot) throw new Error(`slot "${slotId}" not in manifest`);
  // Replace existing take at this tier or append
  const others = slot.takes.filter((t) => t.tier !== take.tier);
  const next: Slot = { ...slot, takes: [...others, { ...take, status: take.status ?? 'ready' }] };
  return {
    ...manifest,
    slots: { ...manifest.slots, [slotId]: next },
    updated_at: new Date().toISOString(),
  };
}

/* ---- Funding ops ---------------------------------------- */

/**
 * Append a ledger entry (spend or donation) to the FundingBlock + the
 * AssetManifest. Updates aggregate counters.
 */
export function appendLedger(
  production: Production,
  manifest: AssetManifest,
  entry: NonNullable<FundingBlock['ledger']>[number],
): { production: Production; manifest: AssetManifest } {
  const fund = production.funding;
  const nextFunding: FundingBlock = {
    ...fund,
    production_cost_usd:
      entry.kind === 'spend' ? fund.production_cost_usd + entry.amount_usd : fund.production_cost_usd,
    donations_received_usd:
      entry.kind === 'donation' ? fund.donations_received_usd + entry.amount_usd : fund.donations_received_usd,
    ledger: [...(fund.ledger ?? []), entry],
  };
  const nextManifest: AssetManifest = {
    ...manifest,
    ledger: [...(manifest.ledger ?? []), entry],
    updated_at: new Date().toISOString(),
  };
  return { production: { ...production, funding: nextFunding }, manifest: nextManifest };
}

/* ---- Layout helpers (used by Cue/Element authoring) ---- */

/** Build a Layout from common shorthand args. */
export function layout(args: {
  x?: number; y?: number; z?: number;
  width?: number; height?: number;
  rotation?: [number, number, number];
  scale?: number;
  opacity?: number;
  z_order?: number;
}): Layout {
  const out: Layout = {};
  if (args.x !== undefined || args.y !== undefined || args.z !== undefined) {
    out.position = [args.x ?? 0.5, args.y ?? 0.5, args.z ?? 0];
  }
  if (args.rotation) out.rotation = args.rotation;
  if (args.scale !== undefined) out.scale = args.scale;
  if (args.opacity !== undefined) out.opacity = args.opacity;
  if (args.z_order !== undefined) out.z_order = args.z_order;
  if (args.width !== undefined || args.height !== undefined) {
    out.size = { width: args.width ?? 0.5, height: args.height ?? 0.2 };
  }
  return out;
}

/* ---- internal --------------------------------------------- */

function mutateShot(
  production: Production,
  sceneId: SceneId,
  shotId: ShotId,
  fn: (shot: Shot) => Shot,
): Production {
  const scenes = production.scenes.map((s) =>
    s.id !== sceneId
      ? s
      : { ...s, shots: s.shots.map((sh) => (sh.id !== shotId ? sh : fn(sh))) },
  );
  return { ...production, scenes };
}

function characterElementInShot(shot: Shot, characterElementId: ElementId): CharacterElement {
  const element = shot.elements.find((candidate) => candidate.id === characterElementId);
  if (element === undefined) {
    throw new Error(`element id "${characterElementId}" not in shot "${shot.id}"`);
  }
  if (element.kind !== 'character') {
    throw new Error(`element id "${characterElementId}" is not a character Element`);
  }
  return element;
}

function declaredCharacterLayout(character: CharacterElement): Layout {
  const initialLayout = character.initial_layout;
  if (initialLayout === undefined) {
    throw new Error(`character "${character.id}" needs initial_layout for blocking commands`);
  }
  if (initialLayout.position === undefined) {
    throw new Error(`character "${character.id}" needs initial_layout.position for blocking commands`);
  }
  return initialLayout;
}

function offstageLayout(
  base: Layout,
  side: 'left' | 'right' | 'top' | 'bottom',
): Layout {
  const position = base.position;
  if (position === undefined) {
    throw new Error('offstageLayout requires base.position');
  }
  switch (side) {
    case 'left':
      return { ...base, position: [-0.2, position[1], position[2]] };
    case 'right':
      return { ...base, position: [1.2, position[1], position[2]] };
    case 'top':
      return { ...base, position: [position[0], -0.2, position[2]] };
    case 'bottom':
      return { ...base, position: [position[0], 1.2, position[2]] };
  }
  const exhaustive: never = side;
  return exhaustive;
}

/* ---- Re-exports for convenience ------------------------- */

export type { EaseCurve, ElementId, ShotId, SceneId, SlotId, Tier, TransitionEdge };
