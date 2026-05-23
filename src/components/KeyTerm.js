import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
export function KeyTerm({ term, definition }) {
    const [open, setOpen] = useState(false);
    return (_jsxs("span", { className: "relative inline-block", children: [_jsx("button", { type: "button", onMouseEnter: () => setOpen(true), onMouseLeave: () => setOpen(false), onFocus: () => setOpen(true), onBlur: () => setOpen(false), onClick: () => setOpen((v) => !v), className: "border-b-2 border-dashed border-accent/50 text-ink font-medium hover:border-accent", children: term }), open && (_jsx("span", { role: "tooltip", className: "absolute left-1/2 -translate-x-1/2 top-full mt-2 z-20 w-64 rounded-xl bg-ink text-paper text-sm leading-relaxed p-3 shadow-lg normal-case", children: definition }))] }));
}
