import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import mermaid from 'mermaid';
mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'loose',
    fontFamily: 'Inter, system-ui, sans-serif',
});
let counter = 0;
export function Diagram({ chart, caption }) {
    const [svg, setSvg] = useState('');
    useEffect(() => {
        const id = `mermaid-${++counter}`;
        let cancelled = false;
        mermaid
            .render(id, chart)
            .then((res) => {
            if (!cancelled)
                setSvg(res.svg);
        })
            .catch((e) => {
            console.error(e);
            if (!cancelled) {
                setSvg(`<pre class="text-signal-bad font-mono text-sm whitespace-pre-wrap">${String(e)}</pre>`);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [chart]);
    return (_jsxs("figure", { className: "my-6", children: [_jsx("div", { className: "rounded-2xl bg-paper-card border border-ink-subtle/15 p-6 flex justify-center [&_svg]:max-w-full [&_svg]:h-auto", dangerouslySetInnerHTML: { __html: svg } }), caption && (_jsx("figcaption", { className: "mt-2 text-center text-sm text-ink-muted", children: caption }))] }));
}
