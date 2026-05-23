import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Sandbox({ title, controls, children }) {
    return (_jsxs("figure", { className: "my-8 rounded-2xl border border-ink-subtle/15 bg-paper-card overflow-hidden shadow-card", children: [title && (_jsx("div", { className: "px-5 py-3 border-b border-ink-subtle/10 bg-paper-tint", children: _jsx("p", { className: "font-mono text-xs uppercase tracking-[0.12em] text-ink-muted", children: title }) })), _jsx("div", { className: "p-5", children: children }), controls && (_jsx("div", { className: "px-5 pb-5 border-t border-ink-subtle/10 pt-4 bg-paper-tint/40", children: controls }))] }));
}
