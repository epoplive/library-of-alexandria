import type { CurriculumPlan } from '../curriculum/types';
import type { Diagnostic } from '../diagnostic-schema';
import type { LessonCorpus } from '../ingest/types';
import type { LlmClient } from '../llm/types';
import { runAnalytic } from './analytic';
import { runGenerative } from './generative';
import { runMixed } from './mixed';
import type { SceneMapArtifact } from './types';

export interface RunSceneMapArgs {
  corpus: LessonCorpus;
  curriculum: CurriculumPlan;
  llm?: LlmClient;
}

export interface SceneMapRunResult {
  artifact: SceneMapArtifact;
  diagnostics: Diagnostic[];
}

export async function runSceneMap(args: RunSceneMapArgs): Promise<SceneMapRunResult> {
  switch (args.corpus.source_kind) {
    case 'existing-lesson':
    case 'script':
      return runAnalytic(args);
    case 'topic':
    case 'sources':
      if (args.llm === undefined) throw new Error('scene-map: generative path requires an LlmClient');
      return runGenerative({
        corpus: args.corpus,
        curriculum: args.curriculum,
        llm: args.llm,
      });
    case 'mixed':
      return runMixed(args);
  }
  const exhaustive: never = args.corpus.source_kind;
  throw new Error(`scene-map: unsupported source_kind ${String(exhaustive)}`);
}

export * from './types';
export { runAnalytic } from './analytic';
export { runGenerative } from './generative';
export { runMixed } from './mixed';
export { validateSceneMapArtifact } from './scene-map-validators';
