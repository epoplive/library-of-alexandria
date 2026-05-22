import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ============================================================
   KV-Cache Architect — you make deployment-time architecture
   decisions across 4 real-feeling scenarios. Each has an
   optimal answer; you get graded on memory budget hit and
   accuracy floor.
   ============================================================ */

type Strategy = 'recached' | 'cross-iter' | 'mla';

interface Scenario {
  id: number;
  title: string;
  context: string;
  /** Memory budget in GB */
  memBudget: number;
  /** Minimum acceptable accuracy proxy 0..1 */
  accFloor: number;
  /** Quality + memory traits per strategy */
  outcomes: Record<Strategy, { mem: number; acc: number; note: string }>;
  optimal: Strategy;
  teaching: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: 1,
    title: 'Long-context summarization',
    context: '128k input, single-shot, latency tolerant. You need to attend everything.',
    memBudget: 40,
    accFloor: 0.82,
    outcomes: {
      'recached': { mem: 18, acc: 0.71, note: 'Re-cached drops historical attention every loop — bad for full-doc.' },
      'cross-iter': { mem: 62, acc: 0.93, note: 'Best fidelity, but cache grows past budget.' },
      'mla': { mem: 22, acc: 0.88, note: 'Compressed cache fits budget and keeps long-range.' },
    },
    optimal: 'mla',
    teaching: 'When context is the whole game AND memory is tight, MLA-style compression wins. DeepSeek-V3 ships this.',
  },
  {
    id: 2,
    title: 'Multi-hop reasoning',
    context: '8k context, K=8 internal loops, answer must chain across ~5 hops.',
    memBudget: 20,
    accFloor: 0.85,
    outcomes: {
      'recached': { mem: 6, acc: 0.62, note: 'Each loop forgets prior intermediate hops — multi-hop collapses.' },
      'cross-iter': { mem: 14, acc: 0.91, note: 'Cross-iteration cache lets later loops reference earlier reasoning.' },
      'mla': { mem: 9, acc: 0.78, note: 'Compression loses subtle hop-to-hop signal.' },
    },
    optimal: 'cross-iter',
    teaching: "Multi-hop needs cross-iteration cache — the loop's intermediate state must persist across iterations.",
  },
  {
    id: 3,
    title: 'Edge deployment (laptop)',
    context: '4k context, tight 8 GB total memory budget, low-latency single user.',
    memBudget: 8,
    accFloor: 0.7,
    outcomes: {
      'recached': { mem: 3, acc: 0.72, note: 'Cheap, lossy, but fits the budget and clears the floor.' },
      'cross-iter': { mem: 11, acc: 0.86, note: 'Over budget — won\'t run.' },
      'mla': { mem: 6, acc: 0.79, note: 'Fits with margin; quality good enough.' },
    },
    optimal: 'mla',
    teaching: 'On constrained hardware, MLA gives the best quality-per-byte. Re-cached works if MLA isn\'t available.',
  },
  {
    id: 4,
    title: 'Agent tool-use loop',
    context: '32k growing context (tool outputs accumulate), latency critical, K=4 loops.',
    memBudget: 30,
    accFloor: 0.8,
    outcomes: {
      'recached': { mem: 11, acc: 0.74, note: 'Forgetting tool outputs between loops breaks the agent\'s memory.' },
      'cross-iter': { mem: 26, acc: 0.89, note: 'Best fit — agent loops genuinely need the growing context.' },
      'mla': { mem: 14, acc: 0.83, note: 'Compresses well, slight loss on tool-call grounding.' },
    },
    optimal: 'cross-iter',
    teaching: 'Agent loops are basically extended multi-hop reasoning. Cross-iteration cache is the right shape.',
  },
];

const STRATEGY_LABELS: Record<Strategy, { name: string; sub: string }> = {
  'recached': {
    name: 'Re-cached',
    sub: 'Cache cleared each loop. Constant memory, no historical attention.',
  },
  'cross-iter': {
    name: 'Cross-iteration',
    sub: 'Cache grows across loops. Each iteration attends over prior iterations.',
  },
  'mla': {
    name: 'MLA-compressed',
    sub: 'Low-rank projection of K/V. DeepSeek-V3 style. Middle ground.',
  },
};

interface Result {
  scenarioId: number;
  picked: Strategy;
  fitBudget: boolean;
  hitFloor: boolean;
  optimal: boolean;
}

