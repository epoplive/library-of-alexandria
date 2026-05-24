import type { CurriculumPlan } from '../curriculum/types';
import type { Diagnostic } from '../diagnostic-schema';
import type { LessonCorpus } from '../ingest/types';
import type { LlmClient } from '../llm/types';
import type { SceneMapArtifact } from '../scene-map/types';
import { runAnalytic } from './analytic';
import { runGenerative } from './generative';
import { runMixed } from './mixed';
import type { Storyboard } from './types';
import type { buildShotTier } from './shot-tier-builder';

export interface RunStoryboardArgs {
  corpus: LessonCorpus;
  curriculum: CurriculumPlan;
  sceneMap: SceneMapArtifact;
  llm?: LlmClient;
}

export interface RunStoryboardResult {
  storyboard: Storyboard;
  shotTierByScene: ReturnType<typeof buildShotTier>;
  diagnostics: Diagnostic[];
}

export async function runStoryboard(args: RunStoryboardArgs): Promise<RunStoryboardResult> {
  switch (args.corpus.source_kind) {
    case 'existing-lesson':
    case 'script':
      return runAnalytic(args);
    case 'topic':
    case 'sources':
      if (args.llm === undefined) throw new Error('storyboard: generative path requires an LlmClient');
      return runGenerative({
        corpus: args.corpus,
        curriculum: args.curriculum,
        sceneMap: args.sceneMap,
        llm: args.llm,
      });
    case 'mixed':
      return runMixed(args);
  }
  const exhaustive: never = args.corpus.source_kind;
  throw new Error(`storyboard: unsupported source_kind ${String(exhaustive)}`);
}

export * from './types';
export { runAnalytic } from './analytic';
export { runGenerative } from './generative';
export { runMixed } from './mixed';
export { buildShotTier } from './shot-tier-builder';
export { validateStoryboard } from './storyboard-validators';
