/* ============================================================
   Side-car: VO lines for the silent-thinking Production, in the
   format gen-audio.mjs already scans.

   Future tool-extraction: gen-audio.mjs reads Productions directly
   from src/lib/lattice.ts shapes and renders Slot Takes against
   the AssetManifest. Then this file goes away.

   For now: this side-car keeps the gen-audio regex working
   (narration: "...", speaker_id: "..."). The line text matches
   the Production's shot.vo.line.text byte-for-byte so the hash
   in lessons/looping-llms/audio/index.json matches what
   hydrateManifestFromAudio looks up.

   DO NOT EDIT — text is the source-of-truth in productions/silent-
   thinking.ts. If a line changes there, copy it here and re-run
   gen-audio.
   ============================================================ */

export const SILENT_THINKING_VO_BEATS = [
  {
    speaker_id: 'narrator',
    narration:
      'When a normal language model reasons through a hard problem, it has to think out loud. Every intermediate step burns output tokens that stream across your screen.',
  },
  {
    speaker_id: 'narrator',
    narration:
      "That's chain-of-thought reasoning. Popularized in 2022 when Jason Wei at Google Brain showed that just adding 'let's think step by step' to a prompt massively improved arithmetic accuracy on benchmarks like GSM8K.",
  },
  {
    speaker_id: 'narrator',
    narration:
      "The technique is now the foundation of every reasoning model — OpenAI's o1, DeepSeek R1, Anthropic's extended thinking. The cost is visible. You see the model working.",
  },
  {
    speaker_id: 'narrator',
    narration:
      'But a looped model does something stranger. It thinks silently, inside the forward pass, looping its own block over and over before emitting a single answer token. None of the intermediate reasoning surfaces.',
  },
  {
    speaker_id: 'narrator',
    narration:
      'The 2025 latent reasoning paper from EleutherAI showed eight internal loops can match twenty-two tokens of visible chain-of-thought on multi-hop benchmarks. Eight passes of the same block — no visible tokens — equivalent to a long emitted chain.',
  },
  {
    speaker_id: 'narrator',
    narration:
      "There's a parallel thread from Stanford called Quiet-STaR, where the model thinks token by token in silence — same target, different machinery.",
  },
  {
    speaker_id: 'narrator',
    narration:
      'Both share the same thesis with looped LMs — that the cheapest form of compute is the kind that never leaves the network and never costs you an output token.',
  },
  {
    speaker_id: 'narrator',
    narration:
      "The big open question is whether silent reasoning ever genuinely surpasses verbalized reasoning. As of now the empirical answer is roughly: matches it cheaply on tasks the model already had the capacity for; doesn't unlock new capabilities the way scale does.",
  },
];
