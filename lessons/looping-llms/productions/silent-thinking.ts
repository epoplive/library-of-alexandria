/* ============================================================
   Scene 4 — "Thinking in silence"

   First Production authored against the lattice + Stage + command
   functions. Lives as data, not React code. The Playback component
   renders it.

   Authoring substeps + the tools they exercise:

     1. newProduction()      — Topic + Outline output (id, title, summary, tags)
     2. addCast()            — Cast-assignment output (narrator voice)
     3. addScene()           — Outline output (one Scene)
     4. addShot() + setVO()  — Storyboard + Script output, one Shot per
                                narrative beat with VO line + duration
     5. addElement()         — Element-composition output: what's on
                                stage during this Shot (text overlay
                                + shape "card" backgrounds for the two
                                approaches being compared)
     6. addCue()             — Cue-planning output: per-Shot transforms
                                that animate the chain-of-thought card
                                vs the looped-LM card as the narrator
                                switches focus
     7. upsertSlot() + attachTake() — Asset Manifest declares one Slot
                                per Shot's VO; gen-audio renders Kokoro
                                Takes; attachTake() wires them in.

   Each command's jsdoc captures the schema slice / decomposition /
   prompt sketch / format gate that future LLM agents will run.
   ============================================================ */

import {
  addCast,
  addCue,
  addElement,
  addScene,
  addShot,
  attachTake,
  layout,
  newAssetManifest,
  newProduction,
  setVO,
  upsertSlot,
} from '@/lib/loa-commands';
import type { AssetManifest, Production } from '@/lib/lattice';

const PROD_ID = 'silent-thinking';

const NARRATOR_VOICE_ID = 'af_bella';

/* ---- Build the Production data programmatically ----------- */

let p: Production = newProduction({
  id: PROD_ID,
  title: 'Thinking in silence',
  subtitle: 'Chain-of-thought vs. looped latent reasoning',
  summary:
    'Chain-of-thought reasoning emits visible tokens; looped LMs do the same kind of step internally, inside the forward pass, before they ever emit an answer.',
  tags: ['ai', 'reasoning', 'architecture'],
  authors: ['Library of Alexandria'],
});

p = addCast(p, {
  id: 'narrator',
  name: 'Narrator',
  description: 'Default lesson voice. Conversational, technically rigorous.',
  voice_profile: {
    service: 'kokoro',
    voice_id: NARRATOR_VOICE_ID,
  },
});

const SCENE_ID = 'silent-thinking';
p = addScene(p, {
  id: SCENE_ID,
  eyebrow: '04 · how loops reason',
  title: 'Thinking in silence',
  summary:
    'Compare the two ways modern models do reasoning at inference time — emitted chain-of-thought tokens vs. silent loops inside a single forward pass.',
  shots: [],
});

/* ---- The shots --------------------------------------------- */

interface ShotSpec {
  id: string;
  line: string;
  duration: number;     // seconds, calibrated to Kokoro speech rate ~14 chars/sec
  emphasis: 'cot' | 'latent' | 'both' | 'neither';
}

const SHOTS: ShotSpec[] = [
  {
    id: 'open',
    line:
      'When a normal language model reasons through a hard problem, it has to think out loud. Every intermediate step burns output tokens that stream across your screen.',
    duration: 12,
    emphasis: 'neither',
  },
  {
    id: 'cot-name',
    line:
      "That's chain-of-thought reasoning. Popularized in 2022 when Jason Wei at Google Brain showed that just adding 'let's think step by step' to a prompt massively improved arithmetic accuracy on benchmarks like GSM8K.",
    duration: 14,
    emphasis: 'cot',
  },
  {
    id: 'cot-now',
    line:
      "The technique is now the foundation of every reasoning model — OpenAI's o1, DeepSeek R1, Anthropic's extended thinking. The cost is visible. You see the model working.",
    duration: 12,
    emphasis: 'cot',
  },
  {
    id: 'pivot',
    line:
      'But a looped model does something stranger. It thinks silently, inside the forward pass, looping its own block over and over before emitting a single answer token. None of the intermediate reasoning surfaces.',
    duration: 14,
    emphasis: 'latent',
  },
  {
    id: 'latent-result',
    line:
      'The 2025 latent reasoning paper from EleutherAI showed eight internal loops can match twenty-two tokens of visible chain-of-thought on multi-hop benchmarks. Eight passes of the same block — no visible tokens — equivalent to a long emitted chain.',
    duration: 16,
    emphasis: 'latent',
  },
  {
    id: 'quietstar',
    line:
      "There's a parallel thread from Stanford called Quiet-STaR, where the model thinks token by token in silence — same target, different machinery.",
    duration: 11,
    emphasis: 'latent',
  },
  {
    id: 'thesis',
    line:
      'Both share the same thesis with looped LMs — that the cheapest form of compute is the kind that never leaves the network and never costs you an output token.',
    duration: 12,
    emphasis: 'both',
  },
  {
    id: 'caveat',
    line:
      'The big open question is whether silent reasoning ever genuinely surpasses verbalized reasoning. As of now the empirical answer is roughly: matches it cheaply on tasks the model already had the capacity for; doesn\'t unlock new capabilities the way scale does.',
    duration: 17,
    emphasis: 'both',
  },
];

/* ---- Visual composition shared across all shots ---------- */
/*
   Two "cards" — one for chain-of-thought, one for the looped model.
   A backdrop shape + a text overlay each. We add them once at the
   first Shot; downstream Shots carry them forward (Stage assumes
   elements live for the Shot they're declared in — for now we
   re-declare them per Shot until we add a Scene-level shared
   element-set primitive).
*/

