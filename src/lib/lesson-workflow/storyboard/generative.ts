import { fileURLToPath } from 'node:url';
import { canonicalJsonStringify } from '../artifact-ref';
import type { CurriculumPlan } from '../curriculum/types';
import type { LessonCorpus, SourceDigest } from '../ingest/types';
import type { LlmClient } from '../llm/types';
import { storyboardV1Meta } from '../prompts/storyboard.v1.meta';
import { renderPrompt } from '../prompts/render';
import type { SceneMapArtifact } from '../scene-map/types';
import { buildShotTier } from './shot-tier-builder';
import { validateStoryboard } from './storyboard-validators';
import { StoryboardSchema, type Storyboard } from './types';
import type { StoryboardRunResult } from './analytic';

export interface GenerativeStoryboardArgs {
  corpus: LessonCorpus;
  curriculum: CurriculumPlan;
  sceneMap: SceneMapArtifact;
  llm: LlmClient;
}

interface SourceItemSummary {
  id: string;
  kind: SourceDigest['kind'];
  status: SourceDigest['status'];
  title: string;
  excerpt: string;
  key_points: string[];
}

export async function runGenerative(args: GenerativeStoryboardArgs): Promise<StoryboardRunResult> {
  const promptPath = fileURLToPath(new URL('../prompts/storyboard.v1.md', import.meta.url));
  const prompt = renderPrompt(promptPath, {
    curriculum_plan: canonicalJsonStringify(args.curriculum),
    scene_map: canonicalJsonStringify(args.sceneMap),
    research_brief: jsonOrNull(args.corpus.research_brief),
    script_outline: jsonOrNull(args.corpus.script_outline),
    cast_seed: canonicalJsonStringify(args.corpus.cast_seed),
    interactive_inventory: canonicalJsonStringify(args.corpus.interactive_inventory),
    source_items_summary: canonicalJsonStringify(sourceItemsSummary(args.corpus.source_items)),
  });

  const result = await args.llm.runJson({
    prompt_template_id: storyboardV1Meta.id,
    prompt_template_version: storyboardV1Meta.version,
    prompt: prompt.rendered,
    schema: StoryboardSchema,
    validator: (candidate) => validateStoryboard(StoryboardSchema.parse(candidate), {
      corpus: args.corpus,
      sceneMap: args.sceneMap,
    }),
    model_hint: 'gpt-5.5',
    max_retries: 2,
  });
  const storyboard: Storyboard = StoryboardSchema.parse(result.parsed);
  const shotTierByScene = buildShotTier(storyboard.plans);
  return {
    storyboard,
    shotTierByScene,
    diagnostics: validateStoryboard(storyboard, {
      corpus: args.corpus,
      sceneMap: args.sceneMap,
    }),
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
      excerpt: text.slice(0, 1000),
      key_points: keyPoints,
    };
  });
}
