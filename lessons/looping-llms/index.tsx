import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LessonShell, Section } from '@/components';
import { TimelineScene } from '@/components/TimelineScene';
import { BanachPlayableScene } from './games/BanachPlayableScene';
import { HaltPlayableScene } from './games/HaltPlayableScene';
import { KVCacheArchitect } from './games/KVCacheArchitect';
import { ComputeAllocator } from './games/ComputeAllocator';
import { GradientSurgeon } from './games/GradientSurgeon';
import { CLOSING_TIMELINE } from './timelines/closing';
import { WHEN_IT_WINS_TIMELINE } from './timelines/when-it-wins';
import { WEIGHT_SHARING_TIMELINE } from './timelines/weight-sharing';
import charactersJson from './characters.json';
import { Playback } from '@/components/playback';
import { SILENT_THINKING, SILENT_THINKING_MANIFEST } from './productions/silent-thinking';
import { LOOPING_LLMS, LOOPING_LLMS_MANIFEST } from './productions/looping-llms';
import { hydrateManifestFromAudio } from '@/lib/loa-manifest-loader';

const SILENT_THINKING_HYDRATED = hydrateManifestFromAudio(
  SILENT_THINKING_MANIFEST,
  SILENT_THINKING,
  'looping-llms',
);

const LOOPING_LLMS_HYDRATED = hydrateManifestFromAudio(
  LOOPING_LLMS_MANIFEST,
  LOOPING_LLMS,
  'looping-llms',
);

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

function SilentThinkingPlayer() {
  const [mode, setMode] = useState<'stage' | 'legacy'>('stage');
  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex gap-1.5 flex-shrink-0">
        <ListToggleButton
          label="Stage"
          sub="lattice + R3F"
          active={mode === 'stage'}
          onClick={() => setMode('stage')}
        />
        <ListToggleButton
          label="Legacy"
          sub="hand-coded"
          active={mode === 'legacy'}
          onClick={() => setMode('legacy')}
        />
      </div>
      {mode === 'stage' ? (
        <div className="flex-1 min-h-0">
          <Playback
            production={SILENT_THINKING}
            manifest={SILENT_THINKING_HYDRATED}
            aspect="16:9"
          />
        </div>
      ) : (
        <SilentThinkingScene />
      )}
    </div>
  );
}

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
  const [mode, setMode] = useState<'matrix' | 'tour'>('matrix');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        <ListToggleButton
          label="Schemes"
          sub="all at once"
          active={mode === 'matrix'}
          onClick={() => setMode('matrix')}
        />
        <ListToggleButton
          label="Walk-through"
          sub="narrated tour"
          active={mode === 'tour'}
          onClick={() => setMode('tour')}
        />
      </div>
      {mode === 'matrix' ? (
        <WeightTyingStatic />
      ) : (
        <TimelineScene scene={WEIGHT_SHARING_TIMELINE} voiceMap={VOICE_MAP} autoPlay />
      )}
    </div>
  );
}

function WeightTyingStatic() {
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
  const [mode, setMode] = useState<'matrix' | 'tour'>('matrix');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        <ListToggleButton
          label="Matrix"
          sub="all at once"
          active={mode === 'matrix'}
          onClick={() => setMode('matrix')}
        />
        <ListToggleButton
          label="Walk-through"
          sub="narrated tour"
          active={mode === 'tour'}
          onClick={() => setMode('tour')}
        />
      </div>
      {mode === 'matrix' ? (
        <WhenItWinsStatic />
      ) : (
        <TimelineScene scene={WHEN_IT_WINS_TIMELINE} voiceMap={VOICE_MAP} autoPlay />
      )}
    </div>
  );
}

function WhenItWinsStatic() {
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
    <div className="h-[100svh] max-h-[100svh] flex flex-col bg-paper-tint overflow-hidden">
      <header className="flex-shrink-0 h-12 px-3 md:px-5 bg-paper-card border-b border-ink-subtle/10 flex items-center gap-3">
        <a
          aria-label="Exit lesson"
          className="text-ink-subtle hover:text-ink p-2 rounded-lg hover:bg-paper-tint transition"
          href="#/"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </a>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">ARCHITECTURE</p>
          <h1 className="font-display text-base font-semibold text-ink truncate">Looped Language Models</h1>
        </div>
      </header>
      <div className="flex-1 min-h-0">
        <Playback production={LOOPING_LLMS} manifest={LOOPING_LLMS_HYDRATED} aspect="16:9" />
      </div>
    </div>
  );
}
