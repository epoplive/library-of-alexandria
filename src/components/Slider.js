import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
export function Slider({ label, min = 0, max = 100, step = 1, defaultValue, unit, onChange, value, }) {
    const isControlled = value !== undefined;
    const [internal, setInternal] = useState(defaultValue ?? min);
    const v = isControlled ? value : internal;
    function update(next) {
        if (!isControlled)
            setInternal(next);
        onChange?.(next);
    }
    return (_jsxs("label", { className: "block my-4", children: [_jsxs("div", { className: "flex items-baseline justify-between mb-2", children: [_jsx("span", { className: "font-mono text-xs uppercase tracking-[0.12em] text-ink-muted", children: label }), _jsxs("span", { className: "font-mono text-sm text-ink tabular-nums", children: [v, unit ? ` ${unit}` : ''] })] }), _jsx("input", { type: "range", min: min, max: max, step: step, value: v, onChange: (e) => update(Number(e.target.value)), className: "w-full accent-accent cursor-pointer" })] }));
}
