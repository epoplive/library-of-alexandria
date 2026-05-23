import type { Scene } from '@/lib/scene-timeline';

/* ============================================================
   Halting-head guided demo. Drives HaltOrContinueGame through
   all three problems via imperative ref — setProblem, nextStep,
   halt, reset — showing what the optimal halting policy looks
   like on each difficulty.

   Method names map to HaltOrContinueGameHandle (lessons/.../games/
   HaltOrContinueGame.tsx).

   Beat pacing: result card shows for ~1.9s after halt, so each
   halt beat needs ~3-4s before the next setProblem so the demo
   feels natural.
   ============================================================ */

export const HALT_TIMELINE: Scene = {
  id: 'halt',
  title: 'You\'re the halting head',
  eyebrow: '09 · adaptive computation time',
  start: 0,
  end: 200,
  component_id: 'HaltOrContinueGame',
  beats: [
    {
      id: 'reset',
      at: 0,
      narration:
        'Not every problem deserves eight loops. A chess engine doesn\'t think for the same amount of time on every move — a grandmaster spends seconds on a forced capture and minutes on a closed positional decision.',
      action: { method: 'reset' },
    },
    {
      id: 'principle',
      at: 16,
      narration:
        'Adaptive halting gives a looped LM that same dynamic compute allocation. A tiny head sits on top of the network and emits a stop probability at each iteration. The training signal balances ponder cost against answer accuracy.',
    },
    {
      id: 'problem-1-intro',
      at: 32,
      narration:
        'First problem. Easy. What color is the sky on a clear day. Look at the confidence after one loop.',
      action: { method: 'setProblem', args: [0] },
    },
    {
      id: 'problem-1-step-1',
      at: 44,
      narration:
        'Fifty-five percent at the first iteration. Not enough to commit. One more.',
      action: { method: 'nextStep' },
    },
    {
      id: 'problem-1-halt',
      at: 52,
      narration:
        'Ninety-six percent on the second iteration — that\'s the model locked in. Halt here. Two iterations, correct answer. Optimal.',
      action: { method: 'halt' },
    },
    {
      id: 'problem-2-intro',
      at: 64,
      narration:
        'Second problem. Medium. Is ninety-one a prime number. Watch the confidence climb more slowly — the model is actually working.',
      action: { method: 'setProblem', args: [1] },
    },
    {
      id: 'problem-2-step-1',
      at: 76,
      narration:
        'Forty percent. Way too low to commit. Continue.',
      action: { method: 'nextStep' },
    },
    {
      id: 'problem-2-step-2',
      at: 82,
      narration:
        'Fifty-five. Still climbing.',
      action: { method: 'nextStep' },
    },
    {
      id: 'problem-2-step-3',
      at: 87,
      narration:
        'Seventy. The model is converging.',
      action: { method: 'nextStep' },
    },
    {
      id: 'problem-2-step-4',
      at: 92,
      narration:
        'Eighty-five. Above the answer threshold now.',
      action: { method: 'nextStep' },
    },
    {
      id: 'problem-2-halt',
      at: 97,
      narration:
        'Ninety-four percent on the fifth iteration. Stops climbing. Halt — five iterations, correct, optimal. Notice how if we had halted at three the answer would have been wrong. That\'s the answer-loss term doing its work.',
      action: { method: 'halt' },
    },
    {
      id: 'problem-3-intro',
      at: 116,
      narration:
        'Last problem. Hard. Multi-hop spatial reasoning. A is north of B, B east of C, C south of D — where is A versus D. Confidence will climb very slowly. This needs the full budget.',
      action: { method: 'setProblem', args: [2] },
    },
    {
      id: 'problem-3-rolling',
      at: 132,
      narration:
        'Watch the confidence at each step. Thirty. Forty. Forty-five. Fifty. Sixty. Seventy-two. Eighty-seven. Ninety-five.',
      action: { method: 'nextStep' },
    },
    { id: 'problem-3-s2', at: 138, action: { method: 'nextStep' } },
    { id: 'problem-3-s3', at: 142, action: { method: 'nextStep' } },
    { id: 'problem-3-s4', at: 146, action: { method: 'nextStep' } },
    { id: 'problem-3-s5', at: 150, action: { method: 'nextStep' } },
    { id: 'problem-3-s6', at: 154, action: { method: 'nextStep' } },
    { id: 'problem-3-s7', at: 158, action: { method: 'nextStep' } },
    {
      id: 'problem-3-halt',
      at: 164,
      narration:
        'Halt at iteration eight. Hard problem, full budget used, correct. Optimal.',
      action: { method: 'halt' },
    },
    {
      id: 'outro',
      at: 176,
      narration:
        'The optimal policy is exactly what the halting head converges to in training — minimize compute on easy problems, spend it freely on hard ones. The math comes from Alex Graves\'s 2016 paper Adaptive Computation Time at DeepMind. Now play it yourself, see if you can beat the optimal twenty-three iterations for three correct.',
    },
  ],
};
