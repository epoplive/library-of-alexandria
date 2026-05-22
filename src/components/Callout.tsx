import type { ReactNode } from 'react';

type CalloutKind = 'insight' | 'info' | 'warn' | 'aside';

interface CalloutProps {
  kind?: CalloutKind;
  title?: string;
  children: ReactNode;
}

const styles: Record<CalloutKind, string> = {
  insight: 'border-accent/30 bg-accent-soft/40',
  info: 'border-signal-info/30 bg-signal-info/5',
  warn: 'border-signal-warn/40 bg-signal-warn/5',
  aside: 'border-ink-subtle/20 bg-paper-tint',
};

const icons: Record<CalloutKind, string> = {
  insight: '★',
  info: 'i',
  warn: '!',
  aside: '·',
};

const iconColors: Record<CalloutKind, string> = {
  insight: 'text-accent',
  info: 'text-signal-info',
  warn: 'text-signal-warn',
  aside: 'text-ink-subtle',
};

export function Callout({ kind = 'insight', title, children }: CalloutProps) {
  return (
    <aside className={`my-6 rounded-2xl border ${styles[kind]} p-5`}>
      <div className="flex gap-3">
        <span
          className={`font-display text-lg leading-none mt-0.5 ${iconColors[kind]}`}
          aria-hidden
        >
          {icons[kind]}
        </span>
        <div className="flex-1">
          {title && <p className="font-semibold mb-1">{title}</p>}
          <div className="text-ink/90 [&>p]:mb-2 [&>p:last-child]:mb-0">{children}</div>
        </div>
      </div>
    </aside>
  );
}
