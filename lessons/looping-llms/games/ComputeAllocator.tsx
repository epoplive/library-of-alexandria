import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

/* ============================================================
   Compute Allocator — distribute a fixed compute budget across
   four inference-time paradigms (CoT, K loops, MoE width,
   speculative decoding) per query. Each query type has a
   different optimal mix. Get graded on cumulative accuracy.
   ============================================================ */

type Paradigm = 'cot' | 'loops' | 'width' | 'spec';

interface Query {
  id: number;
  title: string;
  desc: string;
  /** Returns predicted accuracy 0..1 given an allocation summing to 100 */
  score: (alloc: Record<Paradigm, number>) => number;
  /** Hand-tuned optimal allocation for the run summary */
  optimal: Record<Paradigm, number>;
  teaching: string;
}

const PARADIGMS: { id: Paradigm; label: string; sub: string; color: string }[] = [
  {
    id: 'cot',
    label: 'CoT tokens',
    sub: 'Visible chain-of-thought. Linear cost in tokens.',
    color: 'bg-signal-info',
  },
  {
    id: 'loops',
    label: 'K loops',
    sub: 'Latent depth via shared blocks. Linear in K.',
    color: 'bg-accent',
  },
  {
    id: 'width',
    label: 'MoE experts',
    sub: 'More parameters routed per token (constant FLOPs).',
    color: 'bg-signal-warn',
  },
  {
    id: 'spec',
    label: 'Spec decoding',
    sub: 'Draft model + verifier. Throughput, not quality.',
    color: 'bg-signal-good',
  },
];

// Each query has a scoring function. The shape captures which paradigm
// matters most. Coefficients are illustrative, not from any single paper.
const QUERIES: Query[] = [
  {
    id: 1,
    title: 'Factual lookup',
    desc: '"What\'s the capital of Mongolia?" One forward pass should do it.',
    score: (a) =>
      clamp(
        0.55 + 0.003 * a.width + 0.0008 * a.cot - 0.001 * a.loops - 0.0005 * a.spec,
      ),
    optimal: { cot: 5, loops: 5, width: 70, spec: 20 },
    teaching: 'Lookups don\'t benefit from extra thinking — width gets you the right expert, spec decode gets the answer out fast.',
  },
  {
    id: 2,
    title: 'Multi-hop reasoning',
    desc: 'Chain of 5 facts: A north of B, B east of C, C south of D — where is A vs D?',
    score: (a) =>
      clamp(
        0.35 + 0.006 * a.loops + 0.004 * a.cot + 0.001 * a.width - 0.0008 * a.spec,
      ),
    optimal: { cot: 30, loops: 60, width: 10, spec: 0 },
    teaching: 'Multi-hop is where loops shine — each loop chains one more fact. CoT helps too. Spec decode is wasted here.',
  },
  {
    id: 3,
    title: 'Long-form math',
    desc: '"Solve: 3 mixed-step word problems involving rates, ratios, and proportions."',
    score: (a) =>
      clamp(
        0.3 + 0.005 * a.cot + 0.004 * a.loops + 0.002 * a.width - 0.0005 * a.spec,
      ),
    optimal: { cot: 55, loops: 30, width: 15, spec: 0 },
    teaching: 'Visible CoT is the GSM8K classic — writing out steps helps. Loops add silent depth. Width less critical at math.',
  },
  {
    id: 4,
    title: 'Code completion',
    desc: '"Complete this function — needs context awareness, type inference, library knowledge."',
    score: (a) =>
      clamp(
        0.45 + 0.005 * a.width + 0.0015 * a.loops + 0.001 * a.cot + 0.003 * a.spec,
      ),
    optimal: { cot: 10, loops: 15, width: 55, spec: 20 },
    teaching: 'Coding wants specialized experts (width) and fast generation (spec decode). Reasoning helps less than knowing the API.',
  },
  {
    id: 5,
    title: 'Creative writing',
    desc: '"Write a 500-word short story in the style of Borges."',
    score: (a) =>
      clamp(
        0.5 + 0.004 * a.width + 0.005 * a.spec + 0.001 * a.cot - 0.001 * a.loops,
      ),
    optimal: { cot: 5, loops: 5, width: 50, spec: 40 },
    teaching: 'Creative writing wants varied generation and throughput. Extra reasoning makes it stilted, not better.',
  },
];

function clamp(v: number): number {
  return Math.min(0.98, Math.max(0.05, v));
}

const TOTAL = 100;

