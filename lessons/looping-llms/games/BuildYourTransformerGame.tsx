import { useState } from 'react';
import { motion } from 'framer-motion';

export function BuildYourTransformerGame() {
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
