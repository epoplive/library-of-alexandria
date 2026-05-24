import { INTERACTIVES_REGISTRY as LOOPING_LLMS_INTERACTIVES_REGISTRY } from '../../../../lessons/looping-llms/interactives/registry';
import { DiagnosticSchema, type Diagnostic } from '../diagnostic-schema';
import type { CurriculumPlan } from './types';

interface InteractiveRegistryLookup {
  size: number;
  has: (componentId: string) => boolean;
}

const MIN_RUNTIME_S = 12 * 60;
const MAX_RUNTIME_S = 60 * 60;

const INTERACTIVE_REGISTRIES: Array<{
  slug: string;
  registry: InteractiveRegistryLookup;
}> = [
  {
    slug: 'looping-llms',
    registry: LOOPING_LLMS_INTERACTIVES_REGISTRY,
  },
];

export function validateCurriculumPlan(plan: CurriculumPlan, ctx: { slug: string }): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const sourceSectionIds = new Set<string>();
  const sourceDigestIds = new Set<string>();
  const interactiveRegistry = interactiveRegistryForSlug(ctx.slug);

  plan.acts.forEach((act, actIndex) => {
    act.scenes.forEach((scene, sceneIndex) => {
      if (scene.source_section_id !== undefined) sourceSectionIds.add(scene.source_section_id);
      if (scene.source_digest_ids !== undefined) {
        for (const digestId of scene.source_digest_ids) sourceDigestIds.add(digestId);
      }

      if (scene.learning_objective.trim().length === 0) {
        diagnostics.push(diagnostic({
          code: 'curriculum.scene.missing_objective',
          path: ['acts', actIndex, 'scenes', sceneIndex, 'learning_objective'],
          actual: scene.learning_objective,
          expected: 'non-empty learner-facing objective',
          repair: 'write a specific objective for this scene',
          severity: 'error',
        }));
      }

      if (scene.game_component_id !== undefined && !gameComponentResolves(interactiveRegistry, scene.game_component_id)) {
        diagnostics.push(diagnostic({
          code: 'curriculum.game.unknown_component',
          path: ['acts', actIndex, 'scenes', sceneIndex, 'game_component_id'],
          actual: scene.game_component_id,
          expected: `registered component id for lessons/${ctx.slug}`,
          repair: 'register the component or remove game_component_id from this scene',
          severity: 'warning',
        }));
      }
    });
  });

  if (plan.estimated_total_runtime_s < MIN_RUNTIME_S || plan.estimated_total_runtime_s > MAX_RUNTIME_S) {
    diagnostics.push(diagnostic({
      code: 'curriculum.runtime.out_of_range',
      path: ['estimated_total_runtime_s'],
      actual: plan.estimated_total_runtime_s,
      expected: `[${MIN_RUNTIME_S}, ${MAX_RUNTIME_S}] seconds`,
      repair: 'adjust scene count or runtime estimates for a v0.1 lesson',
      severity: 'error',
    }));
  }

  plan.discovery_seed_plan.forEach((seed, index) => {
    const citedSection = seed.source_section_id.trim().length > 0 && sourceSectionIds.has(seed.source_section_id);
    const citedDigest = sourceDigestIds.has(seed.source_section_id);
    if (!citedSection && !citedDigest) {
      diagnostics.push(diagnostic({
        code: 'curriculum.discovery.uncited',
        path: ['discovery_seed_plan', index],
        actual: {
          key: seed.key,
          source_section_id: seed.source_section_id,
        },
        expected: 'source_section_id or source_digest_id that resolves to a planned scene',
        repair: 'cite the source section or digest that supports this discovery',
        severity: 'error',
      }));
    }
  });

  return diagnostics;
}

function interactiveRegistryForSlug(slug: string): InteractiveRegistryLookup | undefined {
  for (const entry of INTERACTIVE_REGISTRIES) {
    if (entry.slug === slug) return entry.registry;
  }
  return undefined;
}

function gameComponentResolves(registry: InteractiveRegistryLookup | undefined, componentId: string): boolean {
  if (registry === undefined) return false;
  if (registry.size === 0) return false;
  return registry.has(componentId);
}

function diagnostic(args: Diagnostic): Diagnostic {
  return DiagnosticSchema.parse(args);
}
