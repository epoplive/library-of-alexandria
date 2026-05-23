import type { Scene } from '@/lib/scene-timeline';

/* ============================================================
   Closing scene — recommended-reading walkthrough.

   Five book layers in a vertical stack. Each beat highlights one
   book by scaling + brightening it while dimming the others. The
   audio is broken into one narration per book, plus an intro and
   closing beat.

   Layer ids book-1 … book-5 are addressed by transform ops; no
   interactive layer (no game in this scene). Placeholder text-only
   for now — a real character sprite + book covers come later when
   the media-block pipeline lands.
   ============================================================ */

const BOOK_BASE_OPACITY = 0.5;

function bookLayer(args: {
  id: string;
  title: string;
  byline: string;
  y: number;
}) {
  return {
    id: args.id,
    source: {
      kind: 'text' as const,
      text: `${args.title}\n${args.byline}`,
      style: {
        font: 'display' as const,
        size: 'xl' as const,
        weight: 500,
        align: 'left' as const,
      },
    },
    initial_layout: {
      x: 0.08,
      y: args.y,
      width: 0.84,
      height: 0.12,
      opacity: BOOK_BASE_OPACITY,
      scale: 1,
      z: 1,
    },
  };
}

export const CLOSING_TIMELINE: Scene = {
  id: 'closing',
  title: 'Where to go next',
  eyebrow: '12 · reading list',
  start: 0,
  end: 90,
  layers: [
    bookLayer({
      id: 'book-1',
      title: 'Universal Transformer',
      byline: 'Dehghani et al · Google Brain · 2018',
      y: 0.10,
    }),
    bookLayer({
      id: 'book-2',
      title: 'Deep Equilibrium Models',
      byline: 'Bai, Kolter, Koltun · CMU · 2019',
      y: 0.25,
    }),
    bookLayer({
      id: 'book-3',
      title: 'Looped Transformers as Programmable Computers',
      byline: 'Yang, Lee, Papailiopoulos, Lee · ICML · 2024',
      y: 0.42,
    }),
    bookLayer({
      id: 'book-4',
      title: 'Scaling Latent Reasoning',
      byline: 'EleutherAI · 2025',
      y: 0.59,
    }),
    bookLayer({
      id: 'book-5',
      title: 'Mechanistic Circuits in Looped Transformers',
      byline: 'follow-up empirical work · 2026',
      y: 0.74,
    }),
  ],
  beats: [
    {
      id: 'intro',
      at: 0,
      narration: "Five papers, in the order I'd read them.",
    },
    {
      id: 'paper-1',
      at: 4,
      narration:
        "Start with Mostafa Dehghani's Universal Transformer from 2018. It's the source paper, and it sets up both the depth-recurrence idea and the adaptive halting machinery in one go.",
      ops: [
        ...emphasize('book-1'),
        ...dim(['book-2', 'book-3', 'book-4', 'book-5']),
      ],
    },
    {
      id: 'paper-2',
      at: 18,
      narration:
        "Next, Shaojie Bai's 2019 Deep Equilibrium Models paper, for the mathematical depth — especially the implicit differentiation trick that lets you backpropagate through a fixed point without storing any intermediate states.",
      ops: [
        ...emphasize('book-2'),
        ...dim(['book-1', 'book-3', 'book-4', 'book-5']),
      ],
    },
    {
      id: 'paper-3',
      at: 35,
      narration:
        "Then Yang et al 2024, Looped Transformers as Programmable Computers, for the theoretical capacity argument — looped transformers can in principle simulate any program, with explicit constructions for in-context gradient descent and small instruction sets.",
      ops: [
        ...emphasize('book-3'),
        ...dim(['book-1', 'book-2', 'book-4', 'book-5']),
      ],
    },
    {
      id: 'paper-4',
      at: 52,
      narration:
        "The 2025 paper from EleutherAI on scaling latent reasoning is the modern empirical work, with real benchmark numbers from real model sizes and a clean ablation of K against task type.",
      ops: [
        ...emphasize('book-4'),
        ...dim(['book-1', 'book-2', 'book-3', 'book-5']),
      ],
    },
    {
      id: 'paper-5',
      at: 68,
      narration:
        "And finally, the 2026 mechanistic analysis paper — it reverse-engineers what the loops are actually computing internally by reading the circuits trained looped networks converge to.",
      ops: [
        ...emphasize('book-5'),
        ...dim(['book-1', 'book-2', 'book-3', 'book-4']),
      ],
    },
    {
      id: 'wrap',
      at: 82,
      narration:
        "Those five papers, in that order, take you from foundations to frontier. Each name and concept in this lesson is a clickable rabbit hole — generate a full lesson on any of them to keep going deeper.",
      ops: [
        ...restore(['book-1', 'book-2', 'book-3', 'book-4', 'book-5']),
      ],
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
    layout: { opacity: BOOK_BASE_OPACITY, scale: 1 },
  }));
}
