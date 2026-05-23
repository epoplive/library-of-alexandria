import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { splitSentences, useNarration, sentenceIndexFromTimings, } from '@/lib/narration-context';
import { getTimings } from '@/lib/tts';
export function Section({ title, eyebrow, layout = 'prose', narration, discoveries, children, }) {
    const header = eyebrow || title ? (_jsxs("header", { className: layout === 'slide'
            ? 'mb-4 md:mb-6 flex-shrink-0'
            : 'mb-6', children: [eyebrow && (_jsx("p", { className: "font-mono text-xs uppercase tracking-[0.22em] text-accent mb-2", children: eyebrow })), title && (_jsx("h2", { className: layout === 'slide'
                    ? 'font-display text-3xl md:text-4xl font-semibold tracking-tight leading-tight'
                    : 'font-display text-2xl md:text-3xl font-semibold tracking-tight', children: title }))] })) : null;
    if (layout === 'slide') {
        return (_jsxs("div", { className: "w-full max-w-7xl mx-auto flex flex-col min-h-[calc(100vh-13rem)]", children: [header, _jsxs("div", { className: "flex-1 grid md:grid-cols-[1.6fr,1fr] gap-6 md:gap-10 items-start min-h-0", children: [_jsx("div", { className: "min-h-0", children: children }), narration && (_jsx("div", { className: "md:sticky md:top-4 md:max-h-[calc(100vh-15rem)] min-h-0 flex", children: _jsx(TranscriptPanel, { text: narration, discoveries: discoveries }) }))] })] }));
    }
    return (_jsxs("section", { className: "w-full max-w-[68ch] mx-auto", children: [header, _jsx("div", { className: "lesson-prose", children: children })] }));
}
Section.displayName = 'Section';
function TranscriptPanel({ text, discoveries }) {
    const { progress, currentTimeSec, isPlaying } = useNarration();
    const sentences = useMemo(() => splitSentences(text), [text]);
    // Look up the pre-rendered audio's per-chunk timings (sentence-aligned
    // gen-audio output). When present, the active sentence is computed by
    // mapping audio position → chunk → sentence-within-chunk by char
    // weight. When absent, falls back to uniform progress * N partitioning.
    const timings = useMemo(() => getTimings(text), [text]);
    const activeIdx = useMemo(() => isPlaying || progress > 0
        ? sentenceIndexFromTimings(currentTimeSec, progress, sentences, timings)
        : -1, [progress, currentTimeSec, isPlaying, sentences, timings]);
    // Pre-compute the segmented sentences (text + discovery markers)
    const segmented = useMemo(() => sentences.map((s) => segmentSentence(s, discoveries)), [sentences, discoveries]);
    return (_jsxs("aside", { className: "flex flex-col bg-paper-card rounded-2xl border border-ink-subtle/10 shadow-card overflow-hidden", children: [_jsxs("div", { className: "px-5 py-2.5 border-b border-ink-subtle/10 bg-paper-tint flex items-center justify-between", children: [_jsx("p", { className: "font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle", children: "Transcript" }), _jsx("p", { className: "font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle tabular-nums", children: discoveries && Object.keys(discoveries).length > 0
                            ? `${Object.keys(discoveries).length} ⌖`
                            : `${sentences.length} lines` })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-5 space-y-3 text-[15px] leading-[1.7]", children: [segmented.map((segs, i) => {
                        const isActive = i === activeIdx;
                        const isPast = activeIdx > -1 && i < activeIdx;
                        return (_jsx(motion.p, { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { delay: i * 0.04, duration: 0.25 }, className: isActive
                                ? 'text-ink font-medium border-l-2 border-accent pl-3 -ml-3'
                                : isPast
                                    ? 'text-ink-muted pl-3 -ml-3 border-l-2 border-transparent'
                                    : 'text-ink/85 pl-3 -ml-3 border-l-2 border-transparent', children: segs.map((seg, j) => seg.kind === 'text' ? (_jsx("span", { children: seg.text }, j)) : (_jsx(DiscoveryMarker, { label: seg.text, discovery: seg.discovery }, j))) }, i));
                    }), discoveries && Object.keys(discoveries).length > 0 && (_jsx("p", { className: "font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle pt-2 mt-3 border-t border-ink-subtle/10", children: "\u2316 click marked terms for rabbit holes" }))] })] }));
}
/* ============================================================
   DiscoveryMarker — inline clickable term with layered popover.
   ============================================================ */
