import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJsonStringify, sha256 } from '../artifact-ref';
import type { Source } from '../project-schema';
import { paths } from '../project-fs';
import { extractHtmlDocument } from './html-extract';
import {
  EXTRACTOR_VERSION,
  type CastSeed,
  type IngestContext,
  type LessonCorpus,
  type ResearchBrief,
  type SourceDigest,
} from './types';

type ProjectSourcesSource = Extract<Source, { kind: 'sources' }>;
type ProjectSourceRef = NonNullable<ProjectSourcesSource['source_refs']>[number];
type SourceMediaType = 'text/markdown' | 'text/plain' | 'application/pdf' | 'text/html' | 'application/json';

export interface SourceRefInput extends ProjectSourceRef {
  required?: boolean;
}

export interface SourcesSourceInput {
  kind: 'sources';
  source_refs?: SourceRefInput[];
  urls?: string[];
  papers?: string[];
  transcripts?: string[];
}

const MAX_SOURCE_BYTES = 2_000_000;

export async function ingestSources(
  slug: string,
  source: SourcesSourceInput,
  ctx: IngestContext,
): Promise<LessonCorpus> {
  const sourceRefs = sourceRefsFromInput(source);
  const sourceItems: SourceDigest[] = [];
  for (let index = 0; index < sourceRefs.length; index += 1) {
    const ref = sourceRefs[index];
    sourceItems.push(await ingestOneSource(slug, ref, index, ctx));
  }
  const researchBrief = researchBriefFromSourceItems(slug, sourceItems);

  return {
    schema_version: 'loa.lesson-corpus.v1',
    slug,
    source_kind: 'sources',
    source_items: sourceItems,
    research_brief: researchBrief,
    cast_seed: defaultCastSeed(),
    interactive_inventory: [],
    discovery_inventory: [],
    provenance: {
      ingested_at: ctx.now().toISOString(),
      extractor_version: EXTRACTOR_VERSION,
      source_hash: sha256(canonicalJsonStringify({
        source,
        source_items: sourceItems,
      })),
    },
  };
}

function sourceRefsFromInput(source: SourcesSourceInput): SourceRefInput[] {
  const refs: SourceRefInput[] = [];
  if (source.source_refs !== undefined) {
    refs.push(...source.source_refs);
  }
  if (source.urls !== undefined) {
    refs.push(...source.urls.map((url) => ({ path: url })));
  }
  if (source.papers !== undefined) {
    refs.push(...source.papers.map((paper) => ({
      path: paper,
      media_type: 'application/pdf' as const,
    })));
  }
  if (source.transcripts !== undefined) {
    refs.push(...source.transcripts.map((transcript) => ({
      path: transcript,
      media_type: 'text/plain' as const,
    })));
  }
  return refs;
}

async function ingestOneSource(
  slug: string,
  ref: SourceRefInput,
  index: number,
  ctx: IngestContext,
): Promise<SourceDigest> {
  if (isHttpUrl(ref.path)) return ingestUrl(slug, ref, index, ctx);
  return ingestLocalSource(slug, ref, index);
}

async function ingestUrl(
  slug: string,
  ref: SourceRefInput,
  index: number,
  ctx: IngestContext,
): Promise<SourceDigest> {
  const id = sourceDigestId(index, ref.path);
  const required = requiredFlag(ref);
  let response: Response;
  try {
    response = await fetch(ref.path);
  } catch (error) {
    return quarantinedSource({
      id,
      kind: 'url',
      required,
      code: 'fetch-failed',
      message: errorMessage(error),
      excludedReason: 'url fetch failed',
      retry: true,
    });
  }

  if (response.status === 401 || response.status === 403) {
    return quarantinedSource({
      id,
      kind: 'url',
      required,
      code: 'auth-required',
      message: `HTTP ${response.status}`,
      excludedReason: 'source requires authorization',
      retry: true,
    });
  }

  if (!response.ok) {
    return quarantinedSource({
      id,
      kind: 'url',
      required,
      code: 'fetch-failed',
      message: `HTTP ${response.status}`,
      excludedReason: 'url fetch failed',
      retry: true,
    });
  }

  const contentTypeHeader = response.headers.get('content-type');
  const contentType = contentTypeHeader === null ? '' : contentTypeHeader;
  if (contentType.includes('application/pdf')) {
    return pdfQuarantine(id, required);
  }
  if (!contentType.includes('text/html') && !contentType.includes('text/plain') && contentType.length > 0) {
    return quarantinedSource({
      id,
      kind: 'url',
      required,
      code: 'unsupported-mime',
      message: contentType,
      excludedReason: 'unsupported URL media type',
      retry: false,
    });
  }

  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_SOURCE_BYTES) {
    return quarantinedSource({
      id,
      kind: 'url',
      required,
      code: 'too-large',
      message: `${Buffer.byteLength(raw, 'utf8')} bytes`,
      excludedReason: 'source exceeds ingest size limit',
      retry: false,
    });
  }

  const rawRef = await writeRawSource(slug, ctx, index, raw);
  const extracted = contentType.includes('text/plain')
    ? { title: ref.path, text: raw.trim() }
    : extractHtmlDocument(raw);
  const digest: SourceDigest = {
    id,
    kind: 'url',
    required,
    status: 'ok',
    content: {
      title: extracted.title === undefined ? ref.path : extracted.title,
      text: extracted.text,
      cite_string: ref.path,
    },
  };
  if (rawRef !== undefined) digest.raw_ref = rawRef;
  return digest;
}

