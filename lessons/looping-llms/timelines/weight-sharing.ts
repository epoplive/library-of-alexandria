import type { Scene } from '@/lib/scene-timeline';

/* ============================================================
   Weight-sharing scene — narrated walk through the 3 sharing
   patterns: full / attention-only / MLP-only. Same emphasize-
   one-dim-rest pattern as closing + when-it-wins.
   ============================================================ */

const BASE_OPACITY = 0.55;

function schemeLayer(args: {
  id: string;
  name: string;
  meta: string;
  attnShared: boolean;
  mlpShared: boolean;
  y: number;
}) {
  return {
    id: args.id,
    source: {
      kind: 'text' as const,
      text:
        `${args.name}  ·  ${args.meta}\n` +
        `attention ${args.attnShared ? 'shared' : 'unique'}  ·  mlp ${args.mlpShared ? 'shared' : 'unique'}`,
      style: {
        font: 'display' as const,
        size: 'lg' as const,
        weight: 500,
        align: 'left' as const,
      },
    },
    initial_layout: {
      x: 0.08,
      y: args.y,
      width: 0.84,
      height: 0.14,
      opacity: BASE_OPACITY,
      scale: 1,
      z: 1,
    },
  };
}

export const WEIGHT_SHARING_TIMELINE: Scene = {
  id: 'weight-sharing',
  title: 'What actually gets shared',
  eyebrow: '08 · sharing patterns',
  start: 0,
  end: 140,
  layers: [
    schemeLayer({
      id: 'full',
      name: 'Full sharing',
      meta: 'Universal Transformer · Dehghani 2018',
      attnShared: true,
      mlpShared: true,
      y: 0.08,
    }),
    schemeLayer({
      id: 'attn',
      name: 'Attention-shared',
      meta: 'recent variants',
      attnShared: true,
      mlpShared: false,
      y: 0.30,
    }),
    schemeLayer({
      id: 'mlp',
      name: 'MLP-shared',
      meta: 'less common',
      attnShared: false,
      mlpShared: true,
      y: 0.52,
    }),
  ],
  beats: [
    {
      id: 'intro',
      at: 0,
      narration:
        'Sharing the whole block is the cleanest version — that\'s what Mostafa Dehghani\'s team at Google Brain did with Universal Transformer back in 2018. But you can be more surgical.',
    },
    {
      id: 'full',
      at: 14,
      narration:
        'Full sharing. Both the attention pattern and the MLP weights are shared across every K loop iteration. Most parameter-efficient. The default for the Universal Transformer architecture.',
      ops: [...emphasize('full'), ...dim(['attn', 'mlp'])],
    },
    {
      id: 'attn',
      at: 32,
      narration:
        'Attention-shared. Reuse the same attention pattern across loops, but each loop gets its own MLP. Reasoning-style refinement — the model attends the same way each pass but transforms differently.',
      ops: [...emphasize('attn'), ...dim(['full', 'mlp'])],
    },
    {
      id: 'mlp',
      at: 52,
      narration:
        'MLP-shared. Each loop attends fresh — different attention pattern per iteration — but reuses the same MLP. Better for tasks where position-specific routing matters more than the per-step transform.',
      ops: [...emphasize('mlp'), ...dim(['full', 'attn'])],
    },
    {
      id: 'tradeoffs',
      at: 76,
      narration:
        'Each choice trades parameter efficiency for representational flexibility. Modern variants in 2024 and 2025 are exploring all three sharing patterns. Full sharing is still the most common default, partly because it\'s the most parameter-efficient, partly because it composes cleanly with adaptive halting.',
      ops: [...restore(['full', 'attn', 'mlp'])],
    },
    {
      id: 'history',
      at: 102,
      narration:
        'The 2018 paper used full sharing and matched LSTM baselines on bAbI reasoning tasks. Universal Transformer\'s claim to fame was solving bAbI fully where vanilla transformers stalled — the first concrete hint that recurrence helps specifically on tasks with algorithmic structure. The paper was largely ignored at the time, overshadowed by BERT and GPT-1 launching the same year, and only rediscovered when latent reasoning got hot in 2024.',
    },
  ],
};

function emphasize(id: string) {
  return [
    {
      kind: 'transform' as const,
      layer_id: id,
      layout: { opacity: 1, scale: 1.04 },
    },
  ];
}

function dim(ids: string[]) {
  return ids.map((id) => ({
    kind: 'transform' as const,
    layer_id: id,
    layout: { opacity: 0.22, scale: 1 },
  }));
}

function restore(ids: string[]) {
  return ids.map((id) => ({
    kind: 'transform' as const,
    layer_id: id,
    layout: { opacity: BASE_OPACITY, scale: 1 },
  }));
}
