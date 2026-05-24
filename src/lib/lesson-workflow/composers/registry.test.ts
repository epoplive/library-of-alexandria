import { describe, expect, it } from 'vitest';
import { COMPOSERS } from './index';
import { defineComposerRegistry, getComposer, listComposers } from './registry';
import { titleCardComposer } from './title-card';

describe('composer registry', () => {
  it('looks up a composer by kind', () => {
    expect(getComposer(COMPOSERS, 'title-card')).toBe(titleCardComposer);
  });

  it('enumerates the explicit barrel registry', () => {
    expect(listComposers(COMPOSERS).map((composer) => composer.kind)).toEqual([
      'title-card',
      'narrative',
      'narrator-opener',
      'character-demo-beat',
      'interactive-takeover',
    ]);
  });

  it('returns undefined when a registry omits the requested kind', () => {
    const registry = defineComposerRegistry([]);

    expect(getComposer(registry, 'title-card')).toBeUndefined();
  });

  it('rejects duplicate kinds at definition time', () => {
    expect(() => defineComposerRegistry([
      titleCardComposer,
      titleCardComposer,
    ])).toThrow('composer kind "title-card" registered more than once');
  });
});