async function ingestLocalSource(
  slug: string,
  ref: SourceRefInput,
  index: number,
): Promise<SourceDigest> {
  const id = sourceDigestId(index, ref.path);
  const required = requiredFlag(ref);
  const mediaType = resolvedMediaType(ref);
  if (mediaType === 'application/pdf') return pdfQuarantine(id, required);
  if (mediaType !== 'text/plain' && mediaType !== 'text/markdown' && mediaType !== 'text/html') {
    return quarantinedSource({
      id,
      kind: 'transcript',
      required,
      code: 'unsupported-mime',
      message: mediaType,
      excludedReason: 'unsupported local source media type',
      retry: false,
    });
  }

  const fullPath = path.isAbsolute(ref.path) ? ref.path : path.join(paths(slug).lessonDir, ref.path);
  let raw: string;
  try {
    raw = await readFile(fullPath, 'utf8');
  } catch (error) {
    return quarantinedSource({
      id,
      kind: mediaType === 'text/html' ? 'url' : 'transcript',
      required,
      code: 'parse-failed',
      message: errorMessage(error),
      excludedReason: 'local source could not be read',
      retry: false,
    });
  }

  if (Buffer.byteLength(raw, 'utf8') > MAX_SOURCE_BYTES) {
    return quarantinedSource({
      id,
      kind: mediaType === 'text/html' ? 'url' : 'transcript',
      required,
      code: 'too-large',
      message: `${Buffer.byteLength(raw, 'utf8')} bytes`,
      excludedReason: 'source exceeds ingest size limit',
      retry: false,
    });
  }

  if (mediaType === 'text/html') {
    const extracted = extractHtmlDocument(raw);
    return {
      id,
      kind: 'url',
      required,
      status: 'ok',
      content: {
        title: extracted.title === undefined ? path.basename(ref.path) : extracted.title,
        text: extracted.text,
      },
    };
  }

  return {
    id,
    kind: 'transcript',
    required,
    status: 'ok',
    content: {
      title: path.basename(ref.path),
      text: raw.trim(),
    },
  };
}

function researchBriefFromSourceItems(slug: string, sourceItems: SourceDigest[]): ResearchBrief {
  const okItems = sourceItems.filter((item) => item.status === 'ok');
  const keyConcepts = okItems.map((item) => {
    const content = item.content;
    if (content === undefined) return item.id;
    if (content.title === undefined) return item.id;
    return content.title;
  });
  return {
    topic: slug,
    key_concepts: keyConcepts,
    named_figures: [],
    papers: [],
    source_digest_ids: okItems.map((item) => item.id),
  };
}

function resolvedMediaType(ref: SourceRefInput): SourceMediaType {
  if (ref.media_type !== undefined) return ref.media_type;
  const ext = path.extname(ref.path).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'text/markdown';
  if (ext === '.txt') return 'text/plain';
  if (ext === '.html' || ext === '.htm') return 'text/html';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.json') return 'application/json';
  return 'text/plain';
}

function pdfQuarantine(id: string, required: boolean): SourceDigest {
  return quarantinedSource({
    id,
    kind: 'paper',
    required,
    code: 'parse-failed',
    message: 'pdf parsing dependency is not available',
    excludedReason: 'pdf parsing not yet available',
    retry: false,
  });
}

function quarantinedSource(args: {
  id: string;
  kind: SourceDigest['kind'];
  required: boolean;
  code: NonNullable<SourceDigest['quarantine']>['code'];
  message: string;
  excludedReason: string;
  retry: boolean;
}): SourceDigest {
  const quarantine: NonNullable<SourceDigest['quarantine']> = {
    code: args.code,
    message: args.message,
    excluded_reason: args.excludedReason,
  };
  if (args.retry) {
    quarantine.retry_policy = {
      max_attempts: 2,
      backoff_ms: 500,
    };
  }
  return {
    id: args.id,
    kind: args.kind,
    required: args.required,
    status: 'quarantined',
    quarantine,
  };
}

async function writeRawSource(
  slug: string,
  ctx: IngestContext,
  index: number,
  raw: string,
): Promise<string | undefined> {
  if (ctx.run_id === undefined) return undefined;
  const relativeRef = path.join('runs', ctx.run_id, `source-${index + 1}.raw`);
  const fullPath = path.join(paths(slug).lessonDir, relativeRef);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, raw, 'utf8');
  return relativeRef;
}

function requiredFlag(ref: SourceRefInput): boolean {
  if (ref.required === undefined) return true;
  return ref.required;
}

function sourceDigestId(index: number, sourcePath: string): string {
  return `source-${index + 1}-${sha256(sourcePath).slice(0, 12)}`;
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'unknown source ingest error';
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
