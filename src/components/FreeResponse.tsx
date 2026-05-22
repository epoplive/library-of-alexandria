import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FreeResponseProps {
  prompt: string;
  sampleAnswer?: string;
  placeholder?: string;
}

export function FreeResponse({ prompt, sampleAnswer, placeholder }: FreeResponseProps) {
  const [value, setValue] = useState('');
  const [showSample, setShowSample] = useState(false);

  return (
    <div className="my-8 rounded-2xl border border-ink-subtle/20 bg-paper-card p-6 shadow-card">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent mb-3">
        Think it through
      </p>
      <p className="font-display text-lg font-semibold mb-4">{prompt}</p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? 'Type your thinking…'}
        rows={4}
        className="w-full rounded-xl border border-ink-subtle/20 bg-paper p-3 font-sans text-ink resize-y focus:border-accent focus:outline-none focus:shadow-focus"
      />
      {sampleAnswer && (
        <div className="mt-3">
          {!showSample ? (
            <button
              onClick={() => setShowSample(true)}
              disabled={value.trim().length < 5}
              className="font-mono text-xs uppercase tracking-[0.12em] text-accent disabled:opacity-30 disabled:cursor-not-allowed hover:text-accent-hover"
            >
              Show sample answer →
            </button>
          ) : (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="overflow-hidden"
              >
                <div className="mt-2 rounded-xl bg-paper-tint p-4">
                  <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle mb-1">
                    Sample answer
                  </p>
                  <p className="text-ink/90">{sampleAnswer}</p>
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}
    </div>
  );
}
