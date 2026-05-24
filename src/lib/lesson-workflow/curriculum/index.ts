import type { LlmClient } from '../llm/types';
import type { LessonCorpus } from '../ingest/types';
import { runAnalytic } from './analytic';
import { runGenerative } from './generative';
import { runMixed } from './mixed';
import type { CurriculumRunResult } from './types';

export interface RunCurriculumArgs {
  corpus: LessonCorpus;
  llm?: LlmClient;
  lessonTitle?: string;
}

export async function runCurriculum(args: RunCurriculumArgs): Promise<CurriculumRunResult> {
  if (args.corpus.source_kind === 'existing-lesson' || args.corpus.source_kind === 'script') {
    return runAnalytic(args);
  }
  if (args.corpus.source_kind === 'topic' || args.corpus.source_kind === 'sources') {
    if (args.llm === undefined) {
      throw new Error('curriculum: generative path requires an LlmClient');
    }
    return runGenerative({
      corpus: args.corpus,
      llm: args.llm,
      lessonTitle: args.lessonTitle,
    });
  }
  if (args.corpus.source_kind === 'mixed') {
    return runMixed(args);
  }
  const exhaustive: never = args.corpus.source_kind;
  throw new Error(`curriculum: unsupported source_kind ${String(exhaustive)}`);
}

export * from './types';
export { runAnalytic } from './analytic';
export { runGenerative } from './generative';
export { runMixed } from './mixed';
export { validateCurriculumPlan } from './curriculum-validators';
