import { fileURLToPath } from 'node:url';
import { z, type ZodIssue } from 'zod';
import { canonicalJsonStringify, sha256 } from '../artifact-ref';
import { DiagnosticSchema, type Diagnostic } from '../diagnostic-schema';
import type { Source } from '../project-schema';
import { ingestTopicV1Meta } from '../prompts/ingest-topic.v1.meta';
import { renderPrompt } from '../prompts/render';
import {
  EXTRACTOR_VERSION,
  ResearchBriefSchema,
  type CastSeed,
  type IngestContext,
  type LessonCorpus,
  type ResearchBrief,
  type SourceDigest,
} from './types';

type TopicSource = Extract<Source, { kind: 'topic' }>;

export async function ingestTopic(
  slug: string,
  source: TopicSource,
  ctx: IngestContext,
): Promise<LessonCorpus> {
  const llmClient = ctx.llmClient;
  if (llmClient === undefined) throw new Error('ingestTopic requires ctx.llmClient');

  const promptPath = fileURLToPath(new URL('../prompts/ingest-topic.v1.md', import.meta.url));
  const prompt = renderPrompt(promptPath, { topic: source.topic });
  const result = await llmClient.runJson({
    prompt_template_id: ingestTopicV1Meta.id,
    prompt_template_version: ingestTopicV1Meta.version,
    prompt: prompt.rendered,
    schema: z.unknown(),
    validator: validateResearchBriefCandidate,
    max_retries: 1,
  });
  const parsed = ResearchBriefSchema.parse(result.parsed);
  const digestId = `topic-${sha256(source.topic).slice(0, 16)}`;
  const researchBrief = normalizeResearchBrief(parsed, digestId);
  const sourceDigest: SourceDigest = {
    id: digestId,
    kind: 'section',
    required: true,
    status: 'ok',
    content: {
      title: source.topic,
      text: researchBrief.key_concepts.join('\n'),
      key_points: researchBrief.key_concepts,
      named_entities: researchBrief.named_figures.map((figure) => figure.name),
    },
  };

  return {
    schema_version: 'loa.lesson-corpus.v1',
    slug,
    source_kind: 'topic',
    source_items: [sourceDigest],
    research_brief: researchBrief,
    cast_seed: defaultCastSeed(),
    interactive_inventory: [],
    discovery_inventory: [],
    provenance: {
      ingested_at: ctx.now().toISOString(),
      extractor_version: EXTRACTOR_VERSION,
      source_hash: sha256(canonicalJsonStringify({
        brief: researchBrief,
        prompt_hash: prompt.hash,
        source,
      })),
    },
  };
}

function normalizeResearchBrief(brief: ResearchBrief, digestId: string): ResearchBrief {
  if (brief.source_digest_ids.length > 0) return brief;
  return {
    ...brief,
    source_digest_ids: [digestId],
  };
}

function validateResearchBriefCandidate(candidate: unknown): Diagnostic[] {
  const parsed = ResearchBriefSchema.safeParse(candidate);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => diagnosticFromIssue(issue));
}

function diagnosticFromIssue(issue: ZodIssue): Diagnostic {
  return DiagnosticSchema.parse({
    code: `ingest.topic.schema.${issue.code}`,
    path: issue.path,
    actual: issue.message,
    expected: 'ResearchBrief',
    repair: 'return JSON matching loa.research-brief.v1',
    severity: 'error',
  });
}

function defaultCastSeed(): CastSeed[] {
  return [
    {
      id: 'narrator',
      name: 'Narrator',
      description: 'Default lesson narrator.',
    },
  ];
}
