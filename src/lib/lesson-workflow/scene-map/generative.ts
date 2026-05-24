import { fileURLToPath } from 'node:url';
import { canonicalJsonStringify } from '../artifact-ref';
import type { CurriculumPlan } from '../curriculum/types';
import type { LessonCorpus, SourceDigest } from '../ingest/types';
import type { LlmClient } from '../llm/types';
import { sceneMapV1Meta } from '../prompts/scene-map.v1.meta';
import { renderPrompt } from '../prompts/render';
import { validateSceneMapArtifact } from './scene-map-validators';
import { SceneMapArtifactSchema } from './types';
import type { SceneMapRunResult } from './analytic';

export interface GenerativeSceneMapArgs {
  corpus: LessonCorpus;
  curriculum: CurriculumPlan;
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

export async function runGenerative(args: GenerativeSceneMapArgs): Promise<SceneMapRunResult> {
  const promptPath = fileURLToPath(new URL('../prompts/scene-map.v1.md', import.meta.url));
  const prompt = renderPrompt(promptPath, {
    curriculum_plan: canonicalJsonStringify(args.curriculum),
    research_brief: jsonOrNull(args.corpus.research_brief),
    script_outline: jsonOrNull(args.corpus.script_outline),
    cast_seed: canonicalJsonStringify(args.corpus.cast_seed),
    interactive_inventory: canonicalJsonStringify(args.corpus.interactive_inventory),
    source_items_summary: canonicalJsonStringify(sourceItemsSummary(args.corpus.source_items)),
  });

  const result = await args.llm.runJson({
    prompt_template_id: sceneMapV1Meta.id,
    prompt_template_version: sceneMapV1Meta.version,
    prompt: prompt.rendered,
    schema: SceneMapArtifactSchema,
    validator: (candidate) => validateSceneMapArtifact(SceneMapArtifactSchema.parse(candidate), { corpus: args.corpus }),
    model_hint: 'gpt-5.5',
    max_retries: 2,
  });
  const artifact = SceneMapArtifactSchema.parse(result.parsed);
  return {
    artifact,
    diagnostics: validateSceneMapArtifact(artifact, { corpus: args.corpus }),
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
