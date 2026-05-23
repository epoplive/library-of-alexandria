import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { motion } from 'framer-motion';

/**
 * Halt-or-continue game — you're the halting head for an ACT-style
 * looped LM. Watch the model's internal confidence at each iteration.
 * Halt too early → wrong answer. Halt too late → wasted compute.
 *
 * Exposes an imperative handle so a TimelinePlayer (or any caller) can
 * drive the game through a scripted demo — setProblem, nextStep, halt,
 * reset. Internal state lives here; the handle is a thin wrapper around
 * the state mutators.
 */

export interface HaltOrContinueGameHandle {
  /** Jump to a specific problem (0-indexed). Resets step + clears result. */
  setProblem: (idx: number) => void;
  /** Advance one iteration. No-op past the last step (game auto-halts). */
  nextStep: () => void;
  /** Halt at the current step. Shows the result card, then advances. */
  halt: () => void;
  /** Hard reset to problem 0, step 0, empty results. */
  reset: () => void;
}

type Problem = {
  prompt: string;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Internal confidence at each iteration (0..1) — 8 steps max */
  confidence: number[];
  /** Ground-truth accuracy at each step */
  correctness: number[];
  optimalHaltAt: number; // 1-indexed
};

export const HALT_PROBLEMS: Problem[] = [
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

const RESULT_DISPLAY_MS = 1900;

export const HaltOrContinueGame = forwardRef<HaltOrContinueGameHandle>(
  function HaltOrContinueGame(_, ref) {
    const [pIdx, setPIdx] = useState(0);
    const [step, setStep] = useState(0);
    const [results, setResults] = useState<HaltResult[]>([]);
    const [showResult, setShowResult] = useState<HaltResult | null>(null);

    // Ref shadows so imperative methods always see the latest state
    // without being captured by stale closures.
    const pIdxRef = useRef(pIdx);
    pIdxRef.current = pIdx;
    const stepRef = useRef(step);
    stepRef.current = step;

    function doHalt() {
      const idx = pIdxRef.current;
      const s = stepRef.current;
      if (idx >= HALT_PROBLEMS.length) return;
      const p = HALT_PROBLEMS[idx];
      const correct = p.correctness[s] >= 0.85;
      const result: HaltResult = {
        problemIdx: idx,
        haltedAt: s + 1,
        correct,
        wasted: s + 1 - p.optimalHaltAt,
      };
      setShowResult(result);
      setTimeout(() => {
        setResults((r) => [...r, result]);
        setShowResult(null);
        setPIdx((i) => i + 1);
        setStep(0);
      }, RESULT_DISPLAY_MS);
    }

    function doNextStep() {
      const idx = pIdxRef.current;
      if (idx >= HALT_PROBLEMS.length) return;
      const p = HALT_PROBLEMS[idx];
      const s = stepRef.current;
      if (s + 1 >= p.confidence.length) {
        // Past the last iteration — auto-halt instead of advancing.
        doHalt();
        return;
      }
      setStep((cur) => cur + 1);
    }

    useImperativeHandle(
      ref,
      () => ({
        setProblem: (idx) => {
          setPIdx(Math.max(0, Math.min(HALT_PROBLEMS.length, idx)));
          setStep(0);
          setShowResult(null);
        },
        nextStep: doNextStep,
        halt: doHalt,
        reset: () => {
          setPIdx(0);
          setStep(0);
          setResults([]);
          setShowResult(null);
        },
      }),
      [],
    );

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
            <Stat label="You halted at" value={`${r.haltedAt}`} sub="iterations" />
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
            onClick={doHalt}
            className="rounded-xl bg-signal-good/15 hover:bg-signal-good/25 border-2 border-signal-good/40 text-signal-good font-mono text-xs uppercase tracking-[0.18em] py-4 transition"
          >
            ✓ Halt
          </button>
          <button
            type="button"
            onClick={doNextStep}
            disabled={atMax}
            className="rounded-xl bg-accent-soft hover:bg-accent/20 border-2 border-accent/40 text-accent font-mono text-xs uppercase tracking-[0.18em] py-4 transition disabled:opacity-50"
          >
            → Continue
          </button>
        </div>
      </div>
    );
  },
);

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
  const tone = good
    ? 'text-signal-good'
    : warn
      ? 'text-signal-warn'
      : bad
        ? 'text-signal-bad'
        : 'text-ink';
  return (
    <div className="text-center">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-subtle leading-none">
        {label}
      </p>
      <p className={`font-display text-2xl font-semibold tabular-nums leading-none mt-1 ${tone}`}>
        {value}
      </p>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-subtle mt-0.5 leading-none">
        {sub}
      </p>
    </div>
  );
}
