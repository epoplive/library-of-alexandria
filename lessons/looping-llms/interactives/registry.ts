import {
  defineInteractivesRegistry,
  type InteractiveRegistryEntry,
  type InteractivesRegistry,
} from '@/lib/interactives';
import { BuildYourTransformerGame } from '../games/BuildYourTransformerGame';
import { BuildYourTransformerGameContract } from '../games/BuildYourTransformerGame.contract';

const entries = defineInteractivesRegistry({
  BuildYourTransformerGame: {
    component: BuildYourTransformerGame,
    contract: BuildYourTransformerGameContract,
  },
});

interface RegistryAccessors {
  readonly size: number;
  readonly complete: boolean;
  has(componentId: string): boolean;
  get(componentId: string): InteractiveRegistryEntry | undefined;
}

// Phase 1C is filling this registry one Section at a time. While complete is
// false, the validators emit `warning` severity for components not yet
// registered (the lesson hasn't claimed full coverage). When all 12 looping-llms
// games are wired and we approach Phase 1D default swap, flip this to true.
const REGISTRY_COMPLETE = false;

function withAccessors<R extends InteractivesRegistry>(
  registryEntries: R,
  complete: boolean,
): R & InteractivesRegistry & RegistryAccessors {
  const registry = registryEntries as R & InteractivesRegistry & RegistryAccessors;
  Object.defineProperty(registry, 'size', {
    enumerable: false,
    value: Object.keys(registryEntries).length,
  });
  Object.defineProperty(registry, 'complete', {
    enumerable: false,
    value: complete,
  });
  Object.defineProperty(registry, 'has', {
    enumerable: false,
    value(componentId: string): boolean {
      return Object.prototype.hasOwnProperty.call(registryEntries, componentId);
    },
  });
  Object.defineProperty(registry, 'get', {
    enumerable: false,
    value(componentId: string): InteractiveRegistryEntry | undefined {
      if (Object.prototype.hasOwnProperty.call(registryEntries, componentId)) {
        return registryEntries[componentId];
      }
      return undefined;
    },
  });
  return registry;
}

export const INTERACTIVES_REGISTRY = withAccessors(entries, REGISTRY_COMPLETE);
