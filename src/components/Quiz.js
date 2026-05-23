import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
export function Quiz({ question, options, correct, explanation }) {
    const [picked, setPicked] = useState(null);
    const done = picked !== null;
    return (_jsxs("div", { className: "my-8 rounded-2xl border border-ink-subtle/20 bg-paper-card p-6 shadow-card", children: [_jsx("p", { className: "font-mono text-xs uppercase tracking-[0.18em] text-accent mb-3", children: "Check your understanding" }), _jsx("p", { className: "font-display text-xl font-semibold mb-5", children: question }), _jsx("ul", { className: "space-y-2", children: options.map((opt, i) => {
                    const isPicked = picked === i;
                    const isCorrect = i === correct;
                    const showState = done && (isPicked || isCorrect);
                    return (_jsx("li", { children: _jsxs("button", { onClick: () => !done && setPicked(i), disabled: done, className: `w-full text-left rounded-xl border px-4 py-3 transition ${showState && isCorrect
                                ? 'border-signal-good bg-signal-good/10'
                                : showState && isPicked && !isCorrect
                                    ? 'border-signal-bad bg-signal-bad/10'
                                    : 'border-ink-subtle/20 hover:border-accent/50 hover:bg-accent-soft/30'} ${done ? 'cursor-default' : 'cursor-pointer'}`, children: [_jsx("span", { className: "font-mono text-xs text-ink-subtle mr-3", children: String.fromCharCode(65 + i) }), opt] }) }, i));
                }) }), _jsx(AnimatePresence, { children: done && explanation && (_jsx(motion.div, { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: 'auto' }, exit: { opacity: 0, height: 0 }, className: "overflow-hidden", children: _jsxs("div", { className: "mt-5 rounded-xl bg-paper-tint p-4 text-ink/90", children: [_jsx("p", { className: "font-mono text-xs uppercase tracking-wider text-ink-subtle mb-1", children: picked === correct ? 'Right —' : 'Not quite —' }), _jsx("p", { children: explanation })] }) })) })] }));
}
