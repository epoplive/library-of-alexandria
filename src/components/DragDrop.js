import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
export function MatchPairs({ pairs }) {
    const shuffledRight = useMemo(() => shuffle(pairs.map((p, i) => ({ text: p.right, originalIndex: i }))), [pairs]);
    const [leftSelected, setLeftSelected] = useState(null);
    const [matches, setMatches] = useState({});
    const [wrong, setWrong] = useState(null);
    function pickLeft(i) {
        if (matches[i] !== undefined)
            return;
        setLeftSelected(leftSelected === i ? null : i);
    }
    function pickRight(shuffledIndex) {
        if (leftSelected === null)
            return;
        const rightOriginal = shuffledRight[shuffledIndex].originalIndex;
        if (rightOriginal === leftSelected) {
            setMatches((m) => ({ ...m, [leftSelected]: shuffledIndex }));
            setLeftSelected(null);
        }
        else {
            setWrong([leftSelected, shuffledIndex]);
            setTimeout(() => setWrong(null), 500);
        }
    }
    const allDone = Object.keys(matches).length === pairs.length;
    return (_jsxs("div", { className: "my-8 rounded-2xl border border-ink-subtle/15 bg-paper-card p-6 shadow-card", children: [_jsx("p", { className: "font-mono text-xs uppercase tracking-[0.12em] text-ink-muted mb-4", children: allDone ? 'All matched ✓' : 'Tap a term, then its match' }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx("div", { className: "space-y-2", children: pairs.map((p, i) => {
                            const matched = matches[i] !== undefined;
                            const selected = leftSelected === i;
                            const wrongHit = wrong?.[0] === i;
                            return (_jsx("button", { onClick: () => pickLeft(i), disabled: matched, className: `w-full text-left rounded-xl border px-4 py-3 transition ${matched
                                    ? 'border-signal-good/40 bg-signal-good/5 text-ink-muted line-through decoration-signal-good/40'
                                    : wrongHit
                                        ? 'border-signal-bad bg-signal-bad/10 animate-pulse'
                                        : selected
                                            ? 'border-accent bg-accent-soft'
                                            : 'border-ink-subtle/20 hover:border-accent/50'}`, children: p.left }, i));
                        }) }), _jsx("div", { className: "space-y-2", children: shuffledRight.map((r, i) => {
                            const matched = Object.values(matches).includes(i);
                            const wrongHit = wrong?.[1] === i;
                            return (_jsx("button", { onClick: () => pickRight(i), disabled: matched || leftSelected === null, className: `w-full text-left rounded-xl border px-4 py-3 transition ${matched
                                    ? 'border-signal-good/40 bg-signal-good/5 text-ink-muted line-through decoration-signal-good/40'
                                    : wrongHit
                                        ? 'border-signal-bad bg-signal-bad/10 animate-pulse'
                                        : leftSelected !== null
                                            ? 'border-accent/40 hover:border-accent hover:bg-accent-soft cursor-pointer'
                                            : 'border-ink-subtle/20 opacity-70'}`, children: r.text }, i));
                        }) })] })] }));
}
