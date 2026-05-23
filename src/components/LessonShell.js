import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Children, isValidElement, useEffect, useMemo, useRef, } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { NarrationPlayer, useTTSPrefetch } from './NarrationPlayer';
import { NarrationProvider } from '@/lib/narration-context';
export function LessonShell(props) {
    return (_jsx(NarrationProvider, { children: _jsx(LessonShellInner, { ...props }) }));
}
function LessonShellInner({ title, subtitle, kicker, estimatedMinutes, children, }) {
    const scenes = useMemo(() => {
        const out = [];
        Children.forEach(children, (child) => {
            if (isValidElement(child) &&
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                child.type?.displayName === 'Section') {
                const props = child.props;
                out.push({ element: child, narration: props?.narration });
            }
        });
        return out;
    }, [children]);
    const totalPages = scenes.length + 1; // cover + scenes
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const requested = parseInt(params.get('p') ?? '0', 10);
    const page = Number.isFinite(requested)
        ? Math.min(Math.max(0, requested), totalPages - 1)
        : 0;
    const isCover = page === 0;
    const isLast = page === totalPages - 1;
    const viewportRef = useRef(null);
    useTTSPrefetch();
    function go(n) {
        const next = Math.min(Math.max(0, n), totalPages - 1);
        setParams(next === 0 ? {} : { p: String(next) }, { replace: true });
    }
    useEffect(() => {
        if (viewportRef.current)
            viewportRef.current.scrollTop = 0;
    }, [page]);
    useEffect(() => {
        function onKey(e) {
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA')
                return;
            if (e.key === 'ArrowRight')
                go(page + 1);
            if (e.key === 'ArrowLeft')
                go(page - 1);
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });
    const currentScene = isCover ? null : scenes[page - 1];
    const narration = currentScene?.narration;
    const sceneKey = `${location.pathname}#${page}`;
    return (_jsxs("div", { className: "h-screen flex flex-col bg-paper-tint", children: [_jsxs("header", { className: "flex-shrink-0 h-14 px-3 md:px-5 bg-paper-card border-b border-ink-subtle/10 flex items-center gap-4", children: [_jsx(Link, { to: "/", "aria-label": "Exit lesson", className: "text-ink-subtle hover:text-ink p-2 rounded-lg hover:bg-paper-tint transition", children: _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", children: _jsx("path", { d: "M18 6L6 18M6 6l12 12" }) }) }), _jsx("div", { className: "flex-1 flex items-center justify-center gap-1.5", children: Array.from({ length: totalPages }, (_, i) => (_jsx("button", { type: "button", onClick: () => go(i), "aria-label": `Go to page ${i}`, className: `h-1.5 rounded-full transition-all ${i === page
                                ? 'w-8 bg-accent'
                                : i < page
                                    ? 'w-4 bg-accent/40 hover:bg-accent/60'
                                    : 'w-4 bg-ink-subtle/20 hover:bg-ink-subtle/40'}` }, i))) }), _jsx("div", { className: "font-mono text-[11px] text-ink-subtle whitespace-nowrap tabular-nums min-w-[64px] text-right", children: estimatedMinutes ? `~${estimatedMinutes} min` : '' })] }), _jsx("div", { ref: viewportRef, className: "flex-1 overflow-y-auto", children: _jsx(AnimatePresence, { mode: "wait", children: _jsx(motion.div, { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 }, transition: { duration: 0.22, ease: 'easeOut' }, className: "min-h-full px-6 py-10 md:py-14", children: isCover ? (_jsxs("div", { className: "max-w-2xl mx-auto text-center flex flex-col items-center justify-center min-h-[calc(100vh-14rem)]", children: [kicker && (_jsx("p", { className: "font-mono text-xs uppercase tracking-[0.22em] text-accent mb-6", children: kicker })), _jsx("h1", { className: "font-display text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]", children: title }), subtitle && (_jsx("p", { className: "mt-6 text-lg md:text-xl text-ink-muted max-w-xl", children: subtitle })), _jsx("button", { type: "button", onClick: () => go(1), className: "mt-12 px-8 py-3.5 rounded-2xl bg-accent text-paper font-mono text-xs uppercase tracking-[0.18em] hover:bg-accent-hover transition shadow-card", children: "Start \u2192" }), scenes.length > 0 && (_jsxs("p", { className: "mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle", children: [scenes.length, " scene", scenes.length === 1 ? '' : 's', estimatedMinutes ? ` · ~${estimatedMinutes} min` : ''] }))] })) : (currentScene?.element) }, page) }) }), !isCover && (_jsxs("footer", { className: "flex-shrink-0 h-16 px-3 md:px-5 bg-paper-card border-t border-ink-subtle/10 flex items-center justify-between gap-4", children: [_jsx("button", { type: "button", onClick: () => go(page - 1), className: "font-mono text-xs uppercase tracking-[0.14em] text-ink-muted hover:text-ink px-3 py-2 rounded-lg hover:bg-paper-tint transition shrink-0", children: "\u2190 Back" }), narration ? (_jsx("div", { className: "flex-1 flex justify-center min-w-0", children: _jsx(NarrationPlayer, { text: narration, sceneKey: sceneKey }) })) : (_jsxs("span", { className: "font-mono text-[11px] text-ink-subtle tabular-nums", children: [page, " / ", totalPages - 1] })), !isLast ? (_jsx("button", { type: "button", onClick: () => go(page + 1), className: "px-5 py-2.5 rounded-xl bg-accent text-paper font-mono text-xs uppercase tracking-[0.14em] hover:bg-accent-hover transition shadow-card shrink-0", children: "Next \u2192" })) : (_jsx(Link, { to: "/", className: "px-5 py-2.5 rounded-xl bg-accent text-paper font-mono text-xs uppercase tracking-[0.14em] hover:bg-accent-hover transition shadow-card shrink-0", children: "Finish \u2713" }))] }))] }));
}
