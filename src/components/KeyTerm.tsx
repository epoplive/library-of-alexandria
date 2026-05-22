import { useState, type ReactNode } from 'react';

interface KeyTermProps {
  term: ReactNode;
  definition: ReactNode;
}

export function KeyTerm({ term, definition }: KeyTermProps) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="border-b-2 border-dashed border-accent/50 text-ink font-medium hover:border-accent"
      >
        {term}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-20 w-64 rounded-xl bg-ink text-paper text-sm leading-relaxed p-3 shadow-lg normal-case"
        >
          {definition}
        </span>
      )}
    </span>
  );
}