export function ComputeAllocator() {
  const [idx, setIdx] = useState(0);
  const [alloc, setAlloc] = useState<Record<Paradigm, number>>({
    cot: 25,
    loops: 25,
    width: 25,
    spec: 25,
  });
  const [history, setHistory] = useState<{ q: number; acc: number; optAcc: number }[]>([]);
  const [submitted, setSubmitted] = useState<null | { acc: number; optAcc: number }>(null);

  const q = QUERIES[idx];
  const total = useMemo(
    () => alloc.cot + alloc.loops + alloc.width + alloc.spec,
    [alloc],
  );
  const remaining = TOTAL - total;
  const liveAcc = useMemo(() => (q ? q.score(alloc) : 0), [q, alloc]);
  const optAcc = useMemo(() => (q ? q.score(q.optimal) : 0), [q]);

  // Reset allocation between queries
  useEffect(() => {
    setAlloc({ cot: 25, loops: 25, width: 25, spec: 25 });
    setSubmitted(null);
  }, [idx]);

  if (idx >= QUERIES.length) {
    const totalAcc = history.reduce((s, h) => s + h.acc, 0);
    const optTotal = history.reduce((s, h) => s + h.optAcc, 0);
    const score = Math.round((totalAcc / optTotal) * 100);
    return (
      <div className="bg-paper-card rounded-2xl p-5 md:p-6 shadow-card flex flex-col gap-5 items-center text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          allocation run complete
        </p>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
              Your accuracy
            </p>
            <p className="font-display text-4xl font-semibold tabular-nums">
              {totalAcc.toFixed(2)}
            </p>
            <p className="font-mono text-[10px] text-ink-subtle">summed over 5</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
              Optimal
            </p>
            <p className="font-display text-4xl font-semibold tabular-nums">
              {optTotal.toFixed(2)}
            </p>
            <p className="font-mono text-[10px] text-ink-subtle">best possible</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
              Score
            </p>
            <p
              className={`font-display text-4xl font-semibold tabular-nums ${
                score >= 90
                  ? 'text-signal-good'
                  : score >= 75
                    ? 'text-signal-warn'
                    : 'text-signal-bad'
              }`}
            >
              {score}%
            </p>
            <p className="font-mono text-[10px] text-ink-subtle">of optimal</p>
          </div>
        </div>
        <p className="text-ink-muted text-sm max-w-md">
          Inference-time compute is a portfolio decision. Different query types reward different
          paradigms. The frontier labs are quietly building all four of these — looped LMs are one
          rebar in the wall.
        </p>
        <button
          type="button"
          onClick={() => {
            setIdx(0);
            setHistory([]);
            setSubmitted(null);
          }}
          className="px-4 py-2 rounded-xl border border-accent/30 text-accent font-mono text-[10px] uppercase tracking-[0.18em] hover:bg-accent-soft transition"
        >
          ↻ Run again
        </button>
      </div>
    );
  }

  function update(p: Paradigm, v: number) {
    setAlloc((prev) => ({ ...prev, [p]: v }));
  }

  function submit() {
    if (total !== TOTAL) return;
    setSubmitted({ acc: liveAcc, optAcc });
    setTimeout(() => {
      setHistory((h) => [...h, { q: q.id, acc: liveAcc, optAcc }]);
      setIdx((i) => i + 1);
    }, 2500);
  }

  if (submitted) {
    const gap = optAcc - submitted.acc;
    const verdict =
      gap < 0.02 ? 'optimal' : gap < 0.06 ? 'close' : gap < 0.12 ? 'workable' : 'off';
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-paper-card rounded-2xl p-5 md:p-6 shadow-card flex flex-col gap-4 border-2 ${
          verdict === 'optimal'
            ? 'border-signal-good/40'
            : verdict === 'close'
              ? 'border-signal-warn/40'
              : 'border-signal-bad/40'
        }`}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
          query {q.id}
        </p>
        <p className="font-display text-base">{q.title}</p>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
              Your accuracy
            </p>
            <p className="font-display text-3xl font-semibold tabular-nums">
              {submitted.acc.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
              Optimal allocation
            </p>
            <p className="font-display text-3xl font-semibold tabular-nums">
              {submitted.optAcc.toFixed(2)}
            </p>
          </div>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle mb-1">
            ideal mix
          </p>
          <div className="flex h-4 rounded overflow-hidden">
            {PARADIGMS.map((p) => (
              <div
                key={p.id}
                className={p.color}
                style={{ width: `${q.optimal[p.id]}%` }}
                title={`${p.label}: ${q.optimal[p.id]}%`}
              />
            ))}
          </div>
          <div className="flex gap-3 mt-2 font-mono text-[9px]">
            {PARADIGMS.map((p) => (
              <span key={p.id} className="text-ink-subtle">
                <span className={`inline-block w-2 h-2 rounded-sm ${p.color} mr-1 align-middle`} />
                {p.label} {q.optimal[p.id]}
              </span>
            ))}
          </div>
        </div>
        <p className="text-sm text-ink/80 italic">{q.teaching}</p>
      </motion.div>
    );
  }

  return (
    <div className="bg-paper-card rounded-2xl p-5 md:p-6 shadow-card flex flex-col gap-4">
      <div className="flex justify-between items-baseline">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
          query {idx + 1} / {QUERIES.length}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle tabular-nums">
          budget {TOTAL} units
        </p>
      </div>
      <div>
        <p className="font-display text-lg font-semibold leading-tight">{q.title}</p>
        <p className="text-sm text-ink-muted mt-1">{q.desc}</p>
      </div>

      <div className="space-y-3">
        {PARADIGMS.map((p) => (
          <div key={p.id}>
            <div className="flex justify-between items-baseline mb-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink">
                {p.label}
              </span>
              <span className="font-display text-lg font-semibold tabular-nums text-accent leading-none">
                {alloc[p.id]}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={alloc[p.id]}
              onChange={(e) => update(p.id, Number(e.target.value))}
              className="w-full accent-accent cursor-pointer"
            />
            <p className="font-mono text-[9px] text-ink-subtle">{p.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-paper-tint rounded-xl p-3 grid grid-cols-3 gap-3 items-center">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
            remaining
          </p>
          <p
            className={`font-display text-xl font-semibold tabular-nums ${
              remaining === 0
                ? 'text-signal-good'
                : remaining > 0
                  ? 'text-signal-warn'
                  : 'text-signal-bad'
            }`}
          >
            {remaining}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
            predicted accuracy
          </p>
          <div className="flex items-baseline gap-2">
            <p className="font-display text-xl font-semibold tabular-nums text-accent">
              {liveAcc.toFixed(2)}
            </p>
            <p className="font-mono text-[10px] text-ink-subtle">/ 0.98 max</p>
          </div>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={total !== TOTAL}
          className="rounded-xl bg-accent text-paper font-mono text-[10px] uppercase tracking-[0.18em] py-3 hover:bg-accent-hover transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {total !== TOTAL ? `${remaining > 0 ? '+' : ''}${remaining} off` : 'Submit'}
        </button>
      </div>
    </div>
  );
}
