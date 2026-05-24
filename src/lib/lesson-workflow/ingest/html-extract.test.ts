import { describe, expect, it } from 'vitest';
import { extractHtmlDocument } from './html-extract';

describe('extractHtmlDocument', () => {
  it('extracts title and main text while dropping chrome', () => {
    const result = extractHtmlDocument(`
      <html>
        <head><title>Looped &amp; Shared</title><script>bad()</script></head>
        <body>
          <nav>navigation</nav>
          <main>
            <h1>Depth by repetition</h1>
            <p>Use one block &amp; run it again.</p>
          </main>
          <footer>footer</footer>
        </body>
      </html>
    `);

    expect(result).toEqual({
      title: 'Looped & Shared',
      text: 'Depth by repetition\nUse one block & run it again.',
    });
  });

  it('falls back to body content', () => {
    const result = extractHtmlDocument('<body><p>First.</p><p>Second&nbsp;line.</p></body>');

    expect(result.text).toBe('First.\nSecond line.');
  });
});
