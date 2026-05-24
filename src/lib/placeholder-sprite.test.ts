import { describe, expect, it } from 'vitest';
import { generatePlaceholderSprite } from './placeholder-sprite';

describe('generatePlaceholderSprite', () => {
  it('produces deterministic output for the same Cast pose', () => {
    const first = generatePlaceholderSprite({ cast_id: 'duck', pose: 'idle' });
    const second = generatePlaceholderSprite({ cast_id: 'duck', pose: 'idle' });

    expect(first.hash).toBe(second.hash);
    expect(first.svg).toBe(second.svg);
    expect(first.data_url).toBe(second.data_url);
  });

  it('produces distinct hashes and colors for different Cast ids', () => {
    const duck = generatePlaceholderSprite({ cast_id: 'duck', pose: 'idle' });
    const narrator = generatePlaceholderSprite({ cast_id: 'narrator', pose: 'idle' });

    expect(duck.hash).not.toBe(narrator.hash);
    expect(primaryFill(duck.svg)).not.toBe(primaryFill(narrator.svg));
  });
});

function primaryFill(svg: string): string {
  const match = svg.match(/<circle cx="128" cy="112" r="82" fill="([^"]+)"/);
  if (match === null) {
    throw new Error('Expected primary circle fill');
  }
  return match[1];
}
