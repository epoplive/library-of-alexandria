import {
  defineInteractivesRegistry,
  type InteractiveRegistryEntry,
  type InteractivesRegistry,
} from '@/lib/interactives';

const entries = defineInteractivesRegistry({});

interface RegistryAccessors {
  readonly size: number;
  readonly complete: boolean;
  has(componentId: string): boolean;
  get(componentId: string): InteractiveRegistryEntry | undefined;
}

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
