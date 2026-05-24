import { fileURLToPath } from 'node:url';
import { canonicalJsonStringify } from '../artifact-ref';
import type { LlmClient } from '../llm/types';
import type { LessonCorpus, SourceDigest } from '../ingest/types';
import { curriculumV1Meta } from '../prompts/curriculum.v1.meta';
import { renderPrompt } from '../prompts/render';
import { validateCurriculumPlan } from './curriculum-validators';
import { CurriculumPlanSchema, type CurriculumRunResult } from './types';

export interface GenerativeCurriculumArgs {
  corpus: LessonCorpus;
  llm: LlmClient;
  lessonTitle?: string;
}

interface SourceItemSummary {
  id: string;
  kind: SourceDigest['kind'];
  status: SourceDigest['status'];
  title: string;
  excerpt: string;
  key_points: string[];
}

export async function runGenerative(args: GenerativeCurriculumArgs): Promise<CurriculumRunResult> {
  if (args.corpus.research_brief === undefined && args.corpus.script_outline === undefined) {
    throw new Error('curriculum generative path requires research_brief or script_outline');
  }

  const promptPath = fileURLToPath(new URL('../prompts/curriculum.v1.md', import.meta.url));
  const prompt = renderPrompt(promptPath, {
    research_brief: jsonOrNull(args.corpus.research_brief),
    script_outline: jsonOrNull(args.corpus.script_outline),
    source_items_summary: canonicalJsonStringify(sourceItemsSummary(args.corpus.source_items)),
    cast_seed: canonicalJsonStringify(args.corpus.cast_seed),
    interactive_inventory: canonicalJsonStringify(args.corpus.interactive_inventory),
  });

  const result = await args.llm.runJson({
    prompt_template_id: curriculumV1Meta.id,
    prompt_template_version: curriculumV1Meta.version,
    prompt: prompt.rendered,
    schema: CurriculumPlanSchema,
    validator: (candidate) => validateCurriculumPlan({
      ...candidate,
      derivation: 'generative',
    }, { slug: args.corpus.slug }),
    model_hint: 'gpt-5.5',
    max_retries: 2,
  });
  const plan = CurriculumPlanSchema.parse({
    ...result.parsed,
    derivation: 'generative',
  });
  return {
    plan,
    diagnostics: validateCurriculumPlan(plan, { slug: args.corpus.slug }),
  };
}

function jsonOrNull(value: unknown): string {
  if (value === undefined) return 'null';
  return canonicalJsonStringify(value);
}

function sourceItemsSummary(sourceItems: SourceDigest[]): SourceItemSummary[] {
  return sourceItems.map((item) => {
    const content = item.content;
    const title = content === undefined || content.title === undefined ? item.id : content.title;
    const text = content === undefined || content.text === undefined ? '' : content.text;
    const keyPoints = content === undefined || content.key_points === undefined ? [] : content.key_points;
    return {
      id: item.id,
      kind: item.kind,
      status: item.status,
      title,
      excerpt: text.slice(0, 800),
      key_points: keyPoints,
    };
  });
}
