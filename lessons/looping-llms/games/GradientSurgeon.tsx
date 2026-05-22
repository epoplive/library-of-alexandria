import { useState } from 'react';
import { motion } from 'framer-motion';

/* ============================================================
   Gradient Surgeon — three broken training runs. Diagnose the
   failure mode, pick the right mitigation, watch the curve
   recover. Each problem has one correct mitigation; others
   help less or hurt.
   ============================================================ */

type Mitigation = 'scaled-init' | 'ln-boundary' | 'grad-clip' | 'checkpoint' | 'lower-K';

const STEPS = 50;

interface Run {
  id: number;
  title: string;
  symptom: string;
  /** Broken loss curve at each step (0..1, lower is better) */
  broken: number[];
  /** Per-mitigation outcome: fixed curve + a verdict */
  outcomes: Record<Mitigation, { curve: number[]; verdict: 'fixed' | 'helps' | 'hurts'; note: string }>;
  optimal: Mitigation;
  teaching: string;
}

const MITIGATIONS: { id: Mitigation; label: string; sub: string }[] = [
  {
    id: 'scaled-init',
    label: 'Scaled init',
    sub: 'Weights init at 1/√K scale. Keeps Jacobian spectral radius near 1.',
  },
  {
    id: 'ln-boundary',
    label: 'LayerNorm at loop boundary',
    sub: 'Normalize the hidden state between iterations. Stabilizes signal.',
  },
  {
    id: 'grad-clip',
    label: 'Gradient clipping',
    sub: 'Cap gradient norm. Stops exploding updates but masks root cause.',
  },
  {
    id: 'checkpoint',
    label: 'Gradient checkpointing',
    sub: 'Recompute activations on backward. Saves memory, costs ~1.3× backward.',
  },
  {
    id: 'lower-K',
    label: 'Lower K',
    sub: 'Reduce loop count. Always helps stability, costs effective depth.',
  },
];

function expCurve(start: number, end: number, blowupAt?: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < STEPS; i++) {
    const t = i / (STEPS - 1);
    let v = start * Math.exp(-2 * t) + end * (1 - Math.exp(-2 * t));
    if (blowupAt !== undefined && i >= blowupAt) {
      v += Math.exp((i - blowupAt) * 0.3) * 0.1;
    }
    v += (Math.sin(i * 0.7) * 0.02);
    out.push(Math.max(0, Math.min(1.5, v)));
  }
  return out;
}

function plateauCurve(plateau: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < STEPS; i++) {
    const t = i / (STEPS - 1);
    const v = 1 - (1 - plateau) * Math.min(1, t * 4);
    out.push(v + Math.sin(i * 0.8) * 0.015);
  }
  return out;
}

function noisyCurve(): number[] {
  const out: number[] = [];
  for (let i = 0; i < STEPS; i++) {
    const t = i / (STEPS - 1);
    let v = 0.95 - 0.6 * t + (Math.sin(i * 1.3) + Math.sin(i * 2.7)) * 0.08;
    if (i > 15 && i < 25) v += 0.3; // spike
    if (i > 35 && i < 40) v += 0.25; // another spike
    out.push(Math.max(0, v));
  }
  return out;
}

