import { describe, expect, it } from 'vitest';
import { easeIn, easeInOut, easeOut, linear, spring } from './easing';

describe('easing curves', () => {
  it('maps t=0, 0.5, and 1 for each canonical curve', () => {
    expect([linear(0), linear(0.5), linear(1)]).toEqual([0, 0.5, 1]);
    expect([easeIn(0), easeIn(0.5), easeIn(1)]).toEqual([0, 0.25, 1]);
    expect([easeOut(0), easeOut(0.5), easeOut(1)]).toEqual([0, 0.75, 1]);
    expect([easeInOut(0), easeInOut(0.5), easeInOut(1)]).toEqual([0, 0.5, 1]);
    expect([spring(0), spring(0.5), spring(1)]).toEqual([0, 0.5, 1]);
  });
});
