/* ============================================================
   Looped LMs — full-lesson Production.

   The whole lesson, expressed as one Production with one playhead.
   12 Scenes (one per current Section), most with a single Shot whose
   VO is the section's full narration. Scene 4 carries 8 Shots from
   the silent-thinking lattice port so on-stage emphasis Cues fire
   as the narrator switches between chain-of-thought vs latent
   approaches.

   This file is the substrate that p1-port-sections targets. Today
   each Shot has minimal Stage composition (title + eyebrow text).
   p1-port-games will register the games (Banach, Halt, KVCache,
   ComputeAllocator, GradientSurgeon, BuildYourTransformer,
   ForwardPassSim) as interactive-group Elements on the relevant
   Shots. Until then, the lesson plays end-to-end as one movie with
   transcript sentence-sync + Production-wide scrubber via Chrome.
   ============================================================ */

import {
  addCast,
  addElement,
  addScene,
  addShot,
  layout,
  newAssetManifest,
  newProduction,
  upsertSlot,
} from '@/lib/loa-commands';
import type { AssetManifest, Production, Shot } from '@/lib/lattice';
import { SILENT_THINKING } from './silent-thinking';

const PROD_ID = 'looping-llms';
const NARRATOR_VOICE_ID = 'af_bella';

interface SectionSpec {
  id: string;
  eyebrow: string;
  title: string;
  narration: string;
  /** Optional component_id for an interactive-group Element added by
   *  p1-port-games. Until games are wired, this is a hint only. */
  game?: string;
}

