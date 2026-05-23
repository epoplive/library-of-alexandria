import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TimelinePlayer } from '@/components/TimelinePlayer';
import { HaltOrContinueGame, type HaltOrContinueGameHandle } from './HaltOrContinueGame';
import { HALT_TIMELINE } from '../timelines/halt';
import charactersJson from '../characters.json';

const VOICE_MAP: Record<string, string> = Object.fromEntries(
  charactersJson.characters.map((c) => [c.id, c.voice_id]),
);

/**
 * Halting-head scene with two modes:
 *   PLAY  — free play, you're the halting head across 3 problems
 *   WATCH — narrator demos the optimal policy on each problem,
 *           driving the game state through the timeline ref
 */
export function HaltPlayableScene() {
  const ref = useRef<HaltOrContinueGameHandle>(null);
  const [mode, setMode] = useState<'play' | 'watch'>('play');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          <ModeButton
            label="Play"
            sub="you halt"
            active={mode === 'play'}
            onClick={() => {
              setMode('play');
              ref.current?.reset();
            }}
          />
          <ModeButton
            label="Watch"
            sub="optimal demo"
            active={mode === 'watch'}
            onClick={() => setMode('watch')}
          />
        </div>
        <AnimatePresence>
          {mode === 'watch' && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <TimelinePlayer
                scene={HALT_TIMELINE}
                interactiveRef={ref}
                voiceMap={VOICE_MAP}
                autoPlay
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <HaltOrContinueGame ref={ref} />
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
