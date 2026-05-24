import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJsonStringify, sha256 } from '../artifact-ref';
import { paths } from '../project-fs';
import type { Source } from '../project-schema';
import {
  EXTRACTOR_VERSION,
  type CastSeed,
  type IngestContext,
  type LessonCorpus,
  type ScriptOutline,
  type SourceDigest,
} from './types';

type ScriptSource = Extract<Source, { kind: 'script' }>;

interface ParsedPassage {
  text: string;
  heading: boolean;
}

export async function ingestScript(
  slug: string,
  source: ScriptSource,
  ctx: IngestContext,
): Promise<LessonCorpus> {
  const scriptPath = path.isAbsolute(source.script_path)
    ? source.script_path
    : path.join(paths(slug).lessonDir, source.script_path);
  const raw = await readFile(scriptPath, 'utf8');
  const passages = parseScriptPassages(raw);
  const outline = outlineFromPassages(passages);
  const sourceItems = outline.passages.map<SourceDigest>((passage) => ({
    id: passage.id,
    kind: 'script-passage',
    required: true,
    status: 'ok',
    content: {
      text: passage.text,
    },
  }));

  return {
    schema_version: 'loa.lesson-corpus.v1',
    slug,
    source_kind: 'script',
    source_items: sourceItems,
    script_outline: outline,
    cast_seed: defaultCastSeed(),
    interactive_inventory: [],
    discovery_inventory: [],
    provenance: {
      ingested_at: ctx.now().toISOString(),
      extractor_version: EXTRACTOR_VERSION,
      source_hash: sha256(canonicalJsonStringify({
        script: sha256(raw),
        source,
      })),
    },
  };
}

function parseScriptPassages(raw: string): ParsedPassage[] {
  const passages: ParsedPassage[] = [];
  let pending: string[] = [];

  function flushPending(): void {
    if (pending.length === 0) return;
    passages.push({
      text: pending.join(' ').replace(/\s+/g, ' ').trim(),
      heading: false,
    });
    pending = [];
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      flushPending();
      continue;
    }
    if (trimmed.startsWith('#')) {
      flushPending();
      passages.push({
        text: trimmed.replace(/^#+\s*/, '').trim(),
        heading: true,
      });
      continue;
    }
    pending.push(trimmed);
  }
  flushPending();
  return passages.filter((passage) => passage.text.length > 0);
}

function outlineFromPassages(parsedPassages: ParsedPassage[]): ScriptOutline {
  const passages = parsedPassages.map((passage, index) => ({
    id: `script-${index + 1}-${sha256(passage.text).slice(0, 12)}`,
    text: passage.text,
    intent: intentForPassage(passage, index, parsedPassages.length),
  }));
  const totalWords = passages.reduce((sum, passage) => sum + passage.text.split(/\s+/).length, 0);
  return {
    total_runtime_estimate_s: Math.round(totalWords / 2.7),
    passages,
  };
}

function intentForPassage(
  passage: ParsedPassage,
  index: number,
  total: number,
): ScriptOutline['passages'][number]['intent'] {
  const lower = passage.text.toLowerCase();
  if (passage.heading && index === 0) return 'opener';
  if (passage.heading && index === total - 1) return 'closer';
  if (lower.startsWith('aside:')) return 'aside';
  if (lower.startsWith('demo:')) return 'demo';
  if (lower.startsWith('closer:')) return 'closer';
  if (lower.startsWith('opener:')) return 'opener';
  return 'explanation';
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
