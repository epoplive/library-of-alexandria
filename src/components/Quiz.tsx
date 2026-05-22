import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface QuizProps {
  question: string;
  options: string[];
  correct: number;
  explanation?: string;
}

export function Quiz({ question, options, correct, explanation }: QuizProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const done = picked !== null;

  return (
    <div className="my-8 rounded-2xl border border-ink-subtle/20 bg-paper-card p-6 shadow-card">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent mb-3">
        Check your understanding
      </p>
      <p className="font-display text-xl font-semibold mb-5">{question}</p>
      <ul className="space-y-2">
        {options.map((opt, i) => {
          const isPicked = picked === i;
          const isCorrect = i === correct;
          const showState = done && (isPicked || isCorrect);
          return (
            <li key={i}>
              <button
                onClick={() => !done && setPicked(i)}
                disabled={done}
                className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                  showState && isCorrect
                    ? 'border-signal-good bg-signal-good/10'
                    : showState && isPicked && !isCorrect
                      ? 'border-signal-bad bg-signal-bad/10'
                      : 'border-ink-subtle/20 hover:border-accent/50 hover:bg-accent-soft/30'
                } ${done ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <span className="font-mono text-xs text-ink-subtle mr-3">
                  {String.fromCharCode(65 + i)}
                </span>
                {opt}
              </button>
            </li>
          );
        })}
      </ul>
      <AnimatePresence>
        {done && explanation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-5 rounded-xl bg-paper-tint p-4 text-ink/90">
              <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle mb-1">
                {picked === correct ? 'Right —' : 'Not quite —'}
              </p>
              <p>{explanation}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