const SECTIONS: SectionSpec[] = [
  {
    id: 'transformer-build',
    eyebrow: '01 · puzzle',
    title: 'Build a looped transformer',
    game: 'build-transformer',
    narration:
      "Every modern AI architecture starts by deciding one thing — how deep to build. The standard playbook since Ashish Vaswani and his team published Attention is All You Need at Google Brain in June 2017 has been to stack more unique layers and pay the parameter cost. GPT-3 went ninety-six layers. Llama 3's largest variant has one hundred twenty-six. The frontier just keeps stacking. But there's a side path that doesn't get talked about as much. Use fewer unique blocks, and just run them again. The idea isn't new — it descends straight from recurrent neural networks, which Jeff Elman first applied to language all the way back in 1990 at UCSD. Same set of weights, fired over and over, building representation through repetition rather than novelty. Now try it. The puzzle is to hit an effective depth of twenty-four. M is how many unique transformer blocks you bring. K is how many times each one fires. There are many valid combinations — M=1 with K=24, M=8 with K=3, and everything between. Each trade-off is real. Parameter cost stays at M. Compute cost grows linearly with K. Inference latency, memory pressure, the things you actually care about — all depend on which combination wins.",
  },
  {
    id: 'forward-pass',
    eyebrow: '02 · puzzle',
    title: 'Run the forward pass yourself',
    game: 'forward-pass',
    narration:
      "Here's where it gets concrete. Inside a looped block, the weights themselves are frozen across iterations. What does change is the hidden state — the vector of activations being passed through. Click run-next-loop. The bars on the left are the input state. The bars on the right are what the same block produces. Now click again. The output of the last loop becomes the input of the next. Watch how the state stabilizes after a few passes — that's the model literally reasoning in latent space, one fixed step at a time. The math here is the same problem Sepp Hochreiter analyzed in his 1991 master's thesis at TU Munich, when he discovered what we now call the vanishing gradient problem. Multiplying by the same weight matrix repeatedly is what makes training a stack of K loops hard — small changes either compound out of control or fade to nothing. Hochreiter's solution six years later, with Jürgen Schmidhuber, was the LSTM — gating machinery that lets signal survive long iteration chains. Modern looped LMs don't use LSTM-style gates. They fight the same problem with normalization layers, careful weight initialization, and gradient checkpointing. The mechanism on screen is identical to an RNN unrolled — just for depth instead of for time.",
  },
  {
    id: 'banach',
    eyebrow: '03 · puzzle',
    title: "Banach's theorem, in your hands",
    game: 'banach',
    narration:
      "Here's a question that sounds almost too simple. If you take a function and apply it to a number, then apply it again to the result, then again — do you eventually settle on something? In 1922, a young Polish mathematician named Stefan Banach proved the answer is yes, as long as the function is a contraction map — meaning every time you apply it, the points it produces get strictly closer to each other than they started. The result is now called the Banach fixed-point theorem, and the proof fits on a page. But that one-page proof is the mathematical bedrock under every looped language model, every Deep Equilibrium Model, and even most of the numerical ODE solvers your physics simulations are using right now. Banach himself died young, of cancer, in Soviet-occupied Lviv in 1945. The school of mathematics he led used to meet in a café called the Scottish Café, and they wrote unsolved problems in a notebook with prizes attached — including, famously, a live goose for problem 153. The math you're about to play with came out of those meetings. Here's the setup. The green dot is z-star — the fixed point you're trying to reach. The function f is shown as a vector field. Drag z-naught anywhere on the plane. Pick K, the number of times to iterate. Some functions converge fast; some slowly; some spiral; one diverges entirely. There are four levels. Level one — find the equilibrium of a single f. Level two — three candidate f's, pick the one that converges fastest. Level three — set K precisely to reach within tolerance epsilon. Level four is the real DEQ design problem. You're given a compute budget, two candidate f's with different per-loop costs, and you have to choose both f and K to hit the target. The cheapest path through that compute budget is what Shaojie Bai's 2019 PhD work at CMU showed how to find analytically, without iterating at all — that's what Deep Equilibrium Models do.",
  },
  // Scene 4 (Thinking in silence) is lifted from SILENT_THINKING below
  {
    id: 'gradient-surgery',
    eyebrow: '05 · puzzle',
    title: 'Gradient surgery',
    game: 'gradient-surgeon',
    narration:
      "Looping isn't free at training time. The same set of weights gets touched K times in one forward pass — and during backpropagation, they get blamed K times. All those gradient contributions sum into the same parameter update. The failure modes are well-known: exploding gradients when the spectral radius of the Jacobian drifts above one, vanishing gradients when it falls below, and out-of-memory crashes when K-fold activation storage exceeds your VRAM. Each one shows up as a different curve shape in your training log. Now you're the gradient surgeon. Three broken training runs are waiting for you — one that explodes mid-training, one that plateaus and never recovers, and one that crashes from memory pressure. For each, you'll diagnose the failure and apply one of five mitigations. Scaled initialization keeps the spectral radius near one. Layer normalization at the loop boundary resets state magnitude between iterations. Gradient clipping caps the explosion at the cost of masking root cause. Gradient checkpointing — Tianqi Chen's 2016 trick — recomputes activations on backward instead of storing them. And lowering K avoids the issue by giving up depth. The right mitigation depends on the failure. Pick wrong and the curve doesn't recover.",
  },
  {
    id: 'compute-allocation',
    eyebrow: '06 · puzzle',
    title: 'Allocate your compute',
    game: 'compute-allocator',
    narration:
      "Looping is one of several ways to spend inference compute. Chain-of-thought spends tokens. Mixture-of-experts spends parameters per token. Speculative decoding spends draft-model FLOPs to batch more verifier work. Loops spend depth. The frontier labs are quietly building all four. Different query types reward different allocations — a factual lookup gets nothing from extra reasoning, but it benefits from the right specialized expert. A multi-hop chain wants loops or chain-of-thought. Code generation wants width and throughput. Creative writing wants varied generation. Now play it. Five query types come in sequentially. You have a budget of one hundred compute units per query. Distribute them across the four paradigms. Watch the predicted accuracy update as you allocate. Submit each query when remaining hits zero. At the end you get scored against the optimal mix per query — and your run total against the optimal portfolio.",
  },
  {
    id: 'training-tax',
    eyebrow: '07',
    title: 'The training tax',
    narration:
      "Here's the cost most papers downplay. Looping K times means K forward passes per training step — and K backward passes through the exact same weights. Activation memory normally scales with K too, because backpropagation through time needs every intermediate state to compute gradients. A K-equals-eight looped model costs roughly eight times the training compute of a single-block model, even though it has eight times fewer parameters. The net is an unusual trade. Cheap at inference once trained, expensive to train in the first place. It's the opposite of mixture-of-experts, where you can swell the total parameter count without paying per-token FLOPs, but you have to load the whole model into VRAM at inference time. DeepSeek-V3 is the modern example — 671 billion total parameters, only 37 billion active per token. Gradient checkpointing fixes the looped-LM memory blowup at the cost of recomputing activations on the backward pass — about thirty percent extra wall-clock for the privilege. The training-cost asymmetry is why looped LMs haven't shown up at frontier scale yet, even though they're competitive at one to three billion parameters. Anyone with frontier compute spends it on more unique parameters instead of training cycles.",
  },
  {
    id: 'weight-sharing',
    eyebrow: '08',
    title: 'What actually gets shared',
    narration:
      "Sharing the whole block is the cleanest version — that's what Mostafa Dehghani's team at Google Brain did with Universal Transformer back in 2018. But you can be more surgical. Share just the attention weights, and the multilayer perceptron — the MLP — can still specialize per loop iteration. Or share just the MLP, and attention stays unique at each iteration. Each choice trades parameter efficiency for representational flexibility. The 2018 paper used full sharing and matched LSTM baselines on bAbI reasoning tasks. Modern variants in 2024 and 2025 are exploring all three sharing patterns. Full sharing is still the most common default, partly because it's the most parameter-efficient, partly because it composes cleanly with adaptive halting. The bAbI benchmark Dehghani's team used was a set of twenty synthetic reading-comprehension tasks released by Facebook AI Research in 2015 — the standard reasoning testbed before LLMs made larger benchmarks like MMLU and HellaSwag the norm. Universal Transformer's claim to fame was solving bAbI fully where vanilla transformers stalled — the first concrete hint that recurrence helps specifically on tasks with algorithmic structure. The paper was largely ignored at the time, overshadowed by BERT and GPT-1 launching the same year, and only rediscovered when latent reasoning got hot in 2024.",
  },
  {
    id: 'halting-head',
    eyebrow: '09 · puzzle',
    title: "You're the halting head",
    game: 'halt',
    narration:
      "Not every problem deserves eight loops. A chess engine doesn't think for the same amount of time on every move. A grandmaster spends seconds on a forced capture and minutes on a closed positional decision. Adaptive halting gives a looped LM the same kind of dynamic compute allocation. A tiny head sits on top of the network and emits a stop probability at each iteration. The training signal is a careful trade-off — a ponder cost penalizes extra iterations, but answer-loss penalizes early termination. The math comes from Alex Graves's 2016 paper Adaptive Computation Time, written while he was at DeepMind. Graves is one of the most underrated architects in deep learning — he also invented connectionist temporal classification, the algorithm that powers every speech recognition system, and Neural Turing Machines, the direct ancestor of attention. Now you play the halting head. Three problems of varying difficulty. Watch the internal confidence at each iteration and click halt when you think the model has it. Halt too early, you get the wrong answer. Halt too late, you wasted compute. Both are penalized in real ACT training. The optimal policy is exactly what the halting head converges to — minimize compute, maximize correctness, find the trade-off that fits your task.",
  },
  {
    id: 'kv-cache',
    eyebrow: '10 · puzzle',
    title: 'The KV-cache tax',
    game: 'kv-cache',
    narration:
      "Here's the gotcha that catches everyone implementing this. The KV cache — the data structure that makes long-context inference fast by remembering keys and values from previous tokens — does not shrink when you loop. Visiting the same three blocks eight times still requires twenty-four separate stacks of cached attention, because each visit is attending over a different hidden state. Looping saves parameter memory. It does NOT save cache memory. At long context, that's where the bill actually comes due. The formula is two times the number of effective layers times sequence length times hidden dimension times bytes per element. For a model at one hundred twenty-eight thousand sequence length, four thousand hidden, and bfloat16 precision, with twenty-four effective layers, you're looking at roughly fifty gigabytes of cache per request. That's why frontier inference is bottlenecked on memory bandwidth, not raw FLOPs. There are research variants that share the cache across loop iterations — sometimes called token-recurrent or cross-iteration architectures — but they trade memory for representational expressiveness. DeepSeek's multi-head latent attention is a different approach to the same problem, compressing the cache via low-rank projection. The cache-sharing question is one of the most active design choices in late-2024 and 2025 looped-LM research. Drag the sliders below. Watch how cache memory scales with sequence length and effective depth — regardless of whether you got that depth from stacking or looping.",
  },
  {
    id: 'when-it-wins',
    eyebrow: '11',
    title: "When it wins, when it doesn't",
    narration:
      "So when does this actually pay off? Looping wins on tasks with a step that repeats — arithmetic, multi-hop chains, traversal, parsing. The shared block learns the step once, and the loop counts how many times to apply it. It does not help much on pattern matching that one forward pass can solve — sentiment classification doesn't care how deep your network is past a point. And at frontier scale, beyond seventy billion parameters, unique-layer specialization starts to win again. Different layers learn different functions in big models; forcing them all to be the same block costs more than it saves. There's an interesting echo across the literature. In 1989, George Cybenko at Dartmouth proved the universal approximation theorem — a single-hidden-layer feedforward network with enough width can approximate any continuous function. Kurt Hornik extended it in 1991. Width can substitute for depth. Looped LMs are the depth-side dual of that result — depth can substitute for width, in the right regime. The 2024 paper by Yang et al titled Looped Transformers as Programmable Computers extends this dual all the way: looped transformers can in principle simulate any Turing machine. But both universality theorems share the same problem. They say absolutely nothing about how learnable the parameters are. That gap between what's representable in principle and what's trainable in practice is where all the interesting research lives.",
  },
  {
    id: 'closing',
    eyebrow: '12',
    title: 'Where to go next',
    narration:
      "Five papers, in the order I'd read them. Start with Mostafa Dehghani's Universal Transformer from 2018 — that's the source paper, and it sets up both the depth-recurrence idea and the adaptive halting machinery in one go. Next, Shaojie Bai's 2019 Deep Equilibrium Models paper, for the mathematical depth — especially the implicit differentiation trick that lets you backpropagate through a fixed point without storing any intermediate states. Then Yang et al 2024, Looped Transformers as Programmable Computers, for the theoretical capacity argument — looped transformers can in principle simulate any program, with explicit constructions for in-context gradient descent and small instruction sets. The 2025 paper from EleutherAI on scaling latent reasoning is the modern empirical work, with real benchmark numbers from real model sizes and a clean ablation of K against task type. And finally, the 2026 mechanistic analysis paper — it reverse-engineers what the loops are actually computing internally, by reading the circuits trained looped networks converge to. Those five papers, in that order, take you from foundations to frontier. Each name and concept in this lesson is a clickable rabbit hole — generate a full lesson on any of them to keep going deeper. The graph of lessons grows wherever your curiosity pulls.",
  },
];

