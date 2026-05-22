import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Imperative API exposed via ref. The lesson timeline player calls
 * these methods at scripted timestamps to demo the puzzle. The same
 * API is used by tests and by the asset-spec exporter to render
 * deterministic frames for video gen.
 */
export interface FixedPointHunterHandle {
  setLevel: (n: number) => void;
  setZ0: (xy: [number, number]) => void;
  setK: (k: number) => void;
  setFunction: (id: string) => void;
  submit: () => void;
  reset: () => void;
}

/* ============================================================
   Fixed-Point Hunter — a puzzle game that IS the looped-LM mechanism.
   You drag a starting point z₀ on a 2D plane. The chosen function f is
   applied repeatedly: z₁ = f(z₀), z₂ = f(z₁), ... You either converge
   to a fixed point z* (contraction map) or diverge.

   Levels:
   1. Identify — given f, find the equilibrium z* visually
   2. Choose — which of 3 candidate f's converges fastest to a target z*
   3. Calibrate — set K large enough to reach target within tolerance ε
   4. Design — under a compute budget B, choose BOTH f and K
   ============================================================ */

interface Fn {
  id: string;
  name: string;
  /** (x,y) → (x',y') */
  apply: (x: number, y: number) => [number, number];
  /** Known fixed point (where it converges, if it does) */
  fixed?: [number, number];
  /** Speed of convergence: roughly the contraction factor (lower = faster) */
  rate: number;
  /** Cost per loop iteration (compute units) */
  cost: number;
  /** Human description shown in the picker */
  blurb: string;
}

const FUNCTIONS: Fn[] = [
  {
    id: 'gentle',
    name: 'gentle homeward breeze',
    apply: (x, y) => [x * 0.6 + 0.4 * 1.5, y * 0.6 + 0.4 * 1.0],
    fixed: [1.5, 1.0],
    rate: 0.6,
    cost: 1,
    blurb: 'z ← 0.6·z + 0.4·home · c = 0.60',
  },
  {
    id: 'strong',
    name: 'strong tailwind',
    apply: (x, y) => [x * 0.3 + 0.7 * 1.5, y * 0.3 + 0.7 * 1.0],
    fixed: [1.5, 1.0],
    rate: 0.3,
    cost: 2,
    blurb: 'z ← 0.3·z + 0.7·home · c = 0.30',
  },
  {
    id: 'rotate',
    name: 'lazy spiral',
    apply: (x, y) => {
      const dx = x - 1.5;
      const dy = y - 1.0;
      const cos = Math.cos(0.4);
      const sin = Math.sin(0.4);
      const nx = (dx * cos - dy * sin) * 0.85 + 1.5;
      const ny = (dx * sin + dy * cos) * 0.85 + 1.0;
      return [nx, ny];
    },
    fixed: [1.5, 1.0],
    rate: 0.85,
    cost: 1,
    blurb: 'rotate then drift home · c = 0.85',
  },
  {
    id: 'expand',
    name: 'headwind (diverges)',
    apply: (x, y) => [(x - 1.5) * 1.15 + 1.5, (y - 1.0) * 1.15 + 1.0],
    rate: 1.15,
    cost: 1,
    blurb: 'blows the goose AWAY · c = 1.15',
  },
];

/** Compute the trajectory of K iterations starting at z0 */
function trajectory(f: Fn, z0: [number, number], K: number): [number, number][] {
  const out: [number, number][] = [z0];
  let z = z0;
  for (let i = 0; i < K; i++) {
    z = f.apply(z[0], z[1]);
    out.push(z);
  }
  return out;
}

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

interface Level {
  id: number;
  title: string;
  /** Visible functions for this level */
  options: Fn[];
  target: [number, number];
  /** Tolerance for "reached the target" */
  epsilon: number;
  z0: [number, number];
  budget?: number;
  fixedK?: number;
  prompt: string;
  /** What the level is teaching */
  teaching: string;
}

