import type { Scene } from '@/lib/scene-timeline';

/* ============================================================
   When-it-wins scene — narrated walk through the 3 win-cases
   and 2 doesn't-help cases, then the history tangent.

   5 item layers in a vertical stack. Wins (3) on top half,
   doesn't-helps (2) below. Each beat highlights one item by
   opacity + scale, dimming the others. Closing beat restores all
   to equal weight before the history aside plays.
   ============================================================ */

const BASE_OPACITY = 0.5;

function itemLayer(args: {
  id: string;
  title: string;
  detail: string;
  y: number;
  signal: 'good' | 'bad';
}) {
  return {
    id: args.id,
    source: {
      kind: 'text' as const,
      text: `${args.title}\n${args.detail}`,
      style: {
        font: 'display' as const,
        size: 'lg' as const,
        weight: 500,
        align: 'left' as const,
        color: args.signal === 'good' ? 'var(--signal-good)' : 'var(--signal-bad)',
      },
    },
    initial_layout: {
      x: 0.08,
      y: args.y,
      width: 0.84,
      height: 0.12,
      opacity: BASE_OPACITY,
      scale: 1,
      z: 1,
    },
  };
}

export const WHEN_IT_WINS_TIMELINE: Scene = {
  id: 'when-it-wins',
  title: 'When it wins, when it doesn\'t',
  eyebrow: '11 · payoff matrix',
  start: 0,
  end: 130,
  layers: [
    itemLayer({
      id: 'win-arith',
      title: '∑  Iterative arithmetic',
      detail: 'long multiplication, modular math — same step, many times',
      y: 0.06,
      signal: 'good',
    }),
    itemLayer({
      id: 'win-multihop',
      title: '↬  Multi-hop reasoning',
      detail: 'chains of A → B → C — each hop is the same operation',
      y: 0.20,
      signal: 'good',
    }),
    itemLayer({
      id: 'win-traversal',
      title: '⌥  Traversal / search',
      detail: 'DFS, BFS, parse trees — recurrence over structure',
      y: 0.34,
      signal: 'good',
    }),
    itemLayer({
      id: 'lose-pattern',
      title: '✕  Pattern matching',
      detail: 'sentiment, classification — one pass is enough',
      y: 0.54,
      signal: 'bad',
    }),
    itemLayer({
      id: 'lose-frontier',
      title: '✕  Frontier scale (>70B)',
      detail: 'specialization beats sharing past a certain size',
      y: 0.68,
      signal: 'bad',
    }),
  ],
  beats: [
    {
      id: 'intro',
      at: 0,
      narration:
        'So when does this actually pay off? Looping wins on tasks with a step that repeats — arithmetic, multi-hop chains, traversal, parsing.',
    },
    {
      id: 'win-arith',
      at: 8,
      narration:
        'Iterative arithmetic — long multiplication, modular math. The shared block learns the step once. The loop counts how many times to apply it.',
      ops: [
        ...emphasize('win-arith'),
        ...dim(['win-multihop', 'win-traversal', 'lose-pattern', 'lose-frontier']),
      ],
    },
    {
      id: 'win-multihop',
      at: 20,
      narration:
        'Multi-hop reasoning. A → B → C. Each hop is structurally the same operation; that\'s the regime where running the same block multiple times genuinely buys you something.',
      ops: [
        ...emphasize('win-multihop'),
        ...dim(['win-arith', 'win-traversal', 'lose-pattern', 'lose-frontier']),
      ],
    },
    {
      id: 'win-traversal',
      at: 32,
      narration:
        'Traversal and search — depth-first, breadth-first, parse trees. Recurrence over a structure. Same pattern.',
      ops: [
        ...emphasize('win-traversal'),
        ...dim(['win-arith', 'win-multihop', 'lose-pattern', 'lose-frontier']),
      ],
    },
    {
      id: 'lose-pattern',
      at: 44,
      narration:
        'It does not help much on pattern matching that one forward pass can solve — sentiment classification doesn\'t care how deep your network is past a point.',
      ops: [
        ...emphasize('lose-pattern'),
        ...dim(['win-arith', 'win-multihop', 'win-traversal', 'lose-frontier']),
      ],
    },
    {
      id: 'lose-frontier',
      at: 56,
      narration:
        'And at frontier scale, beyond seventy billion parameters, unique-layer specialization starts to win again. Different layers learn different functions in big models; forcing them all to be the same block costs more than it saves.',
      ops: [
        ...emphasize('lose-frontier'),
        ...dim(['win-arith', 'win-multihop', 'win-traversal', 'lose-pattern']),
      ],
    },
    {
      id: 'history',
      at: 72,
      narration:
        'There\'s an interesting echo across the literature. In 1989, George Cybenko at Dartmouth proved the universal approximation theorem — a single-hidden-layer feedforward network with enough width can approximate any continuous function. Width can substitute for depth. Looped LMs are the depth-side dual of that result — depth can substitute for width, in the right regime.',
      ops: [
        ...restore(['win-arith', 'win-multihop', 'win-traversal', 'lose-pattern', 'lose-frontier']),
      ],
    },
    {
      id: 'wrap',
      at: 102,
      narration:
        'Both universality theorems share the same problem. They say absolutely nothing about how learnable the parameters are. That gap between what\'s representable in principle and what\'s trainable in practice is where all the interesting research lives.',
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
    layout: { opacity: 0.25, scale: 1 },
  }));
}

function restore(ids: string[]) {
  return ids.map((id) => ({
    kind: 'transform' as const,
    layer_id: id,
    layout: { opacity: BASE_OPACITY, scale: 1 },
  }));
}
