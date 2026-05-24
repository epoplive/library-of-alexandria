import type { CastId, PoseName } from './lattice';

export interface PlaceholderSpriteInput {
  cast_id: CastId;
  pose: PoseName;
}

export interface PlaceholderSprite {
  svg: string;
  data_url: string;
  hash: string;
}

export function generatePlaceholderSprite(input: PlaceholderSpriteInput): PlaceholderSprite {
  const hashNumber = fnv1a(`${input.cast_id}:${input.pose}`);
  const hash = hashNumber.toString(16).padStart(8, '0');
  const hue = fnv1a(input.cast_id) % 360;
  const color = `hsl(${hue} 68% 56%)`;
  const castLabel = escapeXml(input.cast_id);
  const poseLabel = escapeXml(input.pose);
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">',
    `<circle cx="128" cy="112" r="82" fill="${color}" fill-opacity="0.92"/>`,
    '<circle cx="96" cy="96" r="12" fill="#ffffff" fill-opacity="0.86"/>',
    '<circle cx="160" cy="96" r="12" fill="#ffffff" fill-opacity="0.86"/>',
    '<path d="M92 138 Q128 164 164 138" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity="0.82"/>',
    `<text x="128" y="218" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="20" font-weight="700" fill="#111827">${castLabel}</text>`,
    `<text x="128" y="240" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" fill="#374151">${poseLabel}</text>`,
    '</svg>',
  ].join('');

  return {
    svg,
    data_url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    hash,
  };
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
