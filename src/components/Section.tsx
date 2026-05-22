import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  splitSentences,
  useNarration,
  currentSentenceIndex,
} from '@/lib/narration-context';

export interface Discovery {
  /** Short reveal — 1–2 sentences. */
  brief: string;
  /** Optional deeper layer — clickable from inside the brief popover. */
  deep?: string;
}

export type DiscoveryMap = Record<string, Discovery>;

interface SectionProps {
  title?: string;
  eyebrow?: string;
  /**
   * 'prose' (default) — typographic reading layout.
   * 'slide' — presentation layout. Two panes: visual on left, narration transcript on right.
   */
  layout?: 'prose' | 'slide';
  /**
   * Narration script (plain text) read aloud by TTS AND rendered as a transcript
   * panel beside the visual. Conversational and rigorous.
   */
  narration?: string;
  /**
   * Discoverable rabbit-hole terms. Keys are case-insensitive substrings that
   * appear in the narration; values are layered popover content. The transcript
   * panel marks matched terms as clickable.
   */
  discoveries?: DiscoveryMap;
  children: ReactNode;
}

export function Section({
  title,
  eyebrow,
  layout = 'prose',
  narration,
  discoveries,
  children,
}: SectionProps) {
  const header =
    eyebrow || title ? (
      <header
        className={
          layout === 'slide'
            ? 'mb-4 md:mb-6 flex-shrink-0'
            : 'mb-6'
        }
      >
        {eyebrow && (
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent mb-2">
            {eyebrow}
          </p>
        )}
        {title && (
          <h2
            className={
              layout === 'slide'
                ? 'font-display text-3xl md:text-4xl font-semibold tracking-tight leading-tight'
                : 'font-display text-2xl md:text-3xl font-semibold tracking-tight'
            }
          >
            {title}
          </h2>
        )}
      </header>
    ) : null;

  if (layout === 'slide') {
    return (
      <div className="w-full max-w-7xl mx-auto flex flex-col min-h-[calc(100vh-13rem)]">
        {header}
        <div className="flex-1 grid md:grid-cols-[1.6fr,1fr] gap-6 md:gap-10 items-start min-h-0">
          <div className="min-h-0">{children}</div>
          {narration && (
            <div className="md:sticky md:top-4 md:max-h-[calc(100vh-15rem)] min-h-0 flex">
              <TranscriptPanel text={narration} discoveries={discoveries} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="w-full max-w-[68ch] mx-auto">
      {header}
      <div className="lesson-prose">{children}</div>
    </section>
  );
}

Section.displayName = 'Section';

/* ============================================================
   Transcript panel — sentences with sentence highlighting +
   discoverable terms that open layered popovers.
   ============================================================ */

interface TranscriptProps {
  text: string;
  discoveries?: DiscoveryMap;
}

function TranscriptPanel({ text, discoveries }: TranscriptProps) {
  const { progress, isPlaying } = useNarration();
  const sentences = useMemo(() => splitSentences(text), [text]);
  const activeIdx = useMemo(
    () =>
      isPlaying || progress > 0
        ? currentSentenceIndex(progress, sentences.length)
        : -1,
    [progress, isPlaying, sentences.length],
  );

  // Pre-compute the segmented sentences (text + discovery markers)
  const segmented = useMemo(
    () => sentences.map((s) => segmentSentence(s, discoveries)),
    [sentences, discoveries],
  );

  return (
    <aside className="flex flex-col bg-paper-card rounded-2xl border border-ink-subtle/10 shadow-card overflow-hidden">
      <div className="px-5 py-2.5 border-b border-ink-subtle/10 bg-paper-tint flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
          Transcript
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle tabular-nums">
          {discoveries && Object.keys(discoveries).length > 0
            ? `${Object.keys(discoveries).length} ⌖`
            : `${sentences.length} lines`}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-3 text-[15px] leading-[1.7]">
        {segmented.map((segs, i) => {
          const isActive = i === activeIdx;
          const isPast = activeIdx > -1 && i < activeIdx;
          return (
            <motion.p
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.25 }}
              className={
                isActive
                  ? 'text-ink font-medium border-l-2 border-accent pl-3 -ml-3'
                  : isPast
                    ? 'text-ink-muted pl-3 -ml-3 border-l-2 border-transparent'
                    : 'text-ink/85 pl-3 -ml-3 border-l-2 border-transparent'
              }
            >
              {segs.map((seg, j) =>
                seg.kind === 'text' ? (
                  <span key={j}>{seg.text}</span>
                ) : (
                  <DiscoveryMarker
                    key={j}
                    label={seg.text}
                    discovery={seg.discovery!}
                  />
                ),
              )}
            </motion.p>
          );
        })}
        {discoveries && Object.keys(discoveries).length > 0 && (
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle pt-2 mt-3 border-t border-ink-subtle/10">
            ⌖ click marked terms for rabbit holes
          </p>
        )}
      </div>
    </aside>
  );
}

/* ============================================================
   DiscoveryMarker — inline clickable term with layered popover.
   ============================================================ */

function DiscoveryMarker({
  label,
  discovery,
}: {
  label: string;
  discovery: Discovery;
}) {
  const [open, setOpen] = useState(false);
  const [showDeep, setShowDeep] = useState(false);
  const [genStatus, setGenStatus] = useState<null | 'sending' | 'queued' | 'copied' | 'error'>(
    null,
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const popoverWidth = 340;
    const x = Math.min(r.left, window.innerWidth - popoverWidth - 16);
    const y = r.bottom + 8;
    setPos({ x: Math.max(8, x), y });
  }, [open]);

  async function requestNewLesson() {
    const subject = label;
    const slug = slugify(label);
    const contextSummary = discovery.brief + (discovery.deep ? '\n\n' + discovery.deep : '');
    const sourceTitle = document.title || 'a related lesson';
    const prompt = buildGenerationPrompt({
      subject,
      slug,
      context: contextSummary,
      sourceTitle,
    });
    const endpoint = (import.meta.env.VITE_LESSON_GEN_URL as string | undefined) ?? '';
    setGenStatus('sending');
    if (endpoint) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, slug, context: contextSummary, prompt }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setGenStatus('queued');
        return;
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(prompt);
      setGenStatus('copied');
    } catch {
      setGenStatus('error');
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setShowDeep(false);
          setGenStatus(null);
        }}
        className="text-accent border-b border-dotted border-accent/50 hover:border-accent hover:bg-accent-soft/60 px-0.5 rounded-sm transition cursor-pointer inline align-baseline"
      >
        {label}
      </button>
      {open &&
        createPortal(
          <AnimatePresence>
            <button
              type="button"
              aria-label="Close"
              className="fixed inset-0 z-[60] cursor-default"
              onClick={() => setOpen(false)}
            />
            <motion.div
              key="popover"
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              style={{ left: pos.x, top: pos.y }}
              className="fixed z-[70] w-[340px] max-w-[85vw] bg-paper-card rounded-xl border border-accent/30 shadow-2xl p-4"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent mb-1.5">
                ⌖ {label}
              </div>
              <div className="text-sm text-ink leading-relaxed">{discovery.brief}</div>
              {discovery.deep && (
                <div className="mt-3 pt-3 border-t border-ink-subtle/10">
                  {!showDeep ? (
                    <button
                      type="button"
                      onClick={() => setShowDeep(true)}
                      className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent hover:text-accent-hover"
                    >
                      ↳ deeper
                    </button>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="text-sm text-ink/90 leading-relaxed"
                    >
                      {discovery.deep}
                    </motion.div>
                  )}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-ink-subtle/10">
                <button
                  type="button"
                  onClick={requestNewLesson}
                  disabled={genStatus === 'sending'}
                  className="w-full rounded-lg bg-accent-soft hover:bg-accent/20 border border-accent/30 text-accent font-mono text-[10px] uppercase tracking-[0.18em] py-2 transition disabled:opacity-60"
                >
                  {genStatus === 'sending'
                    ? '… requesting'
                    : genStatus === 'queued'
                      ? '✓ queued to agent'
                      : genStatus === 'copied'
                        ? '✓ prompt copied — paste into your agent'
                        : genStatus === 'error'
                          ? '⚠ clipboard blocked — see console'
                          : '→ generate full lesson on this'}
                </button>
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function buildGenerationPrompt({
  subject,
  slug,
  context,
  sourceTitle,
}: {
  subject: string;
  slug: string;
  context: string;
  sourceTitle: string;
}): string {
  return `Use the learning-tool MCP server to create a new lesson.

SUBJECT: ${subject}
SUGGESTED SLUG: ${slug}
SOURCE CONTEXT (from "${sourceTitle}"):
${context}

STEPS:
1. Call get_authoring_brief — read it in full, especially the five layers (mechanism, narrative, walk-throughs, puzzles, discoverable side stories) and the depth target.
2. Call describe_components for any components you need details on.
3. Optionally call get_example_lesson for one worked example of the style.
4. Compose an 8–12 scene lesson on "${subject}" with:
   - Rich narration per scene (4–8 sentences, conversational, with mathematicians/papers/dates named)
   - At least one interactive puzzle whose mechanic mirrors the system mechanism
   - A discoveries map seeding 3–6 rabbit holes per scene with brief + deep layers
   - Real historical detail and adjacent discoveries woven into the narration
5. Call create_lesson with slug "${slug}", a clean title, and a one-sentence summary.

Target: 30–60 minutes of total engagement. Veritasium-section-sized scenes. Builder-grade depth.`;
}

/* ============================================================
   segmentSentence — split a sentence into text and discovery
   markers based on case-insensitive substring match.
   ============================================================ */

interface Segment {
  kind: 'text' | 'discovery';
  text: string;
  discovery?: Discovery;
}

function segmentSentence(sentence: string, discoveries?: DiscoveryMap): Segment[] {
  if (!discoveries || Object.keys(discoveries).length === 0) {
    return [{ kind: 'text', text: sentence }];
  }
  // Sort keys by length desc so longer terms get matched first
  const terms = Object.keys(discoveries).sort((a, b) => b.length - a.length);
  const segs: Segment[] = [];
  let i = 0;
  while (i < sentence.length) {
    let matched: { term: string; len: number } | null = null;
    const remainingLower = sentence.slice(i).toLowerCase();
    for (const term of terms) {
      if (remainingLower.startsWith(term.toLowerCase())) {
        // Boundary check: don't match in the middle of a word
        const before = i === 0 ? ' ' : sentence[i - 1];
        const afterIdx = i + term.length;
        const after = afterIdx >= sentence.length ? ' ' : sentence[afterIdx];
        if (!isWordChar(before) && !isWordChar(after)) {
          matched = { term, len: term.length };
          break;
        }
      }
    }
    if (matched) {
      segs.push({
        kind: 'discovery',
        text: sentence.slice(i, i + matched.len),
        discovery: discoveries[matched.term],
      });
      i += matched.len;
    } else {
      // Accumulate a non-matching run until the next match boundary
      const start = i;
      while (i < sentence.length) {
        const remainingLower = sentence.slice(i).toLowerCase();
        const wouldMatch = terms.some((term) => {
          if (!remainingLower.startsWith(term.toLowerCase())) return false;
          const before = i === 0 ? ' ' : sentence[i - 1];
          const afterIdx = i + term.length;
          const after = afterIdx >= sentence.length ? ' ' : sentence[afterIdx];
          return !isWordChar(before) && !isWordChar(after);
        });
        if (wouldMatch) break;
        i += 1;
      }
      segs.push({ kind: 'text', text: sentence.slice(start, i) });
    }
  }
  return segs;
}

function isWordChar(c: string): boolean {
  return /[A-Za-z0-9_-]/.test(c);
}