function DiscoveryMarker({ label, discovery, }) {
    const [open, setOpen] = useState(false);
    const [showDeep, setShowDeep] = useState(false);
    const [genStatus, setGenStatus] = useState(null);
    const btnRef = useRef(null);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    useEffect(() => {
        if (!open || !btnRef.current)
            return;
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
        const endpoint = import.meta.env.VITE_LESSON_GEN_URL ?? '';
        setGenStatus('sending');
        if (endpoint) {
            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subject, slug, context: contextSummary, prompt }),
                });
                if (!res.ok)
                    throw new Error(String(res.status));
                setGenStatus('queued');
                return;
            }
            catch {
                // fall through to clipboard
            }
        }
        try {
            await navigator.clipboard.writeText(prompt);
            setGenStatus('copied');
        }
        catch {
            setGenStatus('error');
        }
    }
    return (_jsxs(_Fragment, { children: [_jsx("button", { ref: btnRef, type: "button", onClick: () => {
                    setOpen((o) => !o);
                    setShowDeep(false);
                    setGenStatus(null);
                }, className: "text-accent border-b border-dotted border-accent/50 hover:border-accent hover:bg-accent-soft/60 px-0.5 rounded-sm transition cursor-pointer inline align-baseline", children: label }), open &&
                createPortal(_jsxs(AnimatePresence, { children: [_jsx("button", { type: "button", "aria-label": "Close", className: "fixed inset-0 z-[60] cursor-default", onClick: () => setOpen(false) }), _jsxs(motion.div, { initial: { opacity: 0, y: 6, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, scale: 0.96 }, transition: { duration: 0.18 }, style: { left: pos.x, top: pos.y }, className: "fixed z-[70] w-[340px] max-w-[85vw] bg-paper-card rounded-xl border border-accent/30 shadow-2xl p-4", children: [_jsxs("div", { className: "font-mono text-[10px] uppercase tracking-[0.22em] text-accent mb-1.5", children: ["\u2316 ", label] }), _jsx("div", { className: "text-sm text-ink leading-relaxed", children: discovery.brief }), discovery.deep && (_jsx("div", { className: "mt-3 pt-3 border-t border-ink-subtle/10", children: !showDeep ? (_jsx("button", { type: "button", onClick: () => setShowDeep(true), className: "font-mono text-[10px] uppercase tracking-[0.18em] text-accent hover:text-accent-hover", children: "\u21B3 deeper" })) : (_jsx(motion.div, { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: 'auto' }, className: "text-sm text-ink/90 leading-relaxed", children: discovery.deep })) })), _jsx("div", { className: "mt-3 pt-3 border-t border-ink-subtle/10", children: _jsx("button", { type: "button", onClick: requestNewLesson, disabled: genStatus === 'sending', className: "w-full rounded-lg bg-accent-soft hover:bg-accent/20 border border-accent/30 text-accent font-mono text-[10px] uppercase tracking-[0.18em] py-2 transition disabled:opacity-60", children: genStatus === 'sending'
                                            ? '… requesting'
                                            : genStatus === 'queued'
                                                ? '✓ queued to agent'
                                                : genStatus === 'copied'
                                                    ? '✓ prompt copied — paste into your agent'
                                                    : genStatus === 'error'
                                                        ? '⚠ clipboard blocked — see console'
                                                        : '→ generate full lesson on this' }) })] }, "popover")] }), document.body)] }));
}
function slugify(s) {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}
function buildGenerationPrompt({ subject, slug, context, sourceTitle, }) {
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
function segmentSentence(sentence, discoveries) {
    if (!discoveries || Object.keys(discoveries).length === 0) {
        return [{ kind: 'text', text: sentence }];
    }
    // Sort keys by length desc so longer terms get matched first
    const terms = Object.keys(discoveries).sort((a, b) => b.length - a.length);
    const segs = [];
    let i = 0;
    while (i < sentence.length) {
        let matched = null;
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
        }
        else {
            // Accumulate a non-matching run until the next match boundary
            const start = i;
            while (i < sentence.length) {
                const remainingLower = sentence.slice(i).toLowerCase();
                const wouldMatch = terms.some((term) => {
                    if (!remainingLower.startsWith(term.toLowerCase()))
                        return false;
                    const before = i === 0 ? ' ' : sentence[i - 1];
                    const afterIdx = i + term.length;
                    const after = afterIdx >= sentence.length ? ' ' : sentence[afterIdx];
                    return !isWordChar(before) && !isWordChar(after);
                });
                if (wouldMatch)
                    break;
                i += 1;
            }
            segs.push({ kind: 'text', text: sentence.slice(start, i) });
        }
    }
    return segs;
}
function isWordChar(c) {
    return /[A-Za-z0-9_-]/.test(c);
}
