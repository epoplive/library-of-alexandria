import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from 'react';
import katex from 'katex';
export function Math({ expr, display = false }) {
    const html = useMemo(() => katex.renderToString(expr, {
        displayMode: display,
        throwOnError: false,
        strict: 'ignore',
    }), [expr, display]);
    return display ? (_jsx("div", { className: "block my-5 text-center [&_.katex-display]:my-0", dangerouslySetInnerHTML: { __html: html } })) : (_jsx("span", { className: "inline", dangerouslySetInnerHTML: { __html: html } }));
}
