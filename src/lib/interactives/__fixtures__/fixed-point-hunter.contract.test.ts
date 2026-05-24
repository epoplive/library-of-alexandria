import { describe, expect, it } from 'vitest';
import { fixedPointHunterContract } from './fixed-point-hunter.contract';

describe('fixedPointHunterContract', () => {
  it('parses sample valid arguments for every imperative method', () => {
    expect(fixedPointHunterContract.methods.setLevel.args.parse([1])).toEqual([1]);
    expect(fixedPointHunterContract.methods.setZ0.args.parse([[1.2, -0.4]])).toEqual([[1.2, -0.4]]);
    expect(fixedPointHunterContract.methods.setK.args.parse([12])).toEqual([12]);
    expect(fixedPointHunterContract.methods.setFunction.args.parse(['strong'])).toEqual(['strong']);
    expect(fixedPointHunterContract.methods.submit.args.parse([])).toEqual([]);
    expect(fixedPointHunterContract.methods.reset.args.parse([])).toEqual([]);
  });

  it('rejects invalid argument tuples', () => {
    expect(fixedPointHunterContract.methods.setLevel.args.safeParse(['1']).success).toBe(false);
    expect(fixedPointHunterContract.methods.setZ0.args.safeParse([[1]]).success).toBe(false);
    expect(fixedPointHunterContract.methods.setFunction.args.safeParse([3]).success).toBe(false);
    expect(fixedPointHunterContract.methods.reset.args.safeParse(['extra']).success).toBe(false);
  });
});