export function KVCacheArchitect() {
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [submitted, setSubmitted] = useState<Strategy | null>(null);
  const [hover, setHover] = useState<Strategy | null>(null);

  if (idx >= SCENARIOS.length) {
    const fit = results.filter((r) => r.fitBudget).length;
    const acc = results.filter((r) => r.hitFloor).length;
    const opt = results.filter((r) => r.optimal).length;
    return (
      <div className="bg-paper-card rounded-2xl p-5 md:p-6 shadow-card flex flex-col gap-5 items-center text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          architecture run complete
        </p>
        <div className="grid grid-cols-3 gap-6">
          <ScoreCell label="Within memory" v={fit} max={SCENARIOS.length} />
          <ScoreCell label="Hit accuracy floor" v={acc} max={SCENARIOS.length} />
          <ScoreCell label="Optimal pick" v={opt} max={SCENARIOS.length} />
        </div>
        <p className="text-ink-muted text-sm max-w-md">
          Real production decisions look like this — every scenario has different memory and
          accuracy demands, and the same architecture wins or loses depending on the workload.
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

  const s = SCENARIOS[idx];

  function submit(picked: Strategy) {
    const out = s.outcomes[picked];
    const fit = out.mem <= s.memBudget;
    const floor = out.acc >= s.accFloor;
    const r: Result = {
      scenarioId: s.id,
      picked,
      fitBudget: fit,
      hitFloor: floor,
      optimal: picked === s.optimal,
    };
    setSubmitted(picked);
    setTimeout(() => {
      setResults((prev) => [...prev, r]);
      setSubmitted(null);
      setIdx((i) => i + 1);
    }, 2400);
  }

  if (submitted) {
    const out = s.outcomes[submitted];
    const fit = out.mem <= s.memBudget;
    const floor = out.acc >= s.accFloor;
    const opt = submitted === s.optimal;
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-paper-card rounded-2xl p-5 md:p-6 shadow-card flex flex-col gap-3 border-2 ${
          opt ? 'border-signal-good/40' : floor && fit ? 'border-signal-warn/40' : 'border-signal-bad/40'
        }`}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
          scenario {s.id} · {STRATEGY_LABELS[submitted].name}
        </p>
        <p className="font-display text-base">{s.title}</p>
        <div className="grid grid-cols-3 gap-3">
          <Stat
            label="Memory used"
            value={`${out.mem} GB`}
            sub={`budget ${s.memBudget}`}
            good={fit}
            bad={!fit}
          />
          <Stat
            label="Quality"
            value={out.acc.toFixed(2)}
            sub={`floor ${s.accFloor}`}
            good={floor}
            bad={!floor}
          />
          <Stat
            label="Optimal?"
            value={opt ? '✓' : '✗'}
            sub={opt ? '' : `was ${STRATEGY_LABELS[s.optimal].name}`}
            good={opt}
            warn={!opt && fit && floor}
            bad={!opt && (!fit || !floor)}
          />
        </div>
        <p className="text-sm text-ink-muted leading-relaxed">{out.note}</p>
        <p className="text-xs text-ink/70 italic">{s.teaching}</p>
      </motion.div>
    );
  }

  return (
    <div className="bg-paper-card rounded-2xl p-5 md:p-6 shadow-card flex flex-col gap-4">
      <div className="flex justify-between items-baseline">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
          scenario {idx + 1} / {SCENARIOS.length}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle tabular-nums">
          budget {s.memBudget} GB · floor {s.accFloor.toFixed(2)}
        </p>
      </div>
      <div>
        <p className="font-display text-lg font-semibold leading-tight">{s.title}</p>
        <p className="text-sm text-ink-muted mt-1">{s.context}</p>
      </div>

      <div className="grid gap-2">
        {(Object.keys(STRATEGY_LABELS) as Strategy[]).map((strat) => {
          const out = s.outcomes[strat];
          const isHover = hover === strat;
          return (
            <button
              key={strat}
              type="button"
              onMouseEnter={() => setHover(strat)}
              onMouseLeave={() => setHover(null)}
              onClick={() => submit(strat)}
              className="text-left rounded-xl border-2 border-ink-subtle/15 hover:border-accent/50 hover:bg-accent-soft/30 px-4 py-3 transition"
            >
              <div className="flex justify-between items-baseline gap-3">
                <p className="font-display text-base font-semibold">
                  {STRATEGY_LABELS[strat].name}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
                  pick
                </p>
              </div>
              <p className="font-mono text-xs text-ink-muted mt-0.5">
                {STRATEGY_LABELS[strat].sub}
              </p>
              {isHover && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="font-mono text-[10px] mt-1.5 text-accent overflow-hidden"
                >
                  est. mem {out.mem} GB · est. quality {out.acc.toFixed(2)}
                </motion.div>
              )}
            </button>
          );
        })}
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle text-center">
        hover for estimates · pick to commit
      </p>
    </div>
  );
}

function ScoreCell({ label, v, max }: { label: string; v: number; max: number }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">{label}</p>
      <p className="font-display text-4xl font-semibold tabular-nums">
        {v}
        <span className="text-base text-ink-muted ml-1">/ {max}</span>
      </p>
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
      {sub && <p className="font-mono text-[10px] text-ink-subtle">{sub}</p>}
    </div>
  );
}
