import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RevealProps {
  label?: string;
  children: ReactNode;
}

export function Reveal({ label = 'Show answer', children }: RevealProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-4">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="font-mono text-xs uppercase tracking-[0.18em] text-accent hover:text-accent-hover"
        >
          {label} →
        </button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl bg-paper-tint p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
