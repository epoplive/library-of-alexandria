import type { Scene } from '@/lib/scene-timeline';

/**
 * Banach scene timeline — guided demo of the Fixed-Point Hunter puzzle.
 *
 * Each beat narrates one step and (optionally) drives the FPH game via
 * its imperative ref. Method names map to FixedPointHunterHandle:
 *   setLevel(n), setZ0([x,y]), setK(n), setFunction(id), submit(), reset()
 *
 * Designed for the SEQUENCE clock — beats play one after another, audio
 * advances on its own. Total runtime is ~2.5–3 min of narrated demo.
 */
export const BANACH_TIMELINE: Scene = {
  id: 'banach',
  title: "Banach's theorem, in your hands",
  eyebrow: '03 · puzzle',
  start: 0,
  end: 180,
  component_id: 'FixedPointHunter',
  beats: [
    {
      id: 'intro',
      at: 0,
      narration:
        "Here's a question that sounds almost too simple. If you take a function and apply it to a number, then apply it again to the result, then again — do you eventually settle on something?",
      action: { method: 'reset' },
    },
    {
      id: 'banach-history',
      at: 12,
      narration:
        "In 1922, a young Polish mathematician named Stefan Banach proved that the answer is yes — as long as the function is a contraction map, one that strictly brings every pair of points closer together. The result fits in a one-page proof and underpins every looped language model on screens today.",
    },
    {
      id: 'show-level-1',
      at: 30,
      narration:
        'Watch what that looks like. The green dot is the fixed point — call it z-star. The little goose is z-naught. Each iteration applies the same function. The goose drifts toward home.',
      action: { method: 'setLevel', args: [0] },
    },
    {
      id: 'drag-corner',
      at: 42,
      narration:
        "Alright, watch this. I'll start far from home, way down in the bottom-left. K equals twelve flaps.",
      speaker_id: 'banach-goose',
      action: { method: 'setZ0', args: [[-1.8, -1.8]] },
    },
    {
      id: 'set-K-12',
      at: 50,
      narration: 'Twelve flaps should do it. Hit submit.',
      speaker_id: 'banach-goose',
      action: { method: 'setK', args: [12] },
    },
    {
      id: 'submit-1',
      at: 56,
      narration:
        "Home. From anywhere on the plane, the breeze carries me back. That's the theorem in feathers.",
      speaker_id: 'banach-goose',
      action: { method: 'submit' },
    },
    {
      id: 'level-2-intro',
      at: 64,
      narration:
        'Level two raises the bar. Same target, but now three candidate functions. The question is which one converges fastest — measured in number of iterations to reach within five percent of the target.',
      action: { method: 'setLevel', args: [1] },
    },
    {
      id: 'level-2-show-strong',
      at: 78,
      narration:
        'The strong tailwind has a contraction rate of zero point three. Lower contraction rate, fewer iterations. That should win.',
      action: { method: 'setFunction', args: ['strong'] },
    },
    {
      id: 'level-2-set-K',
      at: 88,
      narration: 'Eight iterations. Submit.',
      action: { method: 'setK', args: [8] },
    },
    {
      id: 'level-2-submit',
      at: 92,
      narration:
        "Right. Lower contraction rate hits the tolerance in fewer steps. This same number — c, the Lipschitz constant — determines the minimum K in a real looped language model. The math is identical.",
      action: { method: 'submit' },
    },
    {
      id: 'level-3-intro',
      at: 102,
      narration:
        "Level three. Now the question is, how few iterations do you need? Pick K just large enough to reach the tolerance — no more, no less. Stop early, you miss. Stop late, you wasted compute.",
      action: { method: 'setLevel', args: [2] },
    },
    {
      id: 'level-3-set-K',
      at: 116,
      narration: "Try K equals nine for this function — should land right at the edge.",
      action: { method: 'setK', args: [9] },
    },
    {
      id: 'level-3-submit',
      at: 122,
      narration:
        "Solved with one wasted iteration. The optimal was eight. In a real looped model, that wasted iteration is what adaptive halting heads are trained to avoid.",
      action: { method: 'submit' },
    },
    {
      id: 'level-4-intro',
      at: 132,
      narration:
        "Level four is the actual Deep Equilibrium Models design problem. You have a fixed compute budget of fourteen units. Two functions to choose from, each with a different per-loop cost. The cheap one has a slow contraction. The expensive one converges fast. Find the combination that hits the target within budget.",
      action: { method: 'setLevel', args: [3] },
    },
    {
      id: 'level-4-pick-strong',
      at: 152,
      narration:
        "Strong tailwind costs two per loop and converges in five steps — that's ten units total. Cheaper than the gentle breeze, which would need fourteen loops at one each.",
      action: { method: 'setFunction', args: ['strong'] },
    },
    {
      id: 'level-4-set-K',
      at: 166,
      narration: 'Five iterations. Submit.',
      action: { method: 'setK', args: [5] },
    },
    {
      id: 'level-4-submit',
      at: 170,
      narration:
        "Optimal. Ten units under a fourteen-unit budget. That's what Shaojie Bai and Zico Kolter at CMU solved analytically in 2019 with implicit differentiation — finding the cheapest fixed-point path without iterating at all. Same problem you just solved by hand.",
      action: { method: 'submit' },
    },
  ],
};