const RUNS: Run[] = [
  {
    id: 1,
    title: 'Run #1 — explodes at step 30',
    symptom: 'Loss decreasing nicely, then suddenly diverges to infinity. K=8 looped Llama clone.',
    broken: expCurve(0.95, 0.3, 30),
    outcomes: {
      'scaled-init': {
        curve: expCurve(0.95, 0.18),
        verdict: 'fixed',
        note: '1/√K initialization keeps the spectral radius of repeated multiplication near 1. Exploding chain interrupted at the source.',
      },
      'ln-boundary': {
        curve: expCurve(0.95, 0.22),
        verdict: 'helps',
        note: 'LN absorbs the explosion partially. Helps, but the root cause (bad init) is still there.',
      },
      'grad-clip': {
        curve: expCurve(0.95, 0.45),
        verdict: 'helps',
        note: 'Clipping stops the runaway updates but you train slower and never reach the depth scaled-init would.',
      },
      'checkpoint': {
        curve: expCurve(0.95, 0.32, 30),
        verdict: 'hurts',
        note: 'Memory wasn\'t the problem. Checkpointing changes nothing about gradient magnitude.',
      },
      'lower-K': {
        curve: expCurve(0.95, 0.55),
        verdict: 'helps',
        note: 'Reducing K avoids the issue by avoiding the depth. The model can\'t reach its target capacity.',
      },
    },
    optimal: 'scaled-init',
    teaching: 'Exploding gradients in a looped LM are almost always an initialization problem. Scale by 1/√K and the Jacobian product stays bounded.',
  },
  {
    id: 2,
    title: 'Run #2 — plateaus at 0.62',
    symptom: 'Loss drops fast for the first 10 steps, then sticks at 0.62 forever. Model isn\'t learning more.',
    broken: plateauCurve(0.62),
    outcomes: {
      'scaled-init': {
        curve: plateauCurve(0.58),
        verdict: 'helps',
        note: 'Slightly better init, slightly lower plateau. Doesn\'t address the structural issue.',
      },
      'ln-boundary': {
        curve: expCurve(1.0, 0.2),
        verdict: 'fixed',
        note: 'Without LN between iterations, hidden state magnitudes drift across loops — gradients vanish and the deeper iterations stop contributing. LN at the loop boundary fixes the vanishing.',
      },
      'grad-clip': {
        curve: plateauCurve(0.62),
        verdict: 'hurts',
        note: 'Clipping makes vanishing gradients worse — you\'re scaling small things down further.',
      },
      'checkpoint': {
        curve: plateauCurve(0.62),
        verdict: 'hurts',
        note: 'Checkpointing is a memory trick. Has zero effect on the vanishing gradient.',
      },
      'lower-K': {
        curve: plateauCurve(0.5),
        verdict: 'helps',
        note: 'Lower K means fewer multiplications to vanish through. Helps, but you wanted the depth.',
      },
    },
    optimal: 'ln-boundary',
    teaching: 'When a looped LM plateaus, it\'s usually vanishing gradients in the late iterations. LayerNorm at the loop boundary is the standard fix — Universal Transformer used it from day one.',
  },
  {
    id: 3,
    title: 'Run #3 — OOM at step 20',
    symptom: 'Training crashes with out-of-memory at step 20. K=12, batch size 4 on a single A100.',
    broken: noisyCurve(),
    outcomes: {
      'scaled-init': {
        curve: noisyCurve(),
        verdict: 'hurts',
        note: 'Initialization doesn\'t reduce activation memory. Still OOM.',
      },
      'ln-boundary': {
        curve: noisyCurve(),
        verdict: 'hurts',
        note: 'LN adds tiny memory per layer. Crashes faster.',
      },
      'grad-clip': {
        curve: noisyCurve(),
        verdict: 'hurts',
        note: 'Clipping doesn\'t help memory. Still OOM.',
      },
      'checkpoint': {
        curve: expCurve(0.95, 0.2),
        verdict: 'fixed',
        note: 'Activation memory drops by ~K-fold. Backward takes ~1.3× longer but you can actually finish training.',
      },
      'lower-K': {
        curve: expCurve(0.95, 0.35),
        verdict: 'helps',
        note: 'Fewer loops means less stored state. Works, but you\'ve given up depth instead of solving the storage problem.',
      },
    },
    optimal: 'checkpoint',
    teaching: 'K loops mean K-fold activation memory unless you checkpoint. Tianqi Chen\'s 2016 trick is standard in every modern looped LM implementation.',
  },
];

interface Result {
  runId: number;
  picked: Mitigation;
  verdict: 'fixed' | 'helps' | 'hurts';
  optimal: boolean;
}

