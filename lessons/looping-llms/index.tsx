import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LessonShell, Section } from '@/components';
import { TimelineScene } from '@/components/TimelineScene';
import { BanachPlayableScene } from './games/BanachPlayableScene';
import { KVCacheArchitect } from './games/KVCacheArchitect';
import { ComputeAllocator } from './games/ComputeAllocator';
import { GradientSurgeon } from './games/GradientSurgeon';
import { CLOSING_TIMELINE } from './timelines/closing';
import charactersJson from './characters.json';

const VOICE_MAP: Record<string, string> = Object.fromEntries(
  charactersJson.characters.map((c) => [c.id, c.voice_id]),
);

/* ============================================================
   GAME — Build your own looped transformer
   ============================================================ */

function BuildYourTransformerGame() {
  const TARGET = 24;
  const [M, setM] = useState(3);
  const [K, setK] = useState(8);
  const depth = M * K;
  const match = depth === TARGET;
  const over = depth > TARGET;
  // Memory ratio vs vanilla TARGET-layer stack
  const paramPct = Math.round((M / TARGET) * 100);

  return (
    <div className="bg-paper-card rounded-2xl p-5 md:p-6 shadow-card flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
            target effective depth
          </p>
          <p className="font-display text-5xl font-semibold tabular-nums">{TARGET}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
            your build
          </p>
          <p
            className={`font-display text-5xl font-semibold tabular-nums ${
              match ? 'text-signal-good' : over ? 'text-signal-warn' : 'text-signal-bad'
            }`}
          >
            {depth}
          </p>
        </div>
      </div>

      <div className="bg-paper-tint rounded-xl p-3">
        <div className="flex flex-col-reverse gap-[2px]">
          {Array.from({ length: K }).map((_, kIdx) => (
            <div key={kIdx} className="flex gap-[2px]">
              <span className="font-mono text-[9px] text-ink-subtle w-8 self-center text-right pr-1 tabular-nums">
                k{kIdx + 1}
              </span>
              {Array.from({ length: M }).map((_, mIdx) => (
                <motion.div
                  key={mIdx}
                  layout
                  className="h-4 flex-1 rounded-sm bg-accent flex items-center justify-center text-paper font-mono text-[8px]"
                  style={{ opacity: 0.35 + (mIdx / M) * 0.6 }}
                >
                  W{mIdx + 1}
                </motion.div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              M · unique blocks
            </span>
            <span className="font-display text-2xl font-semibold tabular-nums text-accent leading-none">
              {M}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={8}
            value={M}
            onChange={(e) => setM(Number(e.target.value))}
            className="w-full accent-accent cursor-pointer"
            aria-label="Unique blocks"
          />
        </div>
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              K · loops per pass
            </span>
            <span className="font-display text-2xl font-semibold tabular-nums text-accent leading-none">
              {K}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={12}
            value={K}
            onChange={(e) => setK(Number(e.target.value))}
            className="w-full accent-accent cursor-pointer"
            aria-label="Loop count"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-ink-subtle/10">
        <Stat
          label="Param size"
          value={`${paramPct}%`}
          sub={`vs ${TARGET}-layer stack`}
          good={paramPct < 50}
        />
        <Stat
          label="FLOPs / token"
          value={`${K}×`}
          sub="vs M-layer model"
          good={false}
          warn={K > 8}
        />
        <Stat
          label="State"
          value={match ? '✓ MATCH' : over ? 'OVER' : 'SHORT'}
          sub={match ? 'target hit' : `Δ ${depth - TARGET}`}
          good={match}
          warn={over}
          bad={!match && !over}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  good,
  warn,
  bad,
}: {
  label: string;
  value: string;
  sub: string;
  good?: boolean;
  warn?: boolean;
  bad?: boolean;
}) {
  const colorClass = good
    ? 'text-signal-good'
    : warn
      ? 'text-signal-warn'
      : bad
        ? 'text-signal-bad'
        : 'text-ink';
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
        {label}
      </p>
      <p className={`font-display text-2xl font-semibold tabular-nums ${colorClass}`}>
        {value}
      </p>
      <p className="font-mono text-[10px] text-ink-subtle">{sub}</p>
    </div>
  );
}

/* ============================================================
   GAME — Manual forward-pass simulator (step through the loop)
   ============================================================ */

const DIMS = 8;

// Generate a deterministic state progression — pretends to be the result of
// repeatedly applying the same block to a hidden state. Bar heights drift
// toward a "refined" stable pattern across iterations.
function makeStates(seed: number, steps: number): number[][] {
  const target = Array.from({ length: DIMS }, (_, i) =>
    0.5 + 0.4 * Math.sin((seed + i) * 1.3),
  );
  const states: number[][] = [];
  const initial = Array.from({ length: DIMS }, (_, i) =>
    0.3 + 0.6 * ((Math.sin((seed + 2) * i + 0.7) + 1) / 2),
  );
  states.push(initial);
  for (let s = 1; s <= steps; s++) {
    const prev = states[s - 1];
    const alpha = 0.32;
    const next = prev.map((v, i) => v * (1 - alpha) + target[i] * alpha);
    states.push(next);
  }
  return states;
}

function ForwardPassSim() {
  const MAX = 8;
  const [step, setStep] = useState(0);
  const [pulse, setPulse] = useState(0);
  const states = useMemo(() => makeStates(3.14, MAX), []);
  const input = states[step];
  const output = states[Math.min(step + 1, MAX)];
  const atEnd = step >= MAX;

  function advance() {
    if (atEnd) return;
    setStep((s) => s + 1);
    setPulse((p) => p + 1);
  }

  function reset() {
    setStep(0);
  }

  return (
    <div className="bg-paper-card rounded-2xl p-5 md:p-6 shadow-card flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
            loop iteration
          </p>
          <p className="font-display text-5xl font-semibold tabular-nums text-accent leading-none">
            {step}
            <span className="text-2xl text-ink-muted ml-1">/ {MAX}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
            weights
          </p>
          <p className="font-display text-base font-semibold text-signal-bad">
            FROZEN
          </p>
          <p className="font-mono text-[10px] text-ink-subtle">same W every step</p>
        </div>
      </div>

      <div className="grid grid-cols-[1fr,auto,auto,auto,1fr] items-center gap-3">
        {/* Input vector */}
        <div className="flex flex-col items-center gap-1.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
            h<sub>{step}</sub>
          </p>
          <div className="flex items-end gap-[3px] h-20">
            {input.map((v, i) => (
              <motion.div
                key={i}
                animate={{ height: `${v * 100}%` }}
                transition={{ duration: 0.4, delay: i * 0.03 }}
                className="w-3 rounded-sm bg-ink-subtle/50"
              />
            ))}
          </div>
        </div>

        <svg width="30" height="40" viewBox="0 0 30 40" fill="none">
          <line x1="2" y1="20" x2="22" y2="20" stroke="#5b21b6" strokeWidth="2" strokeLinecap="round" />
          <polyline points="18 14, 24 20, 18 26" stroke="#5b21b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>

        {/* The block */}
        <motion.div
          key={pulse}
          initial={{ scale: 1 }}
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 0.45 }}
          className="w-24 h-24 rounded-2xl bg-accent text-paper flex flex-col items-center justify-center shadow-card relative"
        >
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] opacity-80">
            attn + mlp
          </p>
          <p className="font-display text-2xl font-semibold tabular-nums">block</p>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] opacity-80 mt-1">
            W shared
          </p>
        </motion.div>

        <svg width="30" height="40" viewBox="0 0 30 40" fill="none">
          <line x1="2" y1="20" x2="22" y2="20" stroke="#5b21b6" strokeWidth="2" strokeLinecap="round" />
          <polyline points="18 14, 24 20, 18 26" stroke="#5b21b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>

        {/* Output vector */}
        <div className="flex flex-col items-center gap-1.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            h<sub>{step + 1 > MAX ? MAX : step + 1}</sub>
          </p>
          <div className="flex items-end gap-[3px] h-20">
            {output.map((v, i) => (
              <motion.div
                key={`${pulse}-${i}`}
                initial={{ height: `${input[i] * 100}%`, opacity: 0.5 }}
                animate={{ height: `${v * 100}%`, opacity: 1 }}
                transition={{ duration: 0.45, delay: i * 0.04 }}
                className="w-3 rounded-sm bg-accent"
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={advance}
          disabled={atEnd}
          className="rounded-xl bg-accent text-paper font-mono text-xs uppercase tracking-[0.18em] py-3.5 hover:bg-accent-hover transition shadow-card disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {atEnd ? '✓ Done' : '→ Run next loop'}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={step === 0}
          className="rounded-xl border border-ink-subtle/30 text-ink-muted font-mono text-xs uppercase tracking-[0.18em] py-3.5 hover:text-ink hover:border-ink-subtle transition disabled:opacity-40"
        >
          ↻ Reset
        </button>
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle text-center">
        same block · changing state · {MAX - step} loops to go
      </p>
    </div>
  );
}

/* ============================================================
   Scene — Thinking in silence
   ============================================================ */

const COT_TEXT =
  'Let me think. 12 × 47 = 12 × 50 − 12 × 3 = 600 − 36 = 564. Answer: 564';

function SilentThinkingScene() {
  const [cotChars, setCotChars] = useState(0);
  const [latentLoop, setLatentLoop] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setCotChars(0);
    setLatentLoop(0);
    let cancelled = false;
    let c = 0;
    let l = 0;
    const cotInt = setInterval(() => {
      if (cancelled) return;
      c += 2;
      setCotChars(c);
      if (c >= COT_TEXT.length) clearInterval(cotInt);
    }, 70);
    const loopInt = setInterval(() => {
      if (cancelled) return;
      l += 1;
      setLatentLoop(l);
      if (l >= 8) clearInterval(loopInt);
    }, 520);
    return () => {
      cancelled = true;
      clearInterval(cotInt);
      clearInterval(loopInt);
    };
  }, [tick]);

  const latentDone = latentLoop >= 8;

  return (
    <div className="flex flex-col items-center w-full gap-4">
      <div className="grid grid-cols-1 gap-3 w-full">
        <div className="bg-paper-card rounded-2xl p-5 shadow-card border border-ink-subtle/10 min-h-[160px]">
          <div className="flex justify-between mb-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
              Chain-of-thought
            </p>
            <p className="font-mono text-xs text-ink-subtle tabular-nums">22 tokens out</p>
          </div>
          <p className="font-mono text-sm leading-relaxed text-ink min-h-[3.5rem]">
            {COT_TEXT.slice(0, cotChars)}
          </p>
        </div>

        <div className="bg-accent-soft rounded-2xl p-5 shadow-card border border-accent/30 min-h-[160px]">
          <div className="flex justify-between mb-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
              Looped (latent)
            </p>
            <p className="font-mono text-xs text-ink-subtle tabular-nums">
              {latentDone ? '1' : '0'} token out
            </p>
          </div>
          <div className="flex items-center justify-center gap-6 py-3">
            {!latentDone ? (
              <>
                <p className="font-display text-5xl font-semibold text-accent tabular-nums">
                  {latentLoop} / 8
                </p>
                <div className="flex flex-col gap-1">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-1 w-12 rounded-full ${i < latentLoop ? 'bg-accent' : 'bg-accent/20'}`}
                    />
                  ))}
                </div>
              </>
            ) : (
              <motion.p
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="font-mono text-4xl text-accent"
              >
                564
              </motion.p>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setTick((t) => t + 1)}
        className="px-3 py-1 rounded-xl border border-accent/30 text-accent font-mono text-[10px] uppercase tracking-[0.18em] hover:bg-accent-soft transition"
      >
        ↻ Replay
      </button>
    </div>
  );
}

/* ============================================================
   Scene — Gradient blame
   ============================================================ */

function GradientBlameScene() {
  const [K, setK] = useState(8);
  const stable = Math.min(1, 6 / K);
  const total = stable * K;
  const tooSmall = K > 12;
  const tooBig = K < 3;
  const barColor = tooSmall
    ? 'bg-signal-bad/70'
    : tooBig
      ? 'bg-signal-warn/70'
      : 'bg-accent';

  return (
    <div className="bg-paper-card rounded-2xl p-5 md:p-6 shadow-card">
      <div className="flex items-end justify-between mb-4 gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
            K · loops per forward pass
          </p>
          <p className="font-display text-5xl font-semibold tabular-nums text-accent leading-none">
            {K}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
            ∂L / ∂W contribution
          </p>
          <p className="font-display text-lg font-semibold">
            Σᵢ ≈ {total.toFixed(2)} × baseline
          </p>
        </div>
      </div>

      <input
        type="range"
        min={1}
        max={16}
        step={1}
        value={K}
        onChange={(e) => setK(Number(e.target.value))}
        className="w-full accent-accent cursor-pointer"
        aria-label="Loop count"
      />
      <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle mt-1.5 mb-5">
        <span>1</span>
        <span className="text-accent">4–8</span>
        <span>16</span>
      </div>

      <div className="flex gap-[3px] h-14 items-end mb-2">
        {Array.from({ length: K }).map((_, i) => (
          <motion.div
            key={i}
            animate={{ height: `${stable * 100}%` }}
            transition={{ duration: 0.18 }}
            className={`flex-1 rounded-sm ${barColor}`}
          />
        ))}
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle mb-3">
        per-iteration signal
      </p>

      <div className="bg-paper-tint rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal-warn">
            K &lt; 3
          </p>
          <p className="font-mono text-xs text-ink">clean</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            K = 4–8
          </p>
          <p className="font-mono text-xs text-ink">stable</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal-bad">
            K &gt; 12
          </p>
          <p className="font-mono text-xs text-ink">vanishes</p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Scene — Training compute cost
   ============================================================ */

function TrainingComputeScene() {
  const bars = [
    { K: 1, label: 'vanilla 24-layer', fwd: 1, bwd: 1, mem: 1 },
    { K: 4, label: 'looped M=6 K=4', fwd: 1, bwd: 4, mem: 4 },
    { K: 8, label: 'looped M=3 K=8', fwd: 1, bwd: 8, mem: 8 },
  ];

  return (
    <div className="bg-paper-card rounded-2xl p-5 md:p-6 shadow-card space-y-5">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle mb-3">
          relative cost · same effective depth
        </p>
        <div className="space-y-4">
          {bars.map((b, i) => (
            <div key={i}>
              <div className="flex justify-between mb-1.5">
                <span className="font-mono text-xs text-ink">{b.label}</span>
                <span className="font-mono text-xs text-ink-muted tabular-nums">
                  fwd {b.fwd}× · bwd {b.bwd}× · activations {b.mem}×
                </span>
              </div>
              <div className="flex gap-1 h-7">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(b.fwd / 8) * 100}%` }}
                  transition={{ delay: i * 0.1, duration: 0.6 }}
                  className="h-full rounded-sm bg-accent/40"
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(b.bwd / 8) * 100}%` }}
                  transition={{ delay: i * 0.1 + 0.1, duration: 0.6 }}
                  className="h-full rounded-sm bg-signal-warn/60"
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(b.mem / 8) * 100}%` }}
                  transition={{ delay: i * 0.1 + 0.2, duration: 0.6 }}
                  className="h-full rounded-sm bg-signal-bad/40"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-3 text-[10px] font-mono uppercase tracking-[0.16em]">
          <span className="text-accent">■ forward</span>
          <span className="text-signal-warn">■ backward</span>
          <span className="text-signal-bad">■ activation memory</span>
        </div>
      </div>

      <div className="bg-paper-tint rounded-xl p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal-good mb-1">
          mitigation · gradient checkpointing
        </p>
        <p className="text-sm text-ink leading-relaxed">
          Recompute activations on the backward pass instead of storing them. Memory drops
          to 1×; wall-clock takes ~1.3× the backward time. Standard in every modern looped
          implementation.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   Scene — What's actually shared (weight-tying schemes)
   ============================================================ */

function WeightTyingScene() {
  const schemes = [
    {
      name: 'Full sharing',
      meta: 'Universal Transformer',
      attn: true,
      mlp: true,
      note: 'Both attention and MLP weights shared across K loops. Most parameter-efficient. Used in Dehghani 2018.',
    },
    {
      name: 'Attention-shared',
      meta: 'recent variants',
      attn: true,
      mlp: false,
      note: 'Reuse the same attention pattern across loops, but each loop has its own MLP. Reasoning-style refinement.',
    },
    {
      name: 'MLP-shared',
      meta: 'less common',
      attn: false,
      mlp: true,
      note: 'Each loop attends fresh but reuses the same MLP. Better for tasks where position-specific routing matters.',
    },
  ];

  return (
    <div className="space-y-3">
      {schemes.map((s, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.12, duration: 0.4 }}
          className="bg-paper-card rounded-2xl p-4 shadow-card border border-ink-subtle/10 flex gap-4 items-start"
        >
          <div className="flex flex-col gap-1.5 shrink-0">
            <span
              className={`w-20 h-7 rounded-md flex items-center justify-center font-mono text-[9px] uppercase tracking-[0.15em] ${
                s.attn ? 'bg-accent text-paper' : 'bg-paper-tint text-ink-subtle border border-ink-subtle/20'
              }`}
            >
              attn {s.attn ? 'shared' : 'unique'}
            </span>
            <span
              className={`w-20 h-7 rounded-md flex items-center justify-center font-mono text-[9px] uppercase tracking-[0.15em] ${
                s.mlp ? 'bg-accent text-paper' : 'bg-paper-tint text-ink-subtle border border-ink-subtle/20'
              }`}
            >
              mlp {s.mlp ? 'shared' : 'unique'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline">
              <p className="font-display text-lg font-semibold leading-tight">{s.name}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
                {s.meta}
              </p>
            </div>
            <p className="text-ink-muted text-sm leading-relaxed mt-1">{s.note}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ============================================================
   GAME — Halt or continue (you're the halting head)
   ============================================================ */

type Problem = {
  prompt: string;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Internal confidence at each iteration (0..1) — 8 steps max */
  confidence: number[];
  /** Ground-truth accuracy at each step */
  correctness: number[];
  optimalHaltAt: number; // 1-indexed
};

const HALT_PROBLEMS: Problem[] = [
  {
    prompt: 'What color is the sky on a clear day?',
    difficulty: 'easy',
    confidence: [0.55, 0.96, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97],
    correctness: [0.6, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99],
    optimalHaltAt: 2,
  },
  {
    prompt: 'Is 91 a prime number?',
    difficulty: 'medium',
    confidence: [0.4, 0.55, 0.7, 0.85, 0.94, 0.95, 0.95, 0.95],
    correctness: [0.3, 0.45, 0.6, 0.85, 0.95, 0.95, 0.95, 0.95],
    optimalHaltAt: 5,
  },
  {
    prompt: 'A north of B, B east of C, C south of D — where is A vs D?',
    difficulty: 'hard',
    confidence: [0.3, 0.4, 0.45, 0.5, 0.6, 0.72, 0.87, 0.95],
    correctness: [0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 0.88, 0.95],
    optimalHaltAt: 8,
  },
];

interface HaltResult {
  problemIdx: number;
  haltedAt: number;
  correct: boolean;
  wasted: number; // negative = halted too early
}

function HaltOrContinueGame() {
  const [pIdx, setPIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [results, setResults] = useState<HaltResult[]>([]);
  const [showResult, setShowResult] = useState<HaltResult | null>(null);

  if (pIdx >= HALT_PROBLEMS.length) {
    const totalSteps = results.reduce((a, r) => a + r.haltedAt, 0);
    const correct = results.filter((r) => r.correct).length;
    return (
      <div className="bg-paper-card rounded-2xl p-6 shadow-card flex flex-col items-center gap-5 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          run complete
        </p>
        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
              compute used
            </p>
            <p className="font-display text-4xl font-semibold tabular-nums">
              {totalSteps}
              <span className="text-base text-ink-muted ml-1">/ 24 max</span>
            </p>
            <p className="font-mono text-[10px] text-ink-subtle">loop iterations</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
              correct
            </p>
            <p className="font-display text-4xl font-semibold tabular-nums">
              {correct}
              <span className="text-base text-ink-muted ml-1">/ 3</span>
            </p>
            <p className="font-mono text-[10px] text-ink-subtle">problems</p>
          </div>
        </div>
        <p className="text-ink-muted text-sm max-w-md">
          A perfect halting head would have stopped at iteration{' '}
          {HALT_PROBLEMS.reduce((a, p) => a + p.optimalHaltAt, 0)} for 3/3 correct. Train
          loss for ACT is exactly this: total compute + answer accuracy.
        </p>
        <button
          type="button"
          onClick={() => {
            setPIdx(0);
            setStep(0);
            setResults([]);
            setShowResult(null);
          }}
          className="px-4 py-2 rounded-xl border border-accent/30 text-accent font-mono text-[10px] uppercase tracking-[0.18em] hover:bg-accent-soft transition"
        >
          ↻ Run again
        </button>
      </div>
    );
  }

  const p = HALT_PROBLEMS[pIdx];
  const conf = p.confidence[step] ?? 0;
  const atMax = step + 1 >= p.confidence.length;

  function halt() {
    const correct = p.correctness[step] >= 0.85;
    const result: HaltResult = {
      problemIdx: pIdx,
      haltedAt: step + 1,
      correct,
      wasted: step + 1 - p.optimalHaltAt,
    };
    setShowResult(result);
    setTimeout(() => {
      setResults((r) => [...r, result]);
      setShowResult(null);
      setPIdx((i) => i + 1);
      setStep(0);
    }, 1900);
  }

  function next() {
    if (atMax) {
      halt();
      return;
    }
    setStep((s) => s + 1);
  }

  if (showResult) {
    const r = showResult;
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-paper-card rounded-2xl p-6 shadow-card flex flex-col gap-3 border-2 ${
          r.correct ? 'border-signal-good/40' : 'border-signal-bad/40'
        }`}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
          problem {pIdx + 1}
        </p>
        <p className="font-display text-base">"{p.prompt}"</p>
        <div className="grid grid-cols-3 gap-3 pt-2">
          <Stat
            label="You halted at"
            value={`${r.haltedAt}`}
            sub="iterations"
          />
          <Stat
            label="Optimal"
            value={`${p.optimalHaltAt}`}
            sub={r.wasted === 0 ? 'perfect' : r.wasted > 0 ? `+${r.wasted} wasted` : `${r.wasted} early`}
            good={r.wasted === 0}
            warn={r.wasted > 0}
            bad={r.wasted < 0}
          />
          <Stat
            label="Answer"
            value={r.correct ? '✓' : '✗'}
            sub={r.correct ? 'correct' : 'wrong'}
            good={r.correct}
            bad={!r.correct}
          />
        </div>
      </motion.div>
    );
  }

  return (
    <div className="bg-paper-card rounded-2xl p-5 md:p-6 shadow-card flex flex-col gap-4">
      <div className="flex justify-between items-baseline">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
          problem {pIdx + 1} / {HALT_PROBLEMS.length} · {p.difficulty}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle tabular-nums">
          iteration {step + 1} / 8
        </p>
      </div>

      <p className="font-display text-base md:text-lg leading-snug">"{p.prompt}"</p>

      <div>
        <div className="flex justify-between mb-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            internal confidence
          </p>
          <p className="font-mono text-[10px] tabular-nums text-ink">
            {Math.round(conf * 100)}%
          </p>
        </div>
        <div className="h-6 bg-paper-tint rounded-md overflow-hidden">
          <motion.div
            animate={{ width: `${conf * 100}%` }}
            transition={{ duration: 0.3 }}
            className={`h-full ${
              conf > 0.85 ? 'bg-signal-good' : conf > 0.6 ? 'bg-signal-warn' : 'bg-signal-bad'
            }`}
          />
        </div>
        <div className="flex gap-[2px] mt-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${
                i <= step ? 'bg-accent' : 'bg-ink-subtle/15'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          type="button"
          onClick={halt}
          className="rounded-xl bg-signal-good/15 hover:bg-signal-good/25 border-2 border-signal-good/40 text-signal-good font-mono text-xs uppercase tracking-[0.18em] py-4 transition"
        >
          ✓ Halt
        </button>
        <button
          type="button"
          onClick={next}
          disabled={atMax}
          className="rounded-xl bg-accent-soft hover:bg-accent/20 border-2 border-accent/40 text-accent font-mono text-xs uppercase tracking-[0.18em] py-4 transition disabled:opacity-50"
        >
          → Continue
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Scene — KV cache math
   ============================================================ */

function KVCacheMathScene() {
  const [seqK, setSeqK] = useState(8); // sequence length in K tokens
  const [hidden, setHidden] = useState(4); // hidden dim in K
  const [M, setM] = useState(3);
  const [K, setK] = useState(8);
  const BYTES = 2; // bf16
  const SEQ = seqK * 1024;
  const HIDDEN = hidden * 1024;
  const LAYERS_STACKED = 24;
  const effDepth = M * K;
  const cacheStacked = 2 * LAYERS_STACKED * SEQ * HIDDEN * BYTES;
  const cacheLooped = 2 * effDepth * SEQ * HIDDEN * BYTES;
  const paramsStackedGB = LAYERS_STACKED * 0.5;
  const paramsLoopedGB = M * 0.5;
  const maxBarGB = Math.max(cacheStacked / 1e9, paramsStackedGB) * 1.1;

  function bar(label: string, gb: number, color: string, suffix?: string) {
    return (
      <div>
        <div className="flex justify-between mb-1">
          <span className="font-mono text-xs">{label}</span>
          <span className="font-mono text-xs tabular-nums">
            {gb < 1 ? `${(gb * 1024).toFixed(0)} MB` : `${gb.toFixed(1)} GB`}
            {suffix && <span className="ml-1">{suffix}</span>}
          </span>
        </div>
        <div className="h-5 bg-paper-tint rounded overflow-hidden">
          <motion.div
            animate={{ width: `${Math.min(100, (gb / maxBarGB) * 100)}%` }}
            transition={{ duration: 0.2 }}
            className={`h-full ${color} rounded`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-paper-card rounded-2xl p-5 shadow-card">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle mb-4">
          per-request memory · drag the sliders
        </p>
        <div className="space-y-3">
          {bar('params · stacked 24L', paramsStackedGB, 'bg-ink-subtle/50')}
          {bar(`params · looped M=${M}`, paramsLoopedGB, 'bg-signal-good', '↓')}
          {bar('KV cache · stacked 24L', cacheStacked / 1e9, 'bg-ink-subtle/50')}
          {bar(
            `KV cache · looped (M×K = ${effDepth})`,
            cacheLooped / 1e9,
            'bg-signal-bad/70',
            effDepth === LAYERS_STACKED ? '—' : effDepth < LAYERS_STACKED ? '↓' : '↑',
          )}
        </div>
      </div>

      <div className="bg-paper-card rounded-2xl p-5 shadow-card grid grid-cols-2 gap-4">
        <KVSlider label="seq · K tokens" value={seqK} setValue={setSeqK} min={1} max={32} />
        <KVSlider label="hidden · K dim" value={hidden} setValue={setHidden} min={1} max={8} />
        <KVSlider label="M · unique blocks" value={M} setValue={setM} min={1} max={8} />
        <KVSlider label="K · loops" value={K} setValue={setK} min={1} max={16} />
      </div>

      <div className="bg-paper-tint rounded-xl p-3">
        <p className="font-mono text-xs text-ink">
          KV bytes = 2 × layers × seq × hidden × dtype · stacked layers = 24 · looped
          effective layers = M × K
        </p>
      </div>
    </div>
  );
}

function KVSlider({
  label,
  value,
  setValue,
  min,
  max,
}: {
  label: string;
  value: number;
  setValue: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
          {label}
        </span>
        <span className="font-mono text-lg font-semibold tabular-nums text-accent leading-none">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full accent-accent cursor-pointer"
        aria-label={label}
      />
    </div>
  );
}

/* ============================================================
   Scene — When it wins / loses
   ============================================================ */

function WhenItWinsScene() {
  const wins = [
    { icon: '∑', label: 'Iterative arithmetic', detail: 'Long mult, modular math' },
    { icon: '↬', label: 'Multi-hop reasoning', detail: 'Chains of A → B → C' },
    { icon: '⌥', label: 'Traversal / search', detail: 'DFS, BFS, parse trees' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-signal-good mb-2">
          wins · tasks with a repeating step
        </p>
        <div className="space-y-2">
          {wins.map((w, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1, duration: 0.35 }}
              className="bg-paper-card rounded-xl p-3 shadow-card border-l-4 border-signal-good flex items-center gap-3"
            >
              <p
                className="font-display text-3xl text-signal-good leading-none shrink-0 w-10 text-center"
                aria-hidden
              >
                {w.icon}
              </p>
              <div>
                <p className="font-display text-base font-semibold leading-tight">
                  {w.label}
                </p>
                <p className="font-mono text-[11px] text-ink-subtle">{w.detail}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-signal-bad mb-2">
          doesn't help
        </p>
        <div className="space-y-2">
          <div className="bg-paper-tint rounded-xl p-3 border-l-4 border-signal-bad">
            <p className="font-display text-sm font-semibold">Pattern matching</p>
            <p className="font-mono text-[11px] text-ink-subtle">
              sentiment, classification — one pass is enough
            </p>
          </div>
          <div className="bg-paper-tint rounded-xl p-3 border-l-4 border-signal-bad">
            <p className="font-display text-sm font-semibold">Frontier scale (&gt;70B)</p>
            <p className="font-mono text-[11px] text-ink-subtle">
              specialization beats sharing past a certain size
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Scene — Reading list
   ============================================================ */

function ReadingListScene() {
  const [mode, setMode] = useState<'list' | 'tour'>('list');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        <ListToggleButton
          label="List"
          sub="static"
          active={mode === 'list'}
          onClick={() => setMode('list')}
        />
        <ListToggleButton
          label="Walk-through"
          sub="narrated tour"
          active={mode === 'tour'}
          onClick={() => setMode('tour')}
        />
      </div>
      {mode === 'list' ? (
        <ReadingListStatic />
      ) : (
        <TimelineScene scene={CLOSING_TIMELINE} voiceMap={VOICE_MAP} autoPlay />
      )}
    </div>
  );
}

function ListToggleButton({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-1.5 text-left transition ${
        active
          ? 'bg-accent text-paper'
          : 'bg-paper-card border border-ink-subtle/15 text-ink-muted hover:text-ink hover:border-ink-subtle/40'
      }`}
    >
      <p className="font-mono text-xs uppercase tracking-[0.18em] leading-none">{label}</p>
      <p
        className={`font-mono text-[9px] uppercase tracking-[0.18em] mt-0.5 leading-none ${
          active ? 'opacity-80' : 'text-ink-subtle'
        }`}
      >
        {sub}
      </p>
    </button>
  );
}

function ReadingListStatic() {
  const papers = [
    {
      title: 'Universal Transformer',
      meta: 'Dehghani et al · 2018',
      note: 'The source. First transformer with recurrence + ACT halting.',
    },
    {
      title: 'Adaptive Computation Time',
      meta: 'Graves · 2016',
      note: 'The halting math, pre-transformer. Still the standard recipe.',
    },
    {
      title: 'Looped Transformers as Programmable Computers',
      meta: 'Yang, Lee, Papailiopoulos, Lee · 2024',
      note: 'Theory: looped transformers simulate programs in-context.',
    },
    {
      title: 'Scaling Latent Reasoning via Looped LMs',
      meta: 'arxiv:2510.25741 · 2025',
      note: 'Modern scaled-up result. Fixed K matches CoT on reasoning.',
    },
    {
      title: 'A Mechanistic Analysis of Looped Reasoning',
      meta: 'arxiv:2604.11791',
      note: 'What the loops compute internally. Read after the rest.',
    },
  ];

  return (
    <div className="space-y-2.5">
      {papers.map((p, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08, duration: 0.35 }}
          className="bg-paper-card rounded-xl p-4 shadow-card border border-ink-subtle/10 flex gap-4 items-start"
        >
          <p className="font-display text-xl font-semibold text-accent tabular-nums leading-none mt-1 shrink-0">
            {String(i + 1).padStart(2, '0')}
          </p>
          <div className="flex-1 min-w-0">
            <p className="font-display text-base font-semibold leading-tight">{p.title}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle mt-0.5 mb-1">
              {p.meta}
            </p>
            <p className="text-ink-muted text-xs leading-relaxed">{p.note}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ============================================================
   The lesson
   ============================================================ */

export default function LoopingLLMs() {
  return (
    <LessonShell
      title="Looped Language Models"
      subtitle="Depth through repetition, not new layers — Banach to DEQ to 2025 latent reasoning."
      kicker="ARCHITECTURE"
      estimatedMinutes={12}
    >
      <Section
        layout="slide"
        eyebrow="01 · puzzle"
        title="Build a looped transformer"
        narration="Every modern AI architecture starts by deciding one thing — how deep to build. The standard playbook since Ashish Vaswani and his team published Attention is All You Need at Google Brain in June 2017 has been to stack more unique layers and pay the parameter cost. GPT-3 went ninety-six layers. Llama 3's largest variant has one hundred twenty-six. The frontier just keeps stacking. But there's a side path that doesn't get talked about as much. Use fewer unique blocks, and just run them again. The idea isn't new — it descends straight from recurrent neural networks, which Jeff Elman first applied to language all the way back in 1990 at UCSD. Same set of weights, fired over and over, building representation through repetition rather than novelty. Now try it. The puzzle is to hit an effective depth of twenty-four. M is how many unique transformer blocks you bring. K is how many times each one fires. There are many valid combinations — M=1 with K=24, M=8 with K=3, and everything between. Each trade-off is real. Parameter cost stays at M. Compute cost grows linearly with K. Inference latency, memory pressure, the things you actually care about — all depend on which combination wins."
        discoveries={{
          'Ashish Vaswani': {
            brief: 'Lead author of Attention Is All You Need (2017). Indian-American researcher, formerly at Google Brain. Left in 2021 and founded Essential AI in 2023.',
            deep: 'Vaswani was working under Jakob Uszkoreit at Google Brain when the transformer paper came together. The eight-author paper was drafted in a matter of weeks. His startup Essential AI raised $56M Series A in 2023 specifically to commercialize transformer-derived architectures. The original transformer team has scattered — Łukasz Kaiser is at OpenAI, Aidan Gomez founded Cohere, Niki Parmar joined Vaswani at Essential.',
          },
          'Attention is All You Need': {
            brief: 'Vaswani et al, June 2017. Six pages that killed recurrence and convolution as the dominant sequence-modeling primitives.',
            deep: 'The paper was originally aimed at machine translation. The authors did not anticipate it would obsolete most of seq2seq research within months. Its citation impact rivals the 1986 backpropagation paper and the 1989 CNN paper. The full author list — Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin — has scattered across the major labs and founded several startups between them.',
          },
          'RNNs': {
            brief: 'Recurrent Neural Networks — networks where the same set of weights is applied at each time step, processing a sequence one element at a time.',
            deep: 'The conceptual parent of looped LMs. Both share weights across iterations. The difference: classical RNNs iterate over POSITIONS in a sequence (time); looped LMs iterate over DEPTH at the same position. Universal Transformer (Dehghani 2018) was the first to apply RNN-style weight sharing to transformer depth rather than sequence length. The mathematical machinery is identical.',
          },
          'Jeff Elman': {
            brief: 'Cognitive scientist at UCSD. His 1990 paper "Finding Structure in Time" introduced the simple recurrent network — the "Elman network" — for language modeling.',
            deep: 'Elman trained RNNs on tiny synthetic languages and showed they could learn grammatical categories without being told what they were. The paper anchors the conceptual ancestry of LSTMs, transformers, and looped LMs — the idea that a network can build hierarchical structure through repeated application of a learned function. He died in 2018; UCSD\'s cognitive science department building is named after him.',
          },
          'Llama 3': {
            brief: "Meta's 2024 frontier open-weight model family. The 405B variant has 126 transformer layers.",
            deep: 'The Llama series is the de facto open-weights baseline for frontier work. Llama 3 405B was trained on ~15T tokens. The architecture is essentially vanilla transformer with grouped-query attention and rotary position embeddings — no looping. Looped variants of Llama have been explored in research papers but not yet at frontier scale.',
          },
        }}
      >
        <BuildYourTransformerGame />
      </Section>

      <Section
        layout="slide"
        eyebrow="02 · puzzle"
        title="Run the forward pass yourself"
        narration="Here's where it gets concrete. Inside a looped block, the weights themselves are frozen across iterations. What does change is the hidden state — the vector of activations being passed through. Click run-next-loop. The bars on the left are the input state. The bars on the right are what the same block produces. Now click again. The output of the last loop becomes the input of the next. Watch how the state stabilizes after a few passes — that's the model literally reasoning in latent space, one fixed step at a time. The math here is the same problem Sepp Hochreiter analyzed in his 1991 master's thesis at TU Munich, when he discovered what we now call the vanishing gradient problem. Multiplying by the same weight matrix repeatedly is what makes training a stack of K loops hard — small changes either compound out of control or fade to nothing. Hochreiter's solution six years later, with Jürgen Schmidhuber, was the LSTM — gating machinery that lets signal survive long iteration chains. Modern looped LMs don't use LSTM-style gates. They fight the same problem with normalization layers, careful weight initialization, and gradient checkpointing. The mechanism on screen is identical to an RNN unrolled — just for depth instead of for time."
        discoveries={{
          'hidden state': {
            brief: 'The vector of intermediate activations passed between layers (or loop iterations). Carries everything the model has "computed so far" about the input.',
            deep: 'In a transformer, the hidden state is a (sequence_length × hidden_dim) matrix at every layer. Hidden_dim is typically 2048–16384 in modern frontier models. Each token has its own vector that gets transformed by each layer or loop. The looped-LM thesis is that you can keep refining this state with the same parameters and gain effective depth without growing parameter count.',
          },
          'Sepp Hochreiter': {
            brief: 'Austrian computer scientist. His 1991 master\'s thesis at TU Munich identified the vanishing gradient problem in recurrent networks — a discovery that delayed neural network adoption for years.',
            deep: 'Hochreiter went on to co-invent the LSTM with Jürgen Schmidhuber in 1997 as a direct fix for the problem he identified. He\'s still active — runs the Institute for Machine Learning at JKU Linz and has been a vocal critic of the transformer-only zeitgeist, arguing that LSTM ideas are still underused at scale. His 1991 thesis was written in German and remained largely unknown in the English-speaking world until the late 1990s.',
          },
          'vanishing gradient': {
            brief: 'When you backpropagate through many layers or loop iterations with shared weights, gradients can shrink exponentially toward zero — making the early layers effectively untrainable.',
            deep: 'The math: if you multiply a gradient by a Jacobian with spectral radius less than 1 at each step, K applications shrink it by that factor to the K-th power. Yoshua Bengio, Patrice Simard, and Paolo Frasconi formalized the analysis in 1994. The opposite failure mode — exploding gradients — happens when the spectral radius exceeds 1. Mitigations: gated units (LSTM, GRU), residual connections (ResNet, 2015), careful initialization, and gradient clipping. Looped LMs hit the same problem head-on because K applications of the same block is exactly the worst case.',
          },
          'LSTM': {
            brief: 'Long Short-Term Memory networks. Hochreiter & Schmidhuber, 1997. Solved vanishing gradients by adding gating mechanisms that let signal flow unaltered across many time steps.',
            deep: 'For a decade and a half, LSTM was the workhorse of every sequence model — speech recognition, machine translation, language modeling. It was only displaced by transformers after 2017. Schmidhuber still maintains, fairly publicly, that most of modern deep learning is built on LSTM-era insights. The original 1997 paper was rejected from NeurIPS multiple times before being published in Neural Computation.',
          },
          'Jürgen Schmidhuber': {
            brief: 'Swiss-German computer scientist. Hochreiter\'s PhD advisor and LSTM co-inventor. Director at the Dalle Molle AI institute (IDSIA) in Switzerland, now also at KAUST in Saudi Arabia.',
            deep: 'Schmidhuber is famous for relentlessly arguing that his lab\'s 1990s work anticipated most modern deep learning. He\'s often correct — fast weight programmers (1991) prefigured transformers, his unsupervised learning work prefigured GANs. He\'s also famously combative at conferences, regularly standing up during talks to dispute attribution.',
          },
        }}
      >
        <ForwardPassSim />
      </Section>

      <Section
        layout="slide"
        eyebrow="03 · puzzle"
        title="Banach's theorem, in your hands"
        narration="Here's a question that sounds almost too simple. If you take a function and apply it to a number, then apply it again to the result, then again — do you eventually settle on something? In 1922, a young Polish mathematician named Stefan Banach proved the answer is yes, as long as the function is a contraction map — meaning every time you apply it, the points it produces get strictly closer to each other than they started. The result is now called the Banach fixed-point theorem, and the proof fits on a page. But that one-page proof is the mathematical bedrock under every looped language model, every Deep Equilibrium Model, and even most of the numerical ODE solvers your physics simulations are using right now. Banach himself died young, of cancer, in Soviet-occupied Lviv in 1945. The school of mathematics he led used to meet in a café called the Scottish Café, and they wrote unsolved problems in a notebook with prizes attached — including, famously, a live goose for problem 153. The math you're about to play with came out of those meetings. Here's the setup. The green dot is z-star — the fixed point you're trying to reach. The function f is shown as a vector field. Drag z-naught anywhere on the plane. Pick K, the number of times to iterate. Some functions converge fast; some slowly; some spiral; one diverges entirely. There are four levels. Level one — find the equilibrium of a single f. Level two — three candidate f's, pick the one that converges fastest. Level three — set K precisely to reach within tolerance epsilon. Level four is the real DEQ design problem. You're given a compute budget, two candidate f's with different per-loop costs, and you have to choose both f and K to hit the target. The cheapest path through that compute budget is what Shaojie Bai's 2019 PhD work at CMU showed how to find analytically, without iterating at all — that's what Deep Equilibrium Models do."
        discoveries={{
          'Stefan Banach': {
            brief: 'Polish mathematician, 1892–1945. Founded the Lwów School of functional analysis. Died of cancer in Soviet-occupied Lviv just months before WWII ended.',
            deep: 'Banach was self-taught for most of his early life — he never finished a formal undergraduate degree. He was discovered by Hugo Steinhaus in 1916, who overheard him and a friend discussing Lebesgue integrals on a park bench in Kraków. Steinhaus called it the "greatest mathematical discovery of his life." Banach\'s 1932 book on linear operators is still the foundational text for functional analysis.',
          },
          'Scottish Café': {
            brief: 'A café in Lwów (then Poland, now Lviv, Ukraine) where Banach, Steinhaus, Mazur, Ulam, and the rest of the Lwów school did their mathematics from the 1930s through 1941.',
            deep: 'They wrote unsolved problems in a notebook called the Scottish Book — over 190 problems in total, with prizes attached. Problem 153, posed by Stanisław Mazur in 1936 (a question about basis representations in Banach spaces), carried a prize of a live goose. The problem was solved in 1972 by Per Enflo, a Swedish mathematician, who came to Warsaw to collect his goose. The ceremony was televised. Most of the school died or fled during the war; Ulam ended up at Los Alamos working on the H-bomb.',
          },
          'Banach fixed-point theorem': {
            brief: 'For any contraction f on a complete metric space, there is exactly one fixed point z*, and iterating f from any starting point converges to it.',
            deep: 'The proof: pick any starting point z. The sequence z, f(z), f(f(z)), ... is Cauchy (each successive pair is closer than the previous one by factor c), so it converges. Call the limit z*. Apply f to it — since f is continuous, you get f(z*). But the sequence z, f(z), f(f(z))... has the same limit as f(z), f(f(z)), ... so f(z*) = z*. Uniqueness: if there were two fixed points, applying f would shrink the distance between them by factor c, contradiction. Done in five lines. The convergence rate is c^K, so picking K = log(epsilon)/log(c) reaches any tolerance.',
          },
          'contraction map': {
            brief: 'A function f where applying it brings any two points closer together — formally, |f(x)−f(y)| ≤ c·|x−y| for some c<1.',
            deep: 'The constant c is the Lipschitz constant, named for Rudolf Lipschitz (1832–1903), a German mathematician at Bonn. He introduced it in 1864 to study ordinary differential equations. The Picard–Lindelöf theorem — existence and uniqueness of ODE solutions — is actually a direct application of Banach\'s theorem to the contraction defined by an integral equation. Every numerical ODE solver is, deep down, fixed-point iteration. Same for Newton\'s method, gradient descent with small enough learning rate, and policy iteration in reinforcement learning.',
          },
          'Deep Equilibrium Models': {
            brief: 'DEQ — Shaojie Bai, J. Zico Kolter, Vladlen Koltun. NeurIPS 2019. Networks that compute their output as the fixed point of a single layer, trained via implicit differentiation. Effectively infinite-depth networks with constant memory cost.',
            deep: 'Looped LMs with K=8 are essentially finite-step approximations to DEQs. The DEQ trick: instead of running the layer K times forward, solve f(z)=z directly with Anderson acceleration or Broyden\'s method. Backprop through the equation rather than the unrolled iterations — using the implicit function theorem, you never store intermediate states. Memory is constant in depth. Downside: convergence isn\'t guaranteed for arbitrary parametrized f, so most DEQs use input-injection tricks. The 2019 paper got SOTA on WikiText-103 language modeling at a third the parameters of comparable transformers. Bai\'s 2022 PhD thesis on multiscale DEQs is the modern reference.',
          },
          'Shaojie Bai': {
            brief: 'CMU PhD student of Zico Kolter (graduated 2022). First-authored DEQ networks and the multiscale extension. Now research scientist at Apple.',
            deep: 'Bai\'s thesis "On the Equivalence Between Implicit and Explicit Deep Learning" is a careful unification of looped models, neural ODEs, and DEQs into a single mathematical framework. It argues all three are doing the same thing with different parameterizations. Worth reading if you want to see the family tree of implicit-layer methods drawn clean.',
          },
          'Zico Kolter': {
            brief: 'CMU professor, Chief Scientist at Bosch AI, joined Anthropic in 2024. Built much of the academic backbone of implicit-layer methods and certified robustness.',
            deep: 'Kolter\'s group produced DEQ (2019), the OptNet / cvxpylayers line of differentiable optimization, and Wong & Kolter\'s adversarial-robustness work. He\'s on the board of OpenAI as their independent oversight director after the 2023 board crisis. His joining Anthropic in 2024 was widely read as a signal that the implicit-layer thread was about to get serious industry attention.',
          },
        }}
      >
        <BanachPlayableScene />
      </Section>

      <Section
        layout="slide"
        eyebrow="04"
        title="Thinking in silence"
        narration="When a normal model reasons through a hard problem, it has to think out loud. Every intermediate step burns output tokens that stream across your screen. That's chain-of-thought reasoning, popularized in 2022 when Jason Wei at Google Brain showed that just adding 'let's think step by step' to a prompt massively improved arithmetic accuracy on benchmarks like GSM8K. The technique is now the foundation of every reasoning model — OpenAI's o1, DeepSeek R1, Anthropic's extended thinking. But a looped model does something stranger. It thinks silently, inside the forward pass, looping its own block over and over before emitting a single answer token. None of the intermediate reasoning surfaces. The 2025 latent reasoning paper from EleutherAI showed eight internal loops can match twenty-two tokens of visible chain-of-thought on multi-hop benchmarks. There's a parallel thread from Stanford called Quiet-STaR, where the model thinks token by token in silence — same target, different machinery. Both share a common thesis with looped LMs — that the cheapest form of compute is the kind that never leaves the network and never costs you an output token. The big open question is whether silent reasoning ever genuinely surpasses verbalized reasoning. As of now the empirical answer is roughly: matches it cheaply on tasks the model already had the capacity for; doesn't unlock new capabilities the way scale does."
        discoveries={{
          'chain-of-thought': {
            brief: 'Prompting technique where the model is encouraged to emit intermediate reasoning steps before the final answer. Jason Wei et al, Google Brain, January 2022.',
            deep: 'The original paper showed that just adding "Let\'s think step by step" to prompts massively improved GSM8K math accuracy for large enough models — but only above ~62B parameters. The phenomenon is a clean example of an emergent capability. The CoT pattern is the conceptual ancestor of o1, DeepSeek R1, and the whole reasoning-model thread that took over in 2024.',
          },
          'Jason Wei': {
            brief: 'Researcher at OpenAI (formerly Google Brain). First-authored the chain-of-thought paper in 2022 at age 26.',
            deep: 'Wei joined OpenAI in early 2023 and has been one of the public faces of the o1 / o3 reasoning-model line. His earlier work on emergent abilities — the claim that capabilities appear suddenly with scale — is one of the most-cited and most-debated papers of the 2020s. Stanford grad school dropout.',
          },
          'o1': {
            brief: "OpenAI's first dedicated reasoning model, released September 2024. Spends substantial inference compute on hidden chain-of-thought before answering.",
            deep: "o1 was the moment 'inference-time compute' became a frontier-lab strategy. The model is fundamentally a chain-of-thought generator that's been RL-finetuned to think well. Looped LMs and Quiet-STaR are research-track attempts at the same outcome via different mechanisms — pushing compute into the forward pass rather than into emitted tokens. o3 followed in late 2024, scaling the same approach.",
          },
          'Quiet-STaR': {
            brief: 'Stanford 2024 paper by Eric Zelikman et al. Models learn to generate "thinking tokens" between every word, but those tokens are never emitted to the user.',
            deep: "Quiet-STaR's thinking is token-level, not depth-level. It's the direct token-level cousin of looped LMs. Trained with a REINFORCE-style objective on whether the thought improved next-token prediction. The paper shows non-trivial improvements on zero-shot reasoning benchmarks. Eric Zelikman has been steadily building the implicit-reasoning thread since his earlier STaR paper in 2022.",
          },
          'EleutherAI': {
            brief: 'Open-source AI research collective founded in 2020 by Connor Leahy, Sid Black, and Leo Gao. Started on a Discord server. Produced GPT-J, GPT-NeoX, the Pile dataset, and a lot of the open-weights pretraining infrastructure.',
            deep: "EleutherAI is the closest thing the open-source AI world has to a research lab. They've consistently put out papers and models that would otherwise have been locked inside OpenAI or DeepMind. Leahy left in 2022 to found Conjecture for AI safety work. The lab is informally aligned with AI safety and mechanistic interpretability research. Stella Biderman has been the de facto research lead since.",
          },
        }}
      >
        <SilentThinkingScene />
      </Section>

      <Section
        layout="slide"
        eyebrow="05 · puzzle"
        title="Gradient surgery"
        narration="Looping isn't free at training time. The same set of weights gets touched K times in one forward pass — and during backpropagation, they get blamed K times. All those gradient contributions sum into the same parameter update. The failure modes are well-known: exploding gradients when the spectral radius of the Jacobian drifts above one, vanishing gradients when it falls below, and out-of-memory crashes when K-fold activation storage exceeds your VRAM. Each one shows up as a different curve shape in your training log. Now you're the gradient surgeon. Three broken training runs are waiting for you — one that explodes mid-training, one that plateaus and never recovers, and one that crashes from memory pressure. For each, you'll diagnose the failure and apply one of five mitigations. Scaled initialization keeps the spectral radius near one. Layer normalization at the loop boundary resets state magnitude between iterations. Gradient clipping caps the explosion at the cost of masking root cause. Gradient checkpointing — Tianqi Chen's 2016 trick — recomputes activations on backward instead of storing them. And lowering K avoids the issue by giving up depth. The right mitigation depends on the failure. Pick wrong and the curve doesn't recover."
        discoveries={{
          'backprop': {
            brief: 'Short for backpropagation — the algorithm that computes gradients through a neural network via the chain rule, layer by layer in reverse.',
            deep: 'Backprop was independently rediscovered several times. Paul Werbos described it in his 1974 Harvard PhD thesis, but the modern formulation comes from the 1986 Rumelhart, Hinton, and Williams paper. For RNNs and looped LMs, the variant is backpropagation through time (BPTT), Werbos 1990 — gradients flow backward through every iteration of the same weights, accumulating into a single update.',
          },
          'spectral radius': {
            brief: 'The maximum absolute eigenvalue of a matrix. For a Jacobian, it controls how much the matrix amplifies or shrinks signal.',
            deep: "If the spectral radius is exactly 1, repeated multiplication preserves signal magnitude — exactly what you want for K applications of the same block. Less than 1, gradients vanish. Greater, they explode. This is why orthogonal initialization (spectral radius = 1 by construction) works well for RNNs and looped LMs. Henaff, Szlam & LeCun's 2016 paper formalized this for deep architectures.",
          },
          'gradient checkpointing': {
            brief: "Memory-saving training trick: don't store all intermediate activations during the forward pass. Recompute them during backprop. Trades memory for a ~1.3× wall-clock cost on backward.",
            deep: 'Formalized by Tianqi Chen, Bing Xu, Chiyuan Zhang, and Carlos Guestrin in their 2016 paper "Training Deep Nets with Sublinear Memory Cost." Now standard in every large-model training stack. For looped LMs, it\'s what makes K=8 or higher training tractable on commodity GPUs — the alternative is storing K full activation snapshots in memory per training step.',
          },
          'Tianqi Chen': {
            brief: 'CMU/UW assistant professor, co-founded OctoML. Author of XGBoost, Apache MXNet, Apache TVM, and the gradient checkpointing paper — infrastructure that touches every ML workflow.',
            deep: "Chen's output rate is borderline absurd. He wrote XGBoost as a PhD student. He wrote MXNet at the same time. TVM, the compiler stack for ML, came next. He left academia to found OctoML in 2019, which was acquired by Nvidia in 2024. Few researchers have a higher infrastructure-impact-per-paper ratio.",
          },
          'BPTT': {
            brief: "Backpropagation Through Time — the algorithm for training networks with shared weights across iterations. Conceptually, unroll the loop into K copies, then do normal backprop.",
            deep: "BPTT was formalized by Paul Werbos in 1990. The naive version stores all K intermediate activations, blowing up memory linearly with K. Truncated BPTT — only backprop K' < K steps — was the classical workaround for RNN training. Modern looped LMs use gradient checkpointing instead, which is strictly better when you can pay the recomputation cost.",
          },
        }}
      >
        <GradientSurgeon />
      </Section>

      <Section
        layout="slide"
        eyebrow="06 · puzzle"
        title="Allocate your compute"
        narration="Looping is one of several ways to spend inference compute. Chain-of-thought spends tokens. Mixture-of-experts spends parameters per token. Speculative decoding spends draft-model FLOPs to batch more verifier work. Loops spend depth. The frontier labs are quietly building all four. Different query types reward different allocations — a factual lookup gets nothing from extra reasoning, but it benefits from the right specialized expert. A multi-hop chain wants loops or chain-of-thought. Code generation wants width and throughput. Creative writing wants varied generation. Now play it. Five query types come in sequentially. You have a budget of one hundred compute units per query. Distribute them across the four paradigms. Watch the predicted accuracy update as you allocate. Submit each query when remaining hits zero. At the end you get scored against the optimal mix per query — and your run total against the optimal portfolio."
        discoveries={{
          'speculative decoding': {
            brief: 'Inference-time speedup: a small "draft" model proposes K tokens, the large model verifies them in parallel.',
            deep: 'Speculative decoding (Leviathan et al, 2022; Chen et al, 2023) gives 2-4× wall-clock speedup with no quality loss when draft and target agree often. It\'s a throughput trick, not a quality trick — won\'t help on hard problems where the draft is wrong. Now standard in production serving stacks like vLLM and TGI.',
          },
          'inference-time compute': {
            brief: 'The class of techniques that spend more compute at inference (not training) to improve answer quality.',
            deep: 'The big shift of 2024-2025. o1, R1, looped LMs, Quiet-STaR, MCTS-based reasoning — all are bets that inference-time compute scales better than parameters past a certain point. The scaling laws for inference compute are still being mapped; preliminary results suggest ~log gains in accuracy per linear inference compute, similar to training scaling.',
          },
        }}
      >
        <ComputeAllocator />
      </Section>

      <Section
        layout="slide"
        eyebrow="07"
        title="The training tax"
        narration="Here's the cost most papers downplay. Looping K times means K forward passes per training step — and K backward passes through the exact same weights. Activation memory normally scales with K too, because backpropagation through time needs every intermediate state to compute gradients. A K-equals-eight looped model costs roughly eight times the training compute of a single-block model, even though it has eight times fewer parameters. The net is an unusual trade. Cheap at inference once trained, expensive to train in the first place. It's the opposite of mixture-of-experts, where you can swell the total parameter count without paying per-token FLOPs, but you have to load the whole model into VRAM at inference time. DeepSeek-V3 is the modern example — 671 billion total parameters, only 37 billion active per token. Gradient checkpointing fixes the looped-LM memory blowup at the cost of recomputing activations on the backward pass — about thirty percent extra wall-clock for the privilege. The training-cost asymmetry is why looped LMs haven't shown up at frontier scale yet, even though they're competitive at one to three billion parameters. Anyone with frontier compute spends it on more unique parameters instead of training cycles."
        discoveries={{
          'mixture-of-experts': {
            brief: 'MoE — architecture where each token is routed to a small subset of "expert" sub-networks (typically 2 of 64 or 8 of 256). Parameter count scales, but per-token FLOPs stay constant.',
            deep: "MoE descends from Geoff Hinton's 1991 mixture-of-experts paper, but the modern transformer version is Shazeer et al, 2017 (\"Outrageously Large Neural Networks\"). Modern frontier models — Mixtral, DeepSeek-V3, widely-believed GPT-4 — are all MoE. The trade-off vs looped LMs is opposite. MoE: more parameters, constant compute. Looped: constant parameters, more compute. They compose; you can build a looped MoE, and a few research papers in 2025 have.",
          },
          'DeepSeek-V3': {
            brief: 'Chinese open-weights frontier model released December 2024. 671B total parameters, 37B active per token via MoE routing.',
            deep: "DeepSeek-V3 was the model that made the West realize how cheap frontier training could be. Trained for under $6M on 2048 H800 GPUs. The architecture includes multi-head latent attention (MLA), which compresses the KV cache dramatically — directly relevant to the cache-tax problem looped LMs face. DeepSeek released the weights, the architecture report, and most of the training infrastructure.",
          },
          'Paul Werbos': {
            brief: 'American economist and engineer. His 1974 Harvard PhD thesis first described modern backpropagation. His 1990 paper formalized BPTT for recurrent networks.',
            deep: "Werbos's 1974 thesis was titled \"Beyond Regression: New Tools for Prediction and Analysis in the Behavioral Sciences\" — explicitly framed as an economics-and-psychology contribution. It sat largely unread for over a decade. He spent most of his career as a program director at NSF rather than as a tenured academic. The Rumelhart-Hinton-Williams 1986 backprop paper is what made the technique famous, but Werbos had it first.",
          },
          'BPTT': {
            brief: 'Backpropagation Through Time — the algorithm for training networks with shared weights across iterations.',
            deep: "Naively, unroll the loop into K copies, then do normal backprop. Memory scales linearly with K because you store every intermediate activation. Truncated BPTT — only backprop K' less than K steps — was the classical RNN workaround. Modern looped LMs replace this with gradient checkpointing.",
          },
        }}
      >
        <TrainingComputeScene />
      </Section>

      <Section
        layout="slide"
        eyebrow="08"
        title="What actually gets shared"
        narration="Sharing the whole block is the cleanest version — that's what Mostafa Dehghani's team at Google Brain did with Universal Transformer back in 2018. But you can be more surgical. Share just the attention weights, and the multilayer perceptron — the MLP — can still specialize per loop iteration. Or share just the MLP, and attention stays unique at each iteration. Each choice trades parameter efficiency for representational flexibility. The 2018 paper used full sharing and matched LSTM baselines on bAbI reasoning tasks. Modern variants in 2024 and 2025 are exploring all three sharing patterns. Full sharing is still the most common default, partly because it's the most parameter-efficient, partly because it composes cleanly with adaptive halting. The bAbI benchmark Dehghani's team used was a set of twenty synthetic reading-comprehension tasks released by Facebook AI Research in 2015 — the standard reasoning testbed before LLMs made larger benchmarks like MMLU and HellaSwag the norm. Universal Transformer's claim to fame was solving bAbI fully where vanilla transformers stalled — the first concrete hint that recurrence helps specifically on tasks with algorithmic structure. The paper was largely ignored at the time, overshadowed by BERT and GPT-1 launching the same year, and only rediscovered when latent reasoning got hot in 2024."
        discoveries={{
          'Universal Transformer': {
            brief: 'Dehghani, Gouws, Vinyals, Uszkoreit, Kaiser — Google Brain, ICLR 2019. First paper to apply RNN-style weight sharing across transformer depth, with an adaptive halting mechanism baked in.',
            deep: 'The paper compared against vanilla transformers on bAbI, learning-to-execute, and machine translation. Found that the recurrent structure helped most on tasks with algorithmic structure. Largely ignored at the time — overshadowed by the BERT and GPT-1 hype the same year. Rediscovered in 2024 when latent reasoning got hot. Łukasz Kaiser, one of the authors, is now at OpenAI working on the o-series reasoning models.',
          },
          'Mostafa Dehghani': {
            brief: 'Iranian-Dutch researcher at Google DeepMind. First-authored Universal Transformer in 2018 and has been a steady contributor to attention and transformer-architecture work since.',
            deep: "PhD from University of Amsterdam, originally in information retrieval. At Google he's worked on attention efficiency, Vision Transformers (the original ViT paper), and the Pathways system. His co-author Łukasz Kaiser was also on the original Attention Is All You Need paper, so Universal Transformer was effectively Kaiser revisiting his own architecture with recurrence one year later.",
          },
          'bAbI': {
            brief: 'A set of 20 synthetic reading-comprehension tasks released by Facebook AI Research in 2015. Designed to test specific reasoning capabilities — counting, induction, deduction, multi-hop, and so on.',
            deep: "bAbI was the standard reasoning benchmark in the pre-LLM era. Facebook's Memory Networks paper (2014) introduced it as a controlled testbed. By 2017 LSTMs were solving most of it; by 2019 transformers had crushed it. Universal Transformer's claim to fame in 2018 was solving bAbI fully where vanilla transformers stalled — a hint that recurrence helps on algorithmic structure.",
          },
          'Łukasz Kaiser': {
            brief: "Polish-born researcher, now at OpenAI. Co-author of Attention Is All You Need (2017), Universal Transformer (2018), and the original Transformer-XL.",
            deep: "Kaiser is one of the few people who has both invented the original transformer AND tried to fundamentally rethink it (with recurrence). He joined OpenAI in 2021 and has been part of the o1/o3 reasoning-model push. His Polish theoretical-CS background shows in his consistent focus on architectures with provable computational properties.",
          },
          'MMLU': {
            brief: 'Massive Multitask Language Understanding — Hendrycks et al, 2020. The standard general-knowledge benchmark for LLMs, covering 57 subjects from elementary math to professional law.',
            deep: "MMLU was the de facto frontier benchmark from 2020 until ~2024, when frontier models started saturating it (scoring above 85%). It's been replaced at the frontier by GPQA, BIG-Bench Hard, and tougher reasoning benchmarks. Dan Hendrycks, the lead author, now runs the Center for AI Safety.",
          },
        }}
      >
        <WeightTyingScene />
      </Section>

      <Section
        layout="slide"
        eyebrow="09 · puzzle"
        title="You're the halting head"
        narration="Not every problem deserves eight loops. A chess engine doesn't think for the same amount of time on every move. A grandmaster spends seconds on a forced capture and minutes on a closed positional decision. Adaptive halting gives a looped LM the same kind of dynamic compute allocation. A tiny head sits on top of the network and emits a stop probability at each iteration. The training signal is a careful trade-off — a ponder cost penalizes extra iterations, but answer-loss penalizes early termination. The math comes from Alex Graves's 2016 paper Adaptive Computation Time, written while he was at DeepMind. Graves is one of the most underrated architects in deep learning — he also invented connectionist temporal classification, the algorithm that powers every speech recognition system, and Neural Turing Machines, the direct ancestor of attention. Now you play the halting head. Three problems of varying difficulty. Watch the internal confidence at each iteration and click halt when you think the model has it. Halt too early, you get the wrong answer. Halt too late, you wasted compute. Both are penalized in real ACT training. The optimal policy is exactly what the halting head converges to — minimize compute, maximize correctness, find the trade-off that fits your task."
        discoveries={{
          'Adaptive Computation Time': {
            brief: 'ACT — Alex Graves, DeepMind 2016. Lets a network spend variable compute per input by emitting a halting probability at each step.',
            deep: "ACT was originally proposed for RNNs, not transformers. The training trick: a ponder cost added to the loss penalizes extra iterations, while answer loss penalizes early termination. The model learns to halt early when confident. Universal Transformer (2018) was the first paper to bolt ACT onto transformers. Modern test-time-compute models like o1 and DeepSeek R1 use very different mechanisms, but the conceptual ancestor is ACT.",
          },
          'Alex Graves': {
            brief: 'British research scientist at DeepMind from 2014 to 2023. Now independent. Probably the single most underrated architect in deep learning history.',
            deep: "Graves invented or co-invented: connectionist temporal classification (CTC, used in every speech recognition system), Neural Turing Machines (direct precursor to attention), differentiable neural computers, ACT halting, and the speech-recognition LSTMs that powered Google's Assistant. He did his PhD under Schmidhuber. Notably quiet and publication-light for someone whose ideas underpin so much modern AI.",
          },
          'Neural Turing Machines': {
            brief: 'Graves, Wayne, Danihelka, DeepMind 2014. A neural network with an external memory bank it can read from and write to via attention.',
            deep: "NTMs were the conceptual precursor to attention-based transformers. The 2014 paper introduced soft attention as a differentiable way to address memory locations. Two years later, attention was the core mechanism of Bahdanau's neural machine translation paper, then Vaswani's 2017 transformer. Without NTMs, no transformers. The memory-bank framing has come back into fashion with retrieval-augmented generation.",
          },
          'ponder cost': {
            brief: "A regularization term added to ACT training loss that penalizes the model for using more iterations. Forces the halting head to learn when to stop.",
            deep: "Without ponder cost, ACT models would just learn to always loop the maximum K — more compute usually helps accuracy. The cost is a hyperparameter you tune to balance speed against quality. Modern test-time-compute training (o1, R1) replaces this with RL reward shaping but the trade-off is identical: more thinking generally helps, but you have to pay for it.",
          },
          'DeepMind': {
            brief: 'London-based AI lab founded 2010 by Demis Hassabis, Shane Legg, and Mustafa Suleyman. Acquired by Google in 2014 for £400M. Now Google DeepMind.',
            deep: "DeepMind produced AlphaGo, AlphaFold, AlphaZero, Atari DQN, WaveNet, and much of the foundational RL and attention work that shaped modern AI. Hassabis won the 2024 Nobel Prize in Chemistry for AlphaFold alongside John Jumper. Suleyman left for Microsoft AI in 2024; Legg is still Chief AGI Scientist.",
          },
        }}
      >
        <HaltOrContinueGame />
      </Section>

      <Section
        layout="slide"
        eyebrow="10 · puzzle"
        title="The KV-cache tax"
        narration="Here's the gotcha that catches everyone implementing this. The KV cache — the data structure that makes long-context inference fast by remembering keys and values from previous tokens — does not shrink when you loop. Visiting the same three blocks eight times still requires twenty-four separate stacks of cached attention, because each visit is attending over a different hidden state. Looping saves parameter memory. It does NOT save cache memory. At long context, that's where the bill actually comes due. The formula is two times the number of effective layers times sequence length times hidden dimension times bytes per element. For a model at one hundred twenty-eight thousand sequence length, four thousand hidden, and bfloat16 precision, with twenty-four effective layers, you're looking at roughly fifty gigabytes of cache per request. That's why frontier inference is bottlenecked on memory bandwidth, not raw FLOPs. There are research variants that share the cache across loop iterations — sometimes called token-recurrent or cross-iteration architectures — but they trade memory for representational expressiveness. DeepSeek's multi-head latent attention is a different approach to the same problem, compressing the cache via low-rank projection. The cache-sharing question is one of the most active design choices in late-2024 and 2025 looped-LM research. Drag the sliders below. Watch how cache memory scales with sequence length and effective depth — regardless of whether you got that depth from stacking or looping."
        discoveries={{
          'KV cache': {
            brief: 'Inference optimization: store the keys and values computed during attention so subsequent tokens don\'t have to recompute them. Standard in every modern LLM serving stack.',
            deep: 'The cache size is 2 × num_layers × seq_len × hidden_dim × bytes_per_element. At 8k context, 4k hidden, 24 layers, bf16, that\'s about 3 GB per request. For a 128k context model that\'s ~50 GB. Hence the modern obsession with cache compression — Mamba and state-space models try to obsolete the cache entirely. For looped LMs the cache is still keyed by (block, visit) pairs, so M=3, K=8 still gives you 24 cache "layers" worth of memory.',
          },
          'multi-head latent attention': {
            brief: "MLA — DeepSeek's KV-cache compression technique. Project keys and values into a low-dimensional latent space, store that instead. Massively reduces cache size with minimal quality loss.",
            deep: "MLA showed up in DeepSeek-V2 and got more polished in V3. Roughly: K and V are projected through a learned low-rank decomposition before being cached. At inference time, the cached low-rank vectors are projected back up. The technique gives DeepSeek's models a much larger effective context window for the same memory budget. It composes with looped LMs — you can have a looped architecture where each visit's cache is MLA-compressed.",
          },
          'memory bandwidth': {
            brief: "The rate at which data can be moved between GPU memory and compute units. For LLM inference, this is usually the bottleneck — not raw FLOPs.",
            deep: "Modern frontier inference is dominated by memory bandwidth, not arithmetic throughput. Loading the KV cache for each token is the killer cost — every generated token requires reading the full cache. This is why looped LMs are interesting for inference: fewer unique weights to load, even if the cache cost is unchanged. NVIDIA H100s have 3.35 TB/s memory bandwidth; H200s push 4.8. The cache-vs-bandwidth equation is what makes long-context serving expensive.",
          },
          'state-space models': {
            brief: "An alternative to attention. Mamba (Gu & Dao, 2023) is the most prominent example — uses a selective state-space mechanism instead of attention, with constant memory regardless of sequence length.",
            deep: "Mamba and other SSMs solve the cache problem by not having a cache. The sequence is processed via a recurrence with bounded state — like an RNN, but with much better gradient flow thanks to careful structure. Albert Gu's group at CMU has been pushing this thread. Mamba-2 came out in 2024; hybrid Mamba-transformer models (like Jamba) tried to get the best of both. They haven't displaced transformers at frontier scale, but they're real competitors.",
          },
        }}
      >
        <KVCacheArchitect />
      </Section>

      <Section
        layout="slide"
        eyebrow="11"
        title="When it wins, when it doesn't"
        narration="So when does this actually pay off? Looping wins on tasks with a step that repeats — arithmetic, multi-hop chains, traversal, parsing. The shared block learns the step once, and the loop counts how many times to apply it. It does not help much on pattern matching that one forward pass can solve — sentiment classification doesn't care how deep your network is past a point. And at frontier scale, beyond seventy billion parameters, unique-layer specialization starts to win again. Different layers learn different functions in big models; forcing them all to be the same block costs more than it saves. There's an interesting echo across the literature. In 1989, George Cybenko at Dartmouth proved the universal approximation theorem — a single-hidden-layer feedforward network with enough width can approximate any continuous function. Kurt Hornik extended it in 1991. Width can substitute for depth. Looped LMs are the depth-side dual of that result — depth can substitute for width, in the right regime. The 2024 paper by Yang et al titled Looped Transformers as Programmable Computers extends this dual all the way: looped transformers can in principle simulate any Turing machine. But both universality theorems share the same problem. They say absolutely nothing about how learnable the parameters are. That gap between what's representable in principle and what's trainable in practice is where all the interesting research lives."
        discoveries={{
          'universal approximation theorem': {
            brief: 'George Cybenko, 1989. A feedforward network with one hidden layer and enough neurons can approximate any continuous function on a compact domain, given a non-polynomial activation.',
            deep: "Cybenko's proof used a clever density argument with sigmoid activations. Kurt Hornik generalized it in 1991 to any non-polynomial activation. The theorem is celebrated and somewhat misleading — it says nothing about how MANY neurons you need (potentially exponentially many) or whether gradient descent will actually find them. The 2024 looped-transformer-as-programmable-computer paper by Yang et al is the depth-side analog: enough loops can simulate any program.",
          },
          'George Cybenko': {
            brief: 'American mathematician at Dartmouth. Best known for the 1989 universal approximation paper. Has also worked extensively in signal processing and cybersecurity.',
            deep: "Cybenko's 1989 paper appeared in Mathematics of Control, Signals, and Systems — not a major AI venue. It was largely ignored until the 2010s, when deep learning made it suddenly relevant. He's now emeritus at Dartmouth's Thayer School of Engineering. The kind of result that quietly became foundational decades after publication.",
          },
          'Kurt Hornik': {
            brief: "Austrian statistician at Vienna University of Economics. Extended Cybenko's universal approximation result in 1991 to arbitrary non-polynomial activations.",
            deep: "Hornik's 1991 paper showed the result was much more general than Cybenko realized — sigmoids weren't special. The proof technique generalizes via a clever use of the Stone-Weierstrass theorem. He's also a long-time core developer of R (the statistical language), maintaining the kernel since the late 90s. Has more obscure but foundational contributions than most people realize.",
          },
          'Yang 2024': {
            brief: 'Looped Transformers as Programmable Computers — Yang, Lee, Papailiopoulos, Lee. ICML 2024. Theoretical proof that looped transformers can simulate Turing machines and execute arbitrary programs.',
            deep: "The paper constructs explicit looped transformer programs for in-context gradient descent and a small CPU instruction set. Demonstrates that the looped architecture has the same computational power as a programmable computer — universality, but operationalized. Doesn't prove learnability, but provides the theoretical floor that motivates the modern empirical work.",
          },
          'learnability gap': {
            brief: "The difference between what a model architecture CAN represent in principle and what gradient-based training actually finds in practice.",
            deep: "Universal approximation theorems and looped-transformer universality results both prove existence, not findability. In practice, a single-hidden-layer network can fit anything but might need exponentially many neurons. A looped transformer can simulate any program but the training objective doesn't directly reward finding compact programs. This gap is where most modern theory work lives — generalization, optimization landscapes, neural tangent kernels, mean-field analysis.",
          },
        }}
      >
        <WhenItWinsScene />
      </Section>

      <Section
        layout="slide"
        eyebrow="12"
        title="Where to go next"
        narration="Five papers, in the order I'd read them. Start with Mostafa Dehghani's Universal Transformer from 2018 — that's the source paper, and it sets up both the depth-recurrence idea and the adaptive halting machinery in one go. Next, Shaojie Bai's 2019 Deep Equilibrium Models paper, for the mathematical depth — especially the implicit differentiation trick that lets you backpropagate through a fixed point without storing any intermediate states. Then Yang et al 2024, Looped Transformers as Programmable Computers, for the theoretical capacity argument — looped transformers can in principle simulate any program, with explicit constructions for in-context gradient descent and small instruction sets. The 2025 paper from EleutherAI on scaling latent reasoning is the modern empirical work, with real benchmark numbers from real model sizes and a clean ablation of K against task type. And finally, the 2026 mechanistic analysis paper — it reverse-engineers what the loops are actually computing internally, by reading the circuits trained looped networks converge to. Those five papers, in that order, take you from foundations to frontier. Each name and concept in this lesson is a clickable rabbit hole — generate a full lesson on any of them to keep going deeper. The graph of lessons grows wherever your curiosity pulls."
        discoveries={{
          'implicit differentiation': {
            brief: 'A way to compute gradients through an equation rather than through a fixed sequence of operations. If z* solves f(z*) = z*, you can get ∂z*/∂θ via the implicit function theorem without storing any intermediate states.',
            deep: 'For DEQ networks, this means infinite-depth gradient flow with constant memory. The math: ∂z*/∂θ = (I − ∂f/∂z)⁻¹ ∂f/∂θ evaluated at z*. The trick is solving the linear system (I − J)x = b for x using iterative methods like GMRES or Anderson acceleration. Same machinery powers a lot of meta-learning (MAML implicit), differentiable optimization (cvxpylayers), and physics simulators with neural components.',
          },
          'mechanistic interpretability': {
            brief: 'A research thread that aims to reverse-engineer what trained neural networks compute internally, often by reading individual circuits.',
            deep: "Pioneered by Chris Olah's group at Anthropic (and earlier at Distill / OpenAI). The toolkit includes activation patching, sparse autoencoders, and circuit analysis. Applied to looped LMs, it asks: what specific algorithm does each loop implement? Early results show looped models learn cleaner, more reusable circuits than stacked transformers — consistent with the depth-via-iteration intuition. Anthropic's interpretability team published a major paper on monosemantic features in 2024 that's a good entry point.",
          },
          'Yang 2024': {
            brief: 'Looped Transformers as Programmable Computers — Yang, Lee, Papailiopoulos, Lee. ICML 2024. The theoretical floor for what looped transformers can compute.',
            deep: "The paper constructs explicit looped-transformer programs for in-context gradient descent (showing a looped transformer can run SGD on a target task during inference) and for a small CPU-like instruction set. The result establishes that the looped architecture has the same computational power as a programmable computer. Doesn't address learnability or trainability, but provides the universality result that motivates modern empirical work.",
          },
        }}
      >
        <ReadingListScene />
      </Section>
    </LessonShell>
  );
}
