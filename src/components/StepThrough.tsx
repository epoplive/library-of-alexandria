import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Step {
  title?: string;
  content: ReactNode;
}

interface StepThroughProps {
  steps: Step[];
}

export function StepThrough({ steps }: StepThroughProps) {
  const [i, setI] = useState(0);
  const atStart = i === 0;
  const atEnd = i === steps.length - 1;

  return (
    <div className="my-8 rounded-2xl border border-ink-subtle/15 bg-paper-card overflow-hidden shadow-card">
      <div className="px-5 py-3 border-b border-ink-subtle/10 bg-paper-tint flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-muted">
          Step {i + 1} of {steps.length}
        </p>
        <div className="flex gap-1">
          {steps.map((_, n) => (
            <span
              key={n}
              className={`h-1.5 w-6 rounded-full transition ${
                n === i ? 'bg-accent' : n < i ? 'bg-accent/40' : 'bg-ink-subtle/20'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="p-6 min-h-[160px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.25 }}
          >
            {steps[i].title && (
              <h3 className="font-display text-lg font-semibold mb-3">{steps[i].title}</h3>
            )}
            <div className="text-ink/90">{steps[i].content}</div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="px-5 py-3 border-t border-ink-subtle/10 flex justify-between bg-paper-tint/40">
        <button
          onClick={() => setI((n) => Math.max(0, n - 1))}
          disabled={atStart}
          className="font-mono text-xs uppercase tracking-[0.12em] text-ink-muted disabled:opacity-30 disabled:cursor-not-allowed hover:text-ink"
        >
          ← Back
        </button>
        <button
          onClick={() => setI((n) => Math.min(steps.length - 1, n + 1))}
          disabled={atEnd}
          className="font-mono text-xs uppercase tracking-[0.12em] text-accent disabled:opacity-30 disabled:cursor-not-allowed hover:text-accent-hover"
        >
          {atEnd ? 'End' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