export function GradientSurgeon() {
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [submitted, setSubmitted] = useState<Mitigation | null>(null);

  if (idx >= RUNS.length) {
    const fixed = results.filter((r) => r.verdict === 'fixed').length;
    const opt = results.filter((r) => r.optimal).length;
    return (
      <div className="bg-paper-card rounded-2xl p-5 md:p-6 shadow-card flex flex-col gap-5 items-center text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          surgery rounds complete
        </p>
        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
              Runs fixed
            </p>
            <p className="font-display text-4xl font-semibold tabular-nums">
              {fixed}
              <span className="text-base text-ink-muted ml-1">/ {RUNS.length}</span>
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
              Optimal pick
            </p>
            <p className="font-display text-4xl font-semibold tabular-nums">
              {opt}
              <span className="text-base text-ink-muted ml-1">/ {RUNS.length}</span>
            </p>
          </div>
        </div>
        <p className="text-ink-muted text-sm max-w-md">
          Diagnosing training failures is the unglamorous core of building looped LMs. Each
          failure mode has a fingerprint — the curve shape tells you which knob to turn.
        </p>
        <button
          type="button"
          onClick={() => {
            setIdx(0);
            setResults([]);
            setSubmitted(null);
          }}
          className="px-4 py-2 rounded-xl border border-accent/30 text-accent font-mono text-[10px] uppercase tracking-[0.18em] hover:bg-accent-soft transition"
        >
          ↻ Run again
        </button>
      </div>
    );
  }

  const run = RUNS[idx];

  function submit(m: Mitigation) {
    const out = run.outcomes[m];
    const r: Result = {
      runId: run.id,
      picked: m,
      verdict: out.verdict,
      optimal: m === run.optimal,
    };
    setSubmitted(m);
    setTimeout(() => {
      setResults((prev) => [...prev, r]);
      setSubmitted(null);
      setIdx((i) => i + 1);
    }, 2800);
  }

  if (submitted) {
    const out = run.outcomes[submitted];
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-paper-card rounded-2xl p-5 md:p-6 shadow-card flex flex-col gap-4 border-2 ${
          out.verdict === 'fixed'
            ? 'border-signal-good/40'
            : out.verdict === 'helps'
              ? 'border-signal-warn/40'
              : 'border-signal-bad/40'
        }`}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
          {run.title} · applied {MITIGATIONS.find((x) => x.id === submitted)?.label}
        </p>
        <CurveChart broken={run.broken} fixed={out.curve} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
              Verdict
            </p>
            <p
              className={`font-display text-2xl font-semibold ${
                out.verdict === 'fixed'
                  ? 'text-signal-good'
                  : out.verdict === 'helps'
                    ? 'text-signal-warn'
                    : 'text-signal-bad'
              }`}
            >
              {out.verdict === 'fixed' ? '✓ Fixed' : out.verdict === 'helps' ? '~ Partial' : '✗ Hurts'}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
              Optimal pick
            </p>
            <p
              className={`font-display text-2xl font-semibold ${
                submitted === run.optimal ? 'text-signal-good' : 'text-ink-subtle'
              }`}
            >
              {submitted === run.optimal
                ? '✓'
                : MITIGATIONS.find((x) => x.id === run.optimal)?.label}
            </p>
          </div>
        </div>
        <p className="text-sm text-ink-muted leading-relaxed">{out.note}</p>
        <p className="text-xs text-ink/70 italic">{run.teaching}</p>
      </motion.div>
    );
  }

  return (
    <div className="bg-paper-card rounded-2xl p-5 md:p-6 shadow-card flex flex-col gap-4">
      <div className="flex justify-between items-baseline">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
          patient {idx + 1} / {RUNS.length}
        </p>
      </div>
      <div>
        <p className="font-display text-lg font-semibold leading-tight">{run.title}</p>
        <p className="text-sm text-ink-muted mt-1">{run.symptom}</p>
      </div>

      <CurveChart broken={run.broken} />

      <div className="grid gap-2">
        {MITIGATIONS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => submit(m.id)}
            className="text-left rounded-xl border-2 border-ink-subtle/15 hover:border-accent/50 hover:bg-accent-soft/30 px-4 py-2.5 transition"
          >
            <div className="flex justify-between items-baseline gap-3">
              <p className="font-display text-sm font-semibold">{m.label}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
                apply
              </p>
            </div>
            <p className="font-mono text-[10px] text-ink-muted">{m.sub}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function CurveChart({ broken, fixed }: { broken: number[]; fixed?: number[] }) {
  const W = 540;
  const H = 130;
  const maxY = 1.5;
  const pad = 12;

  function path(curve: number[]): string {
    return curve
      .map((v, i) => {
        const x = pad + (i / (curve.length - 1)) * (W - pad * 2);
        const y = pad + (1 - Math.min(maxY, v) / maxY) * (H - pad * 2);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }

  return (
    <div className="bg-paper-tint rounded-xl p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* grid */}
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#cbd5e1" strokeWidth="0.5" />
        <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="#cbd5e1" strokeWidth="0.5" />
        {/* broken curve */}
        <motion.path
          d={path(broken)}
          fill="none"
          stroke={fixed ? '#94a3b8' : '#ef4444'}
          strokeWidth="1.8"
          strokeDasharray={fixed ? '3 3' : undefined}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9 }}
        />
        {/* fixed curve overlay */}
        {fixed && (
          <motion.path
            d={path(fixed)}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.2"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, delay: 0.2 }}
          />
        )}
        {/* axis labels */}
        <text x={pad - 2} y={pad + 4} fontSize={9} fill="#94a3b8" fontFamily="monospace" textAnchor="end">
          loss
        </text>
        <text x={W - pad} y={H - 2} fontSize={9} fill="#94a3b8" fontFamily="monospace" textAnchor="end">
          step →
        </text>
      </svg>
    </div>
  );
}
