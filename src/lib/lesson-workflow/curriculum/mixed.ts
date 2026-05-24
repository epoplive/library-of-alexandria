import type { LlmClient } from '../llm/types';
import type { LessonCorpus } from '../ingest/types';
import { runAnalytic } from './analytic';
import { runGenerative } from './generative';
import { validateCurriculumPlan } from './curriculum-validators';
import { CurriculumPlanSchema, type ActPlan, type CurriculumRunResult } from './types';

export interface MixedCurriculumArgs {
  corpus: LessonCorpus;
  llm?: LlmClient;
  lessonTitle?: string;
}

export async function runMixed(args: MixedCurriculumArgs): Promise<CurriculumRunResult> {
  const acts: ActPlan[] = [];
  let derivation: 'analytic' | 'generative' = 'analytic';
  let discoverySeeds = args.corpus.discovery_inventory;

  if (args.corpus.existing_sections !== undefined && args.corpus.existing_sections.length > 0) {
    const analytic = await runAnalytic({
      corpus: args.corpus,
      lessonTitle: args.lessonTitle,
    });
    acts.push(...analytic.plan.acts);
    discoverySeeds = analytic.plan.discovery_seed_plan;
  }

  if (hasGenerativeInputs(args.corpus)) {
    if (args.llm === undefined) throw new Error('curriculum: mixed generative path requires an LlmClient');
    const generative = await runGenerative({
      corpus: args.corpus,
      llm: args.llm,
      lessonTitle: args.lessonTitle,
    });
    acts.push(...generative.plan.acts);
    discoverySeeds = uniqueDiscoverySeeds([
      ...discoverySeeds,
      ...generative.plan.discovery_seed_plan,
    ]);
    derivation = 'generative';
  }

  if (acts.length === 0) throw new Error('curriculum: mixed corpus has no analytic or generative inputs');

  const notes = derivation === 'generative'
    ? 'Merged analytic existing-lesson acts before generated acts.'
    : undefined;
  const basePlan = {
    schema_version: 'loa.curriculum.v1',
    acts,
    estimated_total_runtime_s: totalRuntime(acts),
    discovery_seed_plan: discoverySeeds,
    derivation,
  };
  const plan = notes === undefined
    ? CurriculumPlanSchema.parse(basePlan)
    : CurriculumPlanSchema.parse({
      ...basePlan,
      notes,
    });
  return {
    plan,
    diagnostics: validateCurriculumPlan(plan, { slug: args.corpus.slug }),
  };
}

function hasGenerativeInputs(corpus: LessonCorpus): boolean {
  if (corpus.research_brief !== undefined) return true;
  if (corpus.script_outline !== undefined) return true;
  return false;
}

function totalRuntime(acts: ActPlan[]): number {
  return acts.reduce((actSum, act) => actSum + act.scenes.reduce((sceneSum, scene) => sceneSum + scene.estimated_runtime_s, 0), 0);
}

function uniqueDiscoverySeeds(discoverySeeds: LessonCorpus['discovery_inventory']): LessonCorpus['discovery_inventory'] {
  const seen = new Set<string>();
  const out: LessonCorpus['discovery_inventory'] = [];
  for (const seed of discoverySeeds) {
    if (seen.has(seed.key)) continue;
    seen.add(seed.key);
    out.push(seed);
  }
  return out;
}