function leftCard(elementsSuffix = ''): Parameters<typeof addElement>[3] {
  return {
    id: `cot-card${elementsSuffix}`,
    kind: 'shape',
    shape: 'rect',
    color: '#1e293b',
    initial_layout: layout({ x: 0.25, y: 0.45, width: 0.4, height: 0.55, scale: 1, opacity: 1, z_order: 0 }),
  };
}
function rightCard(elementsSuffix = ''): Parameters<typeof addElement>[3] {
  return {
    id: `latent-card${elementsSuffix}`,
    kind: 'shape',
    shape: 'rect',
    color: '#5b21b6',
    initial_layout: layout({ x: 0.75, y: 0.45, width: 0.4, height: 0.55, scale: 1, opacity: 1, z_order: 0 }),
  };
}
function leftLabel(): Parameters<typeof addElement>[3] {
  return {
    id: 'cot-label',
    kind: 'text-overlay',
    text: 'Chain-of-thought\n\nemits tokens',
    style: { font: 'display', size: '2xl', weight: 600, color: '#f1f5f9', align: 'center' },
    initial_layout: layout({ x: 0.25, y: 0.42, width: 0.36, height: 0.4, opacity: 1, z_order: 1 }),
  };
}
function rightLabel(): Parameters<typeof addElement>[3] {
  return {
    id: 'latent-label',
    kind: 'text-overlay',
    text: 'Looped LM\n\nthinks silently',
    style: { font: 'display', size: '2xl', weight: 600, color: '#f1f5f9', align: 'center' },
    initial_layout: layout({ x: 0.75, y: 0.42, width: 0.36, height: 0.4, opacity: 1, z_order: 1 }),
  };
}

/* ---- Build the shots loop ---------------------------------- */

function shotIdToSlotId(shotId: string): string {
  return `${PROD_ID}.shot.${shotId}.vo`;
}

let manifest: AssetManifest = newAssetManifest(PROD_ID);

for (const s of SHOTS) {
  const audioSlotId = shotIdToSlotId(s.id);

  // Declare the VO Slot (no Take attached yet — gen-audio fills it
  // when run; below we attach placeholder Takes if pre-rendered MP3s
  // exist for these exact lines).
  manifest = upsertSlot(manifest, {
    id: audioSlotId,
    kind: 'audio-vo',
    description: `VO for "${s.line.slice(0, 60)}…"`,
    takes: [],
  });

  // Add the Shot with default composition + VO track
  p = addShot(p, SCENE_ID, {
    id: s.id,
    duration: s.duration,
    elements: [leftCard(), rightCard(), leftLabel(), rightLabel()],
    vo: {
      cast_id: 'narrator',
      line: { text: s.line },
      audio: { slot_id: audioSlotId },
    },
  });

  // Per-shot cues — emphasize one card vs the other
  const emphLayout = layout({ scale: 1.05, opacity: 1 });
  const dimLayout = layout({ scale: 0.95, opacity: 0.4 });
  const evenLayout = layout({ scale: 1, opacity: 0.85 });

  if (s.emphasis === 'cot') {
    p = addCue(p, SCENE_ID, s.id, { kind: 'transform', element_id: 'cot-card', layout: emphLayout, at: 0.1 });
    p = addCue(p, SCENE_ID, s.id, { kind: 'transform', element_id: 'cot-label', layout: emphLayout, at: 0.1 });
    p = addCue(p, SCENE_ID, s.id, { kind: 'transform', element_id: 'latent-card', layout: dimLayout, at: 0.1 });
    p = addCue(p, SCENE_ID, s.id, { kind: 'transform', element_id: 'latent-label', layout: dimLayout, at: 0.1 });
  } else if (s.emphasis === 'latent') {
    p = addCue(p, SCENE_ID, s.id, { kind: 'transform', element_id: 'latent-card', layout: emphLayout, at: 0.1 });
    p = addCue(p, SCENE_ID, s.id, { kind: 'transform', element_id: 'latent-label', layout: emphLayout, at: 0.1 });
    p = addCue(p, SCENE_ID, s.id, { kind: 'transform', element_id: 'cot-card', layout: dimLayout, at: 0.1 });
    p = addCue(p, SCENE_ID, s.id, { kind: 'transform', element_id: 'cot-label', layout: dimLayout, at: 0.1 });
  } else if (s.emphasis === 'both') {
    p = addCue(p, SCENE_ID, s.id, { kind: 'transform', element_id: 'cot-card', layout: evenLayout, at: 0.1 });
    p = addCue(p, SCENE_ID, s.id, { kind: 'transform', element_id: 'latent-card', layout: evenLayout, at: 0.1 });
    p = addCue(p, SCENE_ID, s.id, { kind: 'transform', element_id: 'cot-label', layout: evenLayout, at: 0.1 });
    p = addCue(p, SCENE_ID, s.id, { kind: 'transform', element_id: 'latent-label', layout: evenLayout, at: 0.1 });
  }
  // 'neither' = leave initial layout alone
}

/* ---- Export the Production + Manifest --------------------- */

export const SILENT_THINKING: Production = p;
export const SILENT_THINKING_MANIFEST: AssetManifest = manifest;
export const SILENT_THINKING_LINES: ReadonlyArray<{ shotId: string; line: string; voiceId: string }> =
  SHOTS.map((s) => ({ shotId: s.id, line: s.line, voiceId: NARRATOR_VOICE_ID }));
