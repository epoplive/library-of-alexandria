import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
export function Reveal({ label = 'Show answer', children }) {
    const [open, setOpen] = useState(false);
    return (_jsxs("div", { className: "my-4", children: [!open && (_jsxs("button", { onClick: () => setOpen(true), className: "font-mono text-xs uppercase tracking-[0.18em] text-accent hover:text-accent-hover", children: [label, " \u2192"] })), _jsx(AnimatePresence, { children: open && (_jsx(motion.div, { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: 'auto' }, exit: { opacity: 0, height: 0 }, className: "overflow-hidden", children: _jsx("div", { className: "rounded-xl bg-paper-tint p-4", children: children }) })) })] }));
}