/* ---- Estimate Shot duration from narration length --------- */
// Kokoro at default rate emits ~14 chars / sec. Round up + 1s pad.
function estimateDuration(text: string): number {
  return Math.ceil(text.length / 14) + 1;
}

/* ---- Stage composition for a narrative Scene -------------- */
function eyebrowOverlay(sceneId: string, text: string): Parameters<typeof addElement>[3] {
  return {
    id: `${sceneId}.eyebrow`,
    kind: 'text-overlay',
    text,
    style: {
      font: 'mono',
      size: 'xs',
      weight: 500,
      color: '#94a3b8',
      align: 'left',
    },
    initial_layout: layout({ x: 0.08, y: 0.12, width: 0.84, height: 0.05, opacity: 1, z_order: 1 }),
  };
}

function titleOverlay(sceneId: string, text: string): Parameters<typeof addElement>[3] {
  return {
    id: `${sceneId}.title`,
    kind: 'text-overlay',
    text,
    style: {
      font: 'display',
      size: '4xl',
      weight: 600,
      color: '#f8fafc',
      align: 'left',
    },
    initial_layout: layout({ x: 0.08, y: 0.22, width: 0.84, height: 0.18, opacity: 1, z_order: 1 }),
  };
}

function gamePlaceholder(sceneId: string, componentId: string): Parameters<typeof addElement>[3] {
  return {
    id: `${sceneId}.placeholder`,
    kind: 'text-overlay',
    text: `interactive · ${componentId}\n\np1-port-games wires this in`,
    style: {
      font: 'mono',
      size: 'sm',
      color: '#475569',
      align: 'center',
    },
    initial_layout: layout({ x: 0.5, y: 0.6, width: 0.6, height: 0.3, opacity: 0.7, z_order: 0 }),
  };
}