const LEVELS: Level[] = [
  {
    id: 1,
    title: 'Get the goose home',
    options: [FUNCTIONS[0]],
    target: [1.5, 1.0],
    epsilon: 0.2,
    z0: [-1.5, -1.5],
    fixedK: 12,
    prompt: 'Drag the goose anywhere on the pond. Run the breeze. Where does it settle?',
    teaching: 'A fixed point is z* where f(z*) = z*. The goose drifts to the same spot from anywhere within reach.',
  },
  {
    id: 2,
    title: 'Pick the right breeze',
    options: [FUNCTIONS[0], FUNCTIONS[1], FUNCTIONS[2]],
    target: [1.5, 1.0],
    epsilon: 0.05,
    z0: [-1.5, -1.5],
    fixedK: 8,
    prompt: "Three breezes. Which one gets the goose within ε=0.05 of home in the fewest flaps?",
    teaching: "Lower contraction rate c = faster convergence. Same trade-off in a looped LM: smaller c means fewer K loops to reach the answer.",
  },
  {
    id: 3,
    title: 'How many flaps?',
    options: [FUNCTIONS[0]],
    target: [1.5, 1.0],
    epsilon: 0.01,
    z0: [-1.5, -1.5],
    prompt: 'Set K — the number of times the goose flaps. Too few, it falls short. Too many, energy wasted.',
    teaching: 'Depth-as-iteration. A single K controls how thoroughly the model thinks. Picking it too high is the pondering-cost problem ACT solves.',
  },
  {
    id: 4,
    title: "Banach's goose, on a budget",
    options: [FUNCTIONS[0], FUNCTIONS[1]],
    target: [1.5, 1.0],
    epsilon: 0.02,
    z0: [-1.8, -1.8],
    budget: 14,
    prompt: 'The goose has 14 units of energy. Each breeze costs different per flap. Pick breeze AND number of flaps.',
    teaching: "The actual DEQ design problem: parameter cost (M) vs iteration cost (K) under a fixed budget. Bai & Kolter solved this analytically with implicit differentiation.",
  },
];

