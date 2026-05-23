import { motion } from 'framer-motion';

/**
 * Funding contract shipped per-lesson via meta.json. Tells the viewer
 * what the lesson cost to produce, what's been donated, and what the
 * NEXT improvement upgrade would unlock. The progressive-enhancement
 * model: every lesson starts at v0.1 (free Kokoro audio, no video),
 * donations move it toward v1.0 (full integrated-audio video).
 */
export interface LessonFunding {
  /** USD spent producing the lesson so far. */
  production_cost_usd: number;
  /** USD donated by the public for this lesson. */
  donations_received_usd: number;
  /** Per-platform donation URLs. */
  donation_links: {
    github_sponsors?: string;
    ko_fi?: string;
    open_collective?: string;
  };
  /** Ordered list of tier improvements the lesson can grow into. */
  planned_improvements: Array<{
    tier: string;
    cost_usd: number;
    what: string;
  }>;
  /** Append-only audit log. Reserved for /ledger. */
  ledger?: Array<{
    date: string;
    kind: 'spend' | 'donation';
    amount_usd: number;
    note?: string;
  }>;
}

interface FundingStripProps {
  funding: LessonFunding;
  /** Lesson's current production tier (e.g. "v0.1"). Used as a chip. */
  tier?: string;
  /** Compact mode (chip-shaped) vs full card. */
  variant?: 'card' | 'chip';
}

const TIER_LABELS: Record<string, string> = {
  'v0.1': 'free backbone',
  'v0.3': 'playable',
  'v0.6': 'voiced',
  'v0.9': 'animated',
  'v1.0': 'video',
  'v1.x': 'extended',
};

export function FundingStrip({ funding, tier, variant = 'card' }: FundingStripProps) {
  const spent = funding.production_cost_usd;
  const donated = funding.donations_received_usd;
  const balance = donated - spent;
  const nextImprovement = funding.planned_improvements?.[0];
  const remainingToNext = nextImprovement
    ? Math.max(0, nextImprovement.cost_usd - balance)
    : 0;
  const donateUrl =
    funding.donation_links?.github_sponsors ??
    funding.donation_links?.ko_fi ??
    funding.donation_links?.open_collective;

  if (variant === 'chip') {
    return (
      <a
        href={donateUrl ?? '#'}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-full bg-paper-card border border-ink-subtle/15 px-3 py-1 shadow-card hover:border-accent/40 transition"
      >
        {tier && (
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent">
            {tier}
          </span>
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
          {donated > 0 ? `$${donated.toFixed(0)} donated` : 'donations open'}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
          donate →
        </span>
      </a>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.35 }}
      className="mt-10 w-full max-w-md mx-auto bg-paper-card rounded-2xl border border-ink-subtle/10 shadow-card overflow-hidden"
    >
      <div className="px-5 py-3 border-b border-ink-subtle/10 bg-paper-tint flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
          Production tier
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          {tier ?? 'v0.1'} · {TIER_LABELS[tier ?? 'v0.1'] ?? 'free backbone'}
        </p>
      </div>

      <div className="px-5 py-4 grid grid-cols-3 gap-3 border-b border-ink-subtle/10">
        <Stat label="Spent" value={`$${spent.toFixed(2)}`} sub="production" />
        <Stat label="Donated" value={`$${donated.toFixed(2)}`} sub="received" />
        <Stat
          label="Balance"
          value={`$${balance.toFixed(2)}`}
          sub={balance >= 0 ? 'in pool' : 'underfunded'}
          tone={balance >= 0 ? 'good' : 'warn'}
        />
      </div>

      {nextImprovement && (
        <div className="px-5 py-4 border-b border-ink-subtle/10">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle mb-1">
            Next improvement · {nextImprovement.tier}
          </p>
          <p className="text-sm text-ink leading-snug mb-2">{nextImprovement.what}</p>
          <div className="h-1 bg-paper-tint rounded-full overflow-hidden">
            <div
              className="h-full bg-accent"
              style={{
                width: `${Math.min(100, (Math.max(0, balance) / Math.max(1, nextImprovement.cost_usd)) * 100)}%`,
              }}
            />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-subtle tabular-nums">
            <span>${Math.max(0, balance).toFixed(0)} / ${nextImprovement.cost_usd}</span>
            <span>${remainingToNext.toFixed(0)} to unlock</span>
          </div>
        </div>
      )}

      {donateUrl && (
        <a
          href={donateUrl}
          target="_blank"
          rel="noreferrer"
          className="block px-5 py-3 text-center font-mono text-xs uppercase tracking-[0.18em] bg-accent text-paper hover:bg-accent-hover transition"
        >
          Donate to this lesson →
        </a>
      )}
    </motion.div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-subtle leading-none">
        {label}
      </p>
      <p
        className={`font-display text-xl font-semibold tabular-nums leading-none mt-1 ${
          tone === 'good' ? 'text-signal-good' : tone === 'warn' ? 'text-signal-warn' : 'text-ink'
        }`}
      >
        {value}
      </p>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-subtle mt-0.5 leading-none">
        {sub}
      </p>
    </div>
  );
}