/* ---- Build the Production -------------------------------- */

let p: Production = newProduction({
  id: PROD_ID,
  title: 'Looped Language Models',
  subtitle: 'Depth through repetition, not new layers — Banach to DEQ to 2025 latent reasoning.',
  summary:
    'Twelve scenes on weight-shared depth in language models — from Banach fixed points to 2025 latent reasoning. Plays as one movie; interactives port in p1-port-games.',
  tags: ['ai', 'architecture', 'research'],
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

let manifest: AssetManifest = newAssetManifest(PROD_ID);

function appendNarrativeScene(spec: SectionSpec) {
  const sceneId = spec.id;
  const shotId = `${sceneId}.s1`;
  const slotId = `${PROD_ID}.shot.${shotId}.vo`;

  p = addScene(p, {
    id: sceneId,
    eyebrow: spec.eyebrow,
    title: spec.title,
    summary: spec.title,
    shots: [],
  });

  manifest = upsertSlot(manifest, {
    id: slotId,
    kind: 'audio-vo',
    description: `VO for ${spec.title}`,
    takes: [],
  });

  const elements: Parameters<typeof addElement>[3][] = [
    eyebrowOverlay(sceneId, spec.eyebrow),
    titleOverlay(sceneId, spec.title),
  ];
  if (spec.game) elements.push(gamePlaceholder(sceneId, spec.game));

  p = addShot(p, sceneId, {
    id: shotId,
    duration: estimateDuration(spec.narration),
    elements: elements as Shot['elements'],
    vo: {
      cast_id: 'narrator',
      line: { text: spec.narration },
      audio: { slot_id: slotId },
    },
  });
}

/* Scenes 01-03 */
appendNarrativeScene(SECTIONS[0]);
appendNarrativeScene(SECTIONS[1]);
appendNarrativeScene(SECTIONS[2]);

/* Scene 04 — lift the silent-thinking Scene + Shots wholesale */
{
  const sourceScene = SILENT_THINKING.scenes[0];
  p = addScene(p, {
    id: sourceScene.id,
    eyebrow: sourceScene.eyebrow,
    title: sourceScene.title,
    summary: sourceScene.summary,
    shots: [],
  });
  for (const sh of sourceScene.shots) {
    // Each Shot keeps its own VO Slot ref — declare the matching Slot in
    // our manifest so the hydrator can populate it.
    if (sh.vo) {
      manifest = upsertSlot(manifest, {
        id: sh.vo.audio.slot_id,
        kind: 'audio-vo',
        description: `VO for ${sh.id}`,
        takes: [],
      });
    }
    // Re-use Cue/Element data verbatim by calling addShot then patching
    // cues + elements (addShot drops cues + complex elements otherwise).
    p = addShot(p, sourceScene.id, {
      id: sh.id,
      duration: sh.duration,
      elements: sh.elements,
      vo: sh.vo,
      cues: sh.cues,
    });
  }
}

/* Scenes 05-12 */
appendNarrativeScene(SECTIONS[3]);
appendNarrativeScene(SECTIONS[4]);
appendNarrativeScene(SECTIONS[5]);
appendNarrativeScene(SECTIONS[6]);
appendNarrativeScene(SECTIONS[7]);
appendNarrativeScene(SECTIONS[8]);
appendNarrativeScene(SECTIONS[9]);
appendNarrativeScene(SECTIONS[10]);

/* ---- Exports -------------------------------------------- */
export const LOOPING_LLMS: Production = p;
export const LOOPING_LLMS_MANIFEST: AssetManifest = manifest;
