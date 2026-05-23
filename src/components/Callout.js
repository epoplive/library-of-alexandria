import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const styles = {
    insight: 'border-accent/30 bg-accent-soft/40',
    info: 'border-signal-info/30 bg-signal-info/5',
    warn: 'border-signal-warn/40 bg-signal-warn/5',
    aside: 'border-ink-subtle/20 bg-paper-tint',
};
const icons = {
    insight: '★',
    info: 'i',
    warn: '!',
    aside: '·',
};
const iconColors = {
    insight: 'text-accent',
    info: 'text-signal-info',
    warn: 'text-signal-warn',
    aside: 'text-ink-subtle',
};
export function Callout({ kind = 'insight', title, children }) {
    return (_jsx("aside", { className: `my-6 rounded-2xl border ${styles[kind]} p-5`, children: _jsxs("div", { className: "flex gap-3", children: [_jsx("span", { className: `font-display text-lg leading-none mt-0.5 ${iconColors[kind]}`, "aria-hidden": true, children: icons[kind] }), _jsxs("div", { className: "flex-1", children: [title && _jsx("p", { className: "font-semibold mb-1", children: title }), _jsx("div", { className: "text-ink/90 [&>p]:mb-2 [&>p:last-child]:mb-0", children: children })] })] }) }));
}
