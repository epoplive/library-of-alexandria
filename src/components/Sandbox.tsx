import type { ReactNode } from 'react';

interface SandboxProps {
  title?: string;
  controls?: ReactNode;
  children: ReactNode;
}

export function Sandbox({ title, controls, children }: SandboxProps) {
  return (
    <figure className="my-8 rounded-2xl border border-ink-subtle/15 bg-paper-card overflow-hidden shadow-card">
      {title && (
        <div className="px-5 py-3 border-b border-ink-subtle/10 bg-paper-tint">
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-muted">{title}</p>
        </div>
      )}
      <div className="p-5">{children}</div>
      {controls && (
        <div className="px-5 pb-5 border-t border-ink-subtle/10 pt-4 bg-paper-tint/40">
          {controls}
        </div>
      )}
    </figure>
  );
}
