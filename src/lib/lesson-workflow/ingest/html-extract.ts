export interface ExtractedHtmlDocument {
  title?: string;
  text: string;
}

export function extractHtmlDocument(html: string): ExtractedHtmlDocument {
  const title = extractTitle(html);
  const cleaned = stripIgnoredBlocks(html);
  const mainContent = firstTagContent(cleaned, 'main');
  const articleContent = mainContent === undefined ? firstTagContent(cleaned, 'article') : mainContent;
  const bodyContent = articleContent === undefined ? firstTagContent(cleaned, 'body') : articleContent;
  const scoped = bodyContent === undefined ? cleaned : bodyContent;
  const text = decodeHtmlEntities(
    scoped
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|main|h[1-6]|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');

  if (title === undefined) return { text };
  return { title, text };
}

function extractTitle(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (match === null) return undefined;
  const title = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return title.length === 0 ? undefined : title;
}

function stripIgnoredBlocks(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|nav|header|footer|aside|svg|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
}

function firstTagContent(html: string, tagName: string): string | undefined {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = pattern.exec(html);
  if (match === null) return undefined;
  return match[1];
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_match, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)));
}
