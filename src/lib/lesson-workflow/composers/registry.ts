import type {
  ShotComposer,
  ShotPlan,
  ShotPlanKind,
} from './types';

export function defineComposerRegistry<const C extends readonly ShotComposer[]>(
  composers: C,
): C {
  assertUniqueKinds(composers);
  return composers;
}

export function getComposer(
  registry: readonly ShotComposer[],
  kind: ShotPlanKind,
): ShotComposer<ShotPlan> | undefined {
  for (const composer of registry) {
    if (composer.kind === kind) {
      return composer;
    }
  }
  return undefined;
}

export function listComposers(
  registry: readonly ShotComposer[],
): ShotComposer<ShotPlan>[] {
  return [...registry];
}

function assertUniqueKinds(registry: readonly ShotComposer[]): void {
  const seen = new Set<ShotPlanKind>();
  for (const composer of registry) {
    if (seen.has(composer.kind)) {
      throw new Error(`composer kind "${composer.kind}" registered more than once`);
    }
    seen.add(composer.kind);
  }
}
