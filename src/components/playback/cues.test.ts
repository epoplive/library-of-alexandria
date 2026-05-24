import { describe, expect, it } from 'vitest';
import type { Element, Shot } from '@/lib/lattice';
import { resolveShotState, validateCues } from './cues';

const card: Element = {
  id: 'card',
  kind: 'shape',
  shape: 'rect',
  initial_layout: {
    position: [0.5, 0.5, 0],
    rotation: [0, 0, 0],
    scale: 1,
    opacity: 1,
  },
};

describe('resolveShotState', () => {
  it('lerps transform Cues with duration_ms and easeOut', () => {
    const cues: Shot['cues'] = [{
      id: 'grow',
      kind: 'transform',
      element_id: 'card',
      at: 0,
      layout: { scale: 2, opacity: 0 },
      transition: { duration_ms: 600, ease: 'easeOut' },
    }];

    const atStart = resolveShotState([card], cues, 0).elements.card.layout;
    expect(atStart.scale).toBe(1);
    expect(atStart.opacity).toBe(1);

    const midway = resolveShotState([card], cues, 0.3).elements.card.layout;
    expect(midway.scale).toBeCloseTo(1.75);
    expect(midway.opacity).toBeCloseTo(0.25);

    const atEnd = resolveShotState([card], cues, 0.6).elements.card.layout;
    expect(atEnd.scale).toBe(2);
    expect(atEnd.opacity).toBe(0);
  });
});

describe('validateCues', () => {
  it('reports overlapping same-field Cues on the same Element', () => {
    const shot: Shot = {
      id: 'a',
      duration: 1,
      elements: [card],
      cues: [
        {
          id: 'fade-a',
          kind: 'transform',
          element_id: 'card',
          at: 0,
          layout: { opacity: 0.4 },
          transition: { duration_ms: 600, ease: 'linear' },
        },
        {
          id: 'fade-b',
          kind: 'transform',
          element_id: 'card',
          at: 0.3,
          layout: { opacity: 1 },
          transition: { duration_ms: 600, ease: 'linear' },
        },
      ],
    };

    expect(validateCues(shot)).toEqual([{
      code: 'cue.field.overlap',
      path: ['cues', 0],
      actual: ['fade-a', 'fade-b'],
      expected: 'none',
      repair: "either remove one of the overlapping cues or set `composition: 'additive'` on both.",
      severity: 'error',
    }]);
  });

  it('allows overlapping Cues that target different fields', () => {
    const shot: Shot = {
      id: 'a',
      duration: 1,
      elements: [card],
      cues: [
        {
          id: 'scale',
          kind: 'transform',
          element_id: 'card',
          at: 0,
          layout: { scale: 1.2 },
          transition: { duration_ms: 600, ease: 'linear' },
        },
        {
          id: 'fade',
          kind: 'transform',
          element_id: 'card',
          at: 0.3,
          layout: { opacity: 0.5 },
          transition: { duration_ms: 600, ease: 'linear' },
        },
      ],
    };

    expect(validateCues(shot)).toEqual([]);
  });

  it('accepts additive overlaps for now', () => {
    const shot: Shot = {
      id: 'a',
      duration: 1,
      elements: [card],
      cues: [
        {
          id: 'add-a',
          kind: 'transform',
          element_id: 'card',
          at: 0,
          layout: { opacity: 0.4 },
          transition: { duration_ms: 600, ease: 'linear' },
          composition: 'additive',
        },
        {
          id: 'add-b',
          kind: 'transform',
          element_id: 'card',
          at: 0.3,
          layout: { opacity: 1 },
          transition: { duration_ms: 600, ease: 'linear' },
          composition: 'additive',
        },
      ],
    };

    expect(validateCues(shot)).toEqual([]);
  });
});
