import type { ComponentType } from 'react';
import type { InteractiveContract } from './define-interactive-contract';

export interface InteractiveRegistryEntry<P = unknown> {
  component: ComponentType<P>;
  contract: InteractiveContract;
}

export interface InteractivesRegistry<P = unknown> {
  [component_id: string]: InteractiveRegistryEntry<P>;
}

export function defineInteractivesRegistry<R extends InteractivesRegistry>(entries: R): R {
  return entries;
}

export function getInteractive<P>(
  registry: InteractivesRegistry<P>,
  component_id: string,
): InteractiveRegistryEntry<P> | undefined {
  return registry[component_id];
}

export function listInteractiveContracts(registry: InteractivesRegistry): InteractiveContract[] {
  const contracts: InteractiveContract[] = [];
  for (const component_id of Object.keys(registry)) {
    contracts.push(registry[component_id].contract);
  }
  return contracts;
}
