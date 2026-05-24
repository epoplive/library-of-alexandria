import { characterDemoBeatComposer } from './character-demo-beat';
import { interactiveTakeoverComposer } from './interactive-takeover';
import { narrativeShotComposer } from './narrative-shot';
import { narratorOpenerComposer } from './narrator-opener';
import { defineComposerRegistry } from './registry';
import { titleCardComposer } from './title-card';

export const COMPOSERS = defineComposerRegistry([
  titleCardComposer,
  narrativeShotComposer,
  narratorOpenerComposer,
  characterDemoBeatComposer,
  interactiveTakeoverComposer,
]);

export { characterDemoBeatComposer } from './character-demo-beat';
export { interactiveTakeoverComposer } from './interactive-takeover';
export { narrativeShotComposer } from './narrative-shot';
export { narratorOpenerComposer } from './narrator-opener';
export { titleCardComposer } from './title-card';
export * from './helpers';
export * from './registry';
export type * from './types';
