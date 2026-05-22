import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TimelinePlayer } from '@/components/TimelinePlayer';
import { FixedPointHunter, type FixedPointHunterHandle } from './FixedPointHunter';
import { BANACH_TIMELINE } from '../timelines/banach';
import charactersJson from '../characters.json';

const VOICE_MAP: Record<string, string> = Object.fromEntries(
  charactersJson.characters.map((c) => [c.id, c.voice_id]),
);

/**
 * Banach scene with two modes:
 *  - USER (default) — free play, full puzzle in your hands
 *  - DEMO          — timeline drives FPH; the narrator walks you through
 *                    all 4 levels with synthesized audio
 *
 * Toggle in the corner. Demo can be paused/restarted via the player
 * controls. Switching back to user mode resets the puzzle.
 */
export function BanachPlayableScene() {
  const fphRef = useRef<FixedPointHunterHandle>(null);
  const [mode, setMode] = useState<'user' | 'demo'>('user');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          <ModeButton
            label="Play"
            sub="you drive"
            active={mode === 'user'}
            onClick={() => {
              setMode('user');
              fphRef.current?.reset();
            }}
          />
          <ModeButton
            label="Watch"
            sub="guided demo"
            active={mode === 'demo'}
            onClick={() => setMode('demo')}
          />
        </div>
        <AnimatePresence>
          {mode === 'demo' && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <TimelinePlayer
                scene={BANACH_TIMELINE}
                interactiveRef={fphRef}
                voiceMap={VOICE_MAP}
                autoPlay
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <FixedPointHunter ref={fphRef} />
    </div>
  );
}

function ModeButton({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-1.5 text-left transition ${
        active
          ? 'bg-accent text-paper'
          : 'bg-paper-card border border-ink-subtle/15 text-ink-muted hover:text-ink hover:border-ink-subtle/40'
      }`}
    >
      <p className="font-mono text-xs uppercase tracking-[0.18em] leading-none">{label}</p>
      <p
        className={`font-mono text-[9px] uppercase tracking-[0.18em] mt-0.5 leading-none ${
          active ? 'opacity-80' : 'text-ink-subtle'
        }`}
      >
        {sub}
      </p>
    </button>
  );
}
