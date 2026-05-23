import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function AIVideo({ prompt, caption, duration, src }) {
    if (src) {
        return (_jsxs("figure", { className: "my-6", children: [_jsx("video", { controls: true, src: src, className: "w-full rounded-2xl shadow-card border border-ink-subtle/10" }), caption && (_jsx("figcaption", { className: "mt-2 text-center text-sm text-ink-muted", children: caption }))] }));
    }
    return (_jsxs("figure", { className: "my-6", children: [_jsxs("div", { className: "rounded-2xl border-2 border-dashed border-accent/30 bg-accent-soft/30 p-8 text-center", children: [_jsx("p", { className: "font-mono text-xs uppercase tracking-[0.18em] text-accent mb-3", children: "\u25B6 Video placeholder" }), _jsxs("p", { className: "text-ink-muted italic", children: ["\"", prompt, "\""] }), duration && (_jsxs("p", { className: "mt-2 font-mono text-xs text-ink-subtle", children: ["~", duration, "s"] }))] }), caption && (_jsx("figcaption", { className: "mt-2 text-center text-sm text-ink-muted", children: caption }))] }));
}
