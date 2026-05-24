import { canonicalJsonStringify, sha256 } from '../artifact-ref';
import type { Source } from '../project-schema';
import { ingestExistingLesson } from './existing-lesson';
import { ingestScript } from './script';
import { ingestSources } from './sources';
import { ingestTopic } from './topic';
import {
  EXTRACTOR_VERSION,
  type AudioIndexSnapshot,
  type CastSeed,
  type DiscoverySeed,
  type ExistingSection,
  type IngestContext,
  type InteractiveRef,
  type LessonCorpus,
  type ResearchBrief,
  type ScriptOutline,
  type SourceDigest,
} from './types';

type ProjectMixedSource = Extract<Source, { kind: 'mixed' }>;

export type MixedSourceInput = ProjectMixedSource;

export async function ingestMixed(
  slug: string,
  source: MixedSourceInput,
  ctx: IngestContext,
): Promise<LessonCorpus> {
  const corpora: LessonCorpus[] = [];
  for (const child of source.inputs) {
    switch (child.kind) {
      case 'existing-lesson':
        corpora.push(await ingestExistingLesson(slug, child, ctx));
        break;
      case 'topic':
        corpora.push(await ingestTopic(slug, child, ctx));
        break;
      case 'sources':
        corpora.push(await ingestSources(slug, child, ctx));
        break;
      case 'script':
        corpora.push(await ingestScript(slug, child, ctx));
        break;
      case 'mixed':
        corpora.push(await ingestMixed(slug, child, ctx));
        break;
    }
  }

  const sourceItems = corpora.flatMap((corpus) => corpus.source_items);
  const existingSections = corpora.flatMap((corpus) => {
    if (corpus.existing_sections === undefined) return [];
    return corpus.existing_sections;
  });
  const scriptOutline = mergeScriptOutlines(corpora);
  const researchBrief = mergeResearchBriefs(slug, corpora);
  const audioIndex = firstAudioIndex(corpora);

  const corpus: LessonCorpus = {
    schema_version: 'loa.lesson-corpus.v1',
    slug,
    source_kind: 'mixed',
    source_items: sourceItems,
    cast_seed: uniqueCastSeeds(corpora.flatMap((entry) => entry.cast_seed)),
    interactive_inventory: uniqueInteractiveRefs(corpora.flatMap((entry) => entry.interactive_inventory)),
    discovery_inventory: uniqueDiscoverySeeds(corpora.flatMap((entry) => entry.discovery_inventory)),
    provenance: {
      ingested_at: ctx.now().toISOString(),
      extractor_version: EXTRACTOR_VERSION,
      source_hash: sha256(canonicalJsonStringify({
        child_hashes: corpora.map((entry) => entry.provenance.source_hash),
        source,
      })),
    },
  };

  if (existingSections.length > 0) corpus.existing_sections = existingSections;
  if (researchBrief !== undefined) corpus.research_brief = researchBrief;
  if (scriptOutline !== undefined) corpus.script_outline = scriptOutline;
  if (audioIndex !== undefined) corpus.audio_index = audioIndex;
  return corpus;
}

function mergeResearchBriefs(slug: string, corpora: LessonCorpus[]): ResearchBrief | undefined {
  const briefs = corpora.flatMap((corpus) => {
    if (corpus.research_brief === undefined) return [];
    return [corpus.research_brief];
  });
  if (briefs.length === 0) return undefined;
  if (briefs.length === 1) return briefs[0];
  return {
    topic: slug,
    key_concepts: uniqueStrings(briefs.flatMap((brief) => brief.key_concepts)),
    named_figures: uniqueByName(briefs.flatMap((brief) => brief.named_figures)),
    papers: uniquePapers(briefs.flatMap((brief) => brief.papers)),
    adjacent_stories: uniqueStrings(briefs.flatMap((brief) => {
      if (brief.adjacent_stories === undefined) return [];
      return brief.adjacent_stories;
    })),
    source_digest_ids: uniqueStrings(briefs.flatMap((brief) => brief.source_digest_ids)),
  };
}

function mergeScriptOutlines(corpora: LessonCorpus[]): ScriptOutline | undefined {
  const outlines = corpora.flatMap((corpus) => {
    if (corpus.script_outline === undefined) return [];
    return [corpus.script_outline];
  });
  if (outlines.length === 0) return undefined;
  const passages = outlines.flatMap((outline) => outline.passages);
  const total = outlines.reduce((sum, outline) => {
    if (outline.total_runtime_estimate_s === undefined) return sum;
    return sum + outline.total_runtime_estimate_s;
  }, 0);
  if (total === 0) return { passages };
  return {
    total_runtime_estimate_s: total,
    passages,
  };
}

function firstAudioIndex(corpora: LessonCorpus[]): AudioIndexSnapshot | undefined {
  for (const corpus of corpora) {
    if (corpus.audio_index !== undefined) return corpus.audio_index;
  }
  return undefined;
}

function uniqueCastSeeds(castSeeds: CastSeed[]): CastSeed[] {
  const seen = new Set<string>();
  const out: CastSeed[] = [];
  for (const castSeed of castSeeds) {
    if (seen.has(castSeed.id)) continue;
    seen.add(castSeed.id);
    out.push(castSeed);
  }
  return out;
}

function uniqueInteractiveRefs(refs: InteractiveRef[]): InteractiveRef[] {
  const seen = new Set<string>();
  const out: InteractiveRef[] = [];
  for (const ref of refs) {
    if (seen.has(ref.component_id)) continue;
    seen.add(ref.component_id);
    out.push(ref);
  }
  return out;
}

function uniqueDiscoverySeeds(discoveries: DiscoverySeed[]): DiscoverySeed[] {
  const seen = new Set<string>();
  const out: DiscoverySeed[] = [];
  for (const discovery of discoveries) {
    if (seen.has(discovery.key)) continue;
    seen.add(discovery.key);
    out.push(discovery);
  }
  return out;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function uniqueByName(values: ResearchBrief['named_figures']): ResearchBrief['named_figures'] {
  const seen = new Set<string>();
  const out: ResearchBrief['named_figures'] = [];
  for (const value of values) {
    if (seen.has(value.name)) continue;
    seen.add(value.name);
    out.push(value);
  }
  return out;
}

function uniquePapers(values: ResearchBrief['papers']): ResearchBrief['papers'] {
  const seen = new Set<string>();
  const out: ResearchBrief['papers'] = [];
  for (const value of values) {
    if (seen.has(value.title)) continue;
    seen.add(value.title);
    out.push(value);
  }
  return out;
}
