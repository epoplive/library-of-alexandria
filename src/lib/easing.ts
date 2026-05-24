import type { EaseCurve } from './lattice';

export type EasingFunction = (t: number) => number;

export function linear(t: number): number {
  return clamp01(t);
}

export function easeIn(t: number): number {
  const x = clamp01(t);
  return x * x;
}

export function easeOut(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) * (1 - x);
}

export function easeInOut(t: number): number {
  const x = clamp01(t);
  if (x < 0.5) {
    return 2 * x * x;
  }
  return 1 - ((-2 * x + 2) * (-2 * x + 2)) / 2;
}

export function spring(t: number): number {
  // TODO: replace with a proper spring solver when a production needs physical easing.
  return easeInOut(t);
}

export function easingFor(curve: EaseCurve): EasingFunction {
  switch (curve) {
    case 'linear':
      return linear;
    case 'easeIn':
      return easeIn;
    case 'easeOut':
      return easeOut;
    case 'easeInOut':
      return easeInOut;
    case 'spring':
      return spring;
  }
  const exhaustive: never = curve;
  return exhaustive;
}

function clamp01(t: number): number {
  if (t < 0) {
    return 0;
  }
  if (t > 1) {
    return 1;
  }
  return t;
}