export const FixedPointHunter = forwardRef<FixedPointHunterHandle>(function FixedPointHunter(
  _props,
  ref,
) {
  const [levelIdx, setLevelIdx] = useState(0);
  const [pickedFn, setPickedFn] = useState<string>(LEVELS[0].options[0].id);
  const [K, setK] = useState(4);
  const [z0, setZ0] = useState<[number, number]>(LEVELS[0].z0);
  const [solved, setSolved] = useState<boolean[]>(LEVELS.map(() => false));
  const [submission, setSubmission] = useState<null | { ok: boolean; reason: string }>(null);

  const level = LEVELS[levelIdx];

  useImperativeHandle(
    ref,
    () => ({
      setLevel: (n: number) => setLevelIdx(Math.max(0, Math.min(LEVELS.length - 1, n))),
      setZ0: (xy: [number, number]) => setZ0(xy),
      setK: (k: number) => setK(Math.max(0, Math.min(20, k))),
      setFunction: (id: string) => {
        if (LEVELS[levelIdx].options.some((o) => o.id === id)) setPickedFn(id);
      },
      submit: () => check(),
      reset: () => {
        setZ0(LEVELS[levelIdx].z0);
        setK(LEVELS[levelIdx].fixedK ?? 4);
        setSubmission(null);
      },
    }),
    // `check` and `level` are captured via closure; we want fresh ones each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [levelIdx],
  );
  const fn = useMemo(
    () => level.options.find((f) => f.id === pickedFn) ?? level.options[0],
    [level, pickedFn],
  );

  // Reset state when level changes
  useEffect(() => {
    setPickedFn(level.options[0].id);
    setK(level.fixedK ?? 4);
    setZ0(level.z0);
    setSubmission(null);
  }, [levelIdx, level]);

  const traj = useMemo(() => trajectory(fn, z0, K), [fn, z0, K]);
  const finalPos = traj[traj.length - 1];
  const distance = dist(finalPos, level.target);
  const reached = distance <= level.epsilon;
  const spent = K * fn.cost;
  const overBudget = level.budget !== undefined && spent > level.budget;

  function check() {
    let ok = false;
    let reason = '';
    if (level.id === 1) {
      // Identify: user has to click a point near the fixed point
      ok = reached;
      reason = reached
        ? `Converged to (${finalPos[0].toFixed(2)}, ${finalPos[1].toFixed(2)}). That's the fixed point.`
        : `Trajectory ended at (${finalPos[0].toFixed(2)}, ${finalPos[1].toFixed(2)}), distance ${distance.toFixed(2)} from target. Run more iterations or pick a different starting point.`;
    } else if (level.id === 2) {
      // Fastest contraction: must reach ε in the fewest steps
      const reaches = level.options
        .map((f) => {
          const t = trajectory(f, level.z0, 30);
          const idx = t.findIndex((p) => dist(p, level.target) <= level.epsilon);
          return { f, steps: idx === -1 ? Infinity : idx };
        })
        .sort((a, b) => a.steps - b.steps);
      const best = reaches[0];
      ok = fn.id === best.f.id && reached;
      reason = ok
        ? `Right — "${best.f.name}" reaches ε=${level.epsilon} in ${best.steps} steps. Lowest contraction rate wins.`
        : `"${fn.name}" rate ${fn.rate}. Best is "${best.f.name}" rate ${best.f.rate} — converges in ${best.steps} steps.`;
    } else if (level.id === 3) {
      ok = reached;
      const minK = (() => {
        const t = trajectory(fn, level.z0, 50);
        return t.findIndex((p) => dist(p, level.target) <= level.epsilon);
      })();
      reason = ok
        ? K === minK
          ? `Exact. K=${K} is the minimum to hit ε=${level.epsilon}.`
          : `Reached, but K=${minK} would have been enough. ${K - minK} wasted iterations.`
        : `K=${K} left you at distance ${distance.toFixed(3)} (need ${level.epsilon}). Needed K=${minK}.`;
    } else if (level.id === 4) {
      if (overBudget) {
        ok = false;
        reason = `Over budget: spent ${spent}, budget ${level.budget}.`;
      } else if (!reached) {
        ok = false;
        reason = `Within budget but didn't converge. Distance ${distance.toFixed(3)} > ε ${level.epsilon}.`;
      } else {
        ok = true;
        const opts = level.options.map((f) => {
          const t = trajectory(f, level.z0, 50);
          const minK = t.findIndex((p) => dist(p, level.target) <= level.epsilon);
          return { f, minK, cost: minK >= 0 ? minK * f.cost : Infinity };
        });
        const cheapest = opts.sort((a, b) => a.cost - b.cost)[0];
        reason =
          fn.id === cheapest.f.id
            ? `Optimal — "${fn.name}" at K=${cheapest.minK} costs ${cheapest.cost} units, cheapest possible.`
            : `Solved at ${spent} units. Cheapest path was "${cheapest.f.name}" × K=${cheapest.minK} = ${cheapest.cost} units.`;
      }
    }
    setSubmission({ ok, reason });
    if (ok) setSolved((s) => s.map((v, i) => (i === levelIdx ? true : v)));
  }

  return (
    <div className="bg-paper-card rounded-2xl p-4 md:p-5 shadow-card flex flex-col gap-3">
      {/* Level switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {LEVELS.map((l, i) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLevelIdx(i)}
              className={`h-7 w-7 rounded-md font-mono text-xs font-semibold transition ${
                i === levelIdx
                  ? 'bg-accent text-paper'
                  : solved[i]
                    ? 'bg-signal-good/20 text-signal-good border border-signal-good/40'
                    : 'bg-paper-tint text-ink-muted hover:bg-ink-subtle/15'
              }`}
              aria-label={`Level ${l.id}`}
            >
              {solved[i] ? '✓' : l.id}
            </button>
          ))}
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
          Level {level.id} / {LEVELS.length}
        </p>
      </div>

      <div>
        <p className="font-display text-lg font-semibold leading-tight">{level.title}</p>
        <p className="text-sm text-ink-muted leading-snug mt-0.5">{level.prompt}</p>
      </div>

      {/* The plane */}
      <Plane
        traj={traj}
        target={level.target}
        epsilon={level.epsilon}
        onDragStart={setZ0}
        z0={z0}
        K={K}
      />

      {/* Controls */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted mb-1">
            function f
          </p>
          <div className="flex flex-col gap-1.5">
            {level.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPickedFn(opt.id)}
                className={`text-left rounded-lg px-3 py-1.5 text-xs font-mono transition ${
                  pickedFn === opt.id
                    ? 'bg-accent text-paper'
                    : 'bg-paper-tint hover:bg-ink-subtle/15 text-ink-muted'
                }`}
              >
                <span className="font-semibold">{opt.name}</span>
                <span
                  className={`block font-normal text-[10px] mt-0.5 ${
                    pickedFn === opt.id ? 'opacity-80' : 'text-ink-subtle'
                  }`}
                >
                  {opt.blurb} · cost {opt.cost}/loop
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div>
            <div className="flex justify-between items-baseline">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                K · iterations
              </p>
              <p className="font-display text-2xl font-semibold text-accent tabular-nums leading-none">
                {K}
              </p>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              value={K}
              onChange={(e) => setK(Number(e.target.value))}
              className="w-full accent-accent cursor-pointer"
              aria-label="Iterations"
            />
          </div>
          <div className="bg-paper-tint rounded-lg p-2 grid grid-cols-3 gap-1 text-center">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-subtle">
                dist
              </p>
              <p
                className={`font-mono text-xs tabular-nums ${reached ? 'text-signal-good' : 'text-ink'}`}
              >
                {distance.toFixed(3)}
              </p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-subtle">
                cost
              </p>
              <p
                className={`font-mono text-xs tabular-nums ${overBudget ? 'text-signal-bad' : 'text-ink'}`}
              >
                {spent}
                {level.budget ? `/${level.budget}` : ''}
              </p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-subtle">
                state
              </p>
              <p
                className={`font-mono text-xs ${
                  reached ? 'text-signal-good' : 'text-ink-subtle'
                }`}
              >
                {reached ? '✓ ε' : '…'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={check}
          className="flex-1 rounded-xl bg-accent text-paper font-mono text-xs uppercase tracking-[0.18em] py-2.5 hover:bg-accent-hover transition"
        >
          Submit
        </button>
        <button
          type="button"
          onClick={() => {
            setZ0(level.z0);
            setK(level.fixedK ?? 4);
            setSubmission(null);
          }}
          className="rounded-xl border border-ink-subtle/30 text-ink-muted font-mono text-xs uppercase tracking-[0.18em] px-4 py-2.5 hover:text-ink hover:border-ink-subtle transition"
        >
          Reset
        </button>
      </div>

      <AnimatePresence>
        {submission && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`rounded-lg p-3 text-sm ${
              submission.ok
                ? 'bg-signal-good/10 border border-signal-good/30'
                : 'bg-signal-bad/10 border border-signal-bad/30'
            }`}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] mb-1 text-ink-subtle">
              {submission.ok ? '✓ mastered' : 'try again'}
            </p>
            <p className="text-ink">{submission.reason}</p>
            {submission.ok && (
              <p className="text-ink-muted text-xs mt-2 italic">{level.teaching}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface PlaneProps {
  traj: [number, number][];
  target: [number, number];
  epsilon: number;
  onDragStart: (z: [number, number]) => void;
  z0: [number, number];
  K: number;
}

function Plane({ traj, target, epsilon, onDragStart, z0, K }: PlaneProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const W = 480;
  const H = 280;
  const xMin = -3;
  const xMax = 3;
  const yMin = -2.5;
  const yMax = 2.5;

  function toScreen(x: number, y: number): [number, number] {
    const sx = ((x - xMin) / (xMax - xMin)) * W;
    const sy = H - ((y - yMin) / (yMax - yMin)) * H;
    return [sx, sy];
  }

  function fromScreen(sx: number, sy: number): [number, number] {
    const x = (sx / W) * (xMax - xMin) + xMin;
    const y = ((H - sy) / H) * (yMax - yMin) + yMin;
    return [x, y];
  }

  function eventCoords(e: React.PointerEvent<SVGSVGElement>): [number, number] | null {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return null;
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    const sy = ((e.clientY - rect.top) / rect.height) * H;
    return fromScreen(sx, sy);
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging(true);
    const c = eventCoords(e);
    if (c) onDragStart(c);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragging) return;
    const c = eventCoords(e);
    if (c) onDragStart(c);
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    setDragging(false);
    try {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
  }

  const [tx, ty] = toScreen(target[0], target[1]);
  const epsR = (epsilon / (xMax - xMin)) * W;
  const [gx, gy] = toScreen(z0[0], z0[1]);

  return (
    <div className="bg-paper-tint rounded-xl overflow-hidden">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full h-auto touch-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* pond background tint */}
        <rect x={0} y={0} width={W} height={H} fill="#f1f5f9" />
        {/* grid */}
        {Array.from({ length: 7 }).map((_, i) => {
          const x = (i / 6) * W;
          return (
            <line
              key={`vg-${i}`}
              x1={x}
              y1={0}
              x2={x}
              y2={H}
              stroke="#cbd5e1"
              strokeWidth={i === 3 ? 0.6 : 0.3}
              opacity={0.5}
            />
          );
        })}
        {Array.from({ length: 5 }).map((_, i) => {
          const y = (i / 4) * H;
          return (
            <line
              key={`hg-${i}`}
              x1={0}
              y1={y}
              x2={W}
              y2={y}
              stroke="#cbd5e1"
              strokeWidth={i === 2 ? 0.6 : 0.3}
              opacity={0.5}
            />
          );
        })}
        {/* target = the nest */}
        <circle cx={tx} cy={ty} r={epsR} fill="#10b981" opacity={0.15} stroke="#10b981" strokeWidth="0.5" strokeDasharray="3 3" />
        <text
          x={tx}
          y={ty + 8}
          fontSize={26}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          🏠
        </text>
        <text
          x={tx + 22}
          y={ty - 12}
          fontSize={10}
          fill="#10b981"
          fontFamily="monospace"
          style={{ pointerEvents: 'none' }}
        >
          home · z*
        </text>

        {/* trajectory — feather trail */}
        {traj.slice(0, -1).map((p, i) => {
          const [x1, y1] = toScreen(p[0], p[1]);
          const next = traj[i + 1];
          const [x2, y2] = toScreen(next[0], next[1]);
          const alpha = 0.3 + (i / Math.max(1, traj.length - 1)) * 0.7;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#5b21b6"
              strokeWidth="1.6"
              opacity={alpha}
              strokeDasharray="2 2"
            />
          );
        })}
        {traj.map((p, i) => {
          if (i === 0 || i === traj.length - 1) return null;
          const [sx, sy] = toScreen(p[0], p[1]);
          return (
            <motion.circle
              key={`pt-${K}-${i}`}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.7 }}
              transition={{ delay: i * 0.04, duration: 0.18 }}
              cx={sx}
              cy={sy}
              r={2.4}
              fill="#a78bfa"
            />
          );
        })}
        {/* The goose at the latest position */}
        {(() => {
          const last = traj[traj.length - 1];
          const [lx, ly] = toScreen(last[0], last[1]);
          return (
            <motion.text
              key={`goose-end-${K}`}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: (traj.length - 1) * 0.04, duration: 0.22 }}
              x={lx}
              y={ly + 9}
              fontSize={28}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              🪿
            </motion.text>
          );
        })()}
        {/* z0 label — the starting goose */}
        <text
          x={gx + 18}
          y={gy + 4}
          fontSize={10}
          fill="#0ea5e9"
          fontFamily="monospace"
          style={{ pointerEvents: 'none' }}
        >
          start · z₀
        </text>
        <circle cx={gx} cy={gy} r={3} fill="#0ea5e9" />
      </svg>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle text-center py-1.5">
        drag the goose anywhere · 🏠 = z* · violet trail = trajectory
      </p>
    </div>
  );
}
