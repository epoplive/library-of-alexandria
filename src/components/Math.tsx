import { useMemo } from 'react';
import katex from 'katex';

interface MathProps {
  expr: string;
  display?: boolean;
}

export function Math({ expr, display = false }: MathProps) {
  const html = useMemo(
    () =>
      katex.renderToString(expr, {
        displayMode: display,
        throwOnError: false,
        strict: 'ignore',
      }),
    [expr, display],
  );
  return display ? (
    <div
      className="block my-5 text-center [&_.katex-display]:my-0"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  ) : (
    <span className="inline" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
