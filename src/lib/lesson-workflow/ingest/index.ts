import { readFile } from 'node:fs/promises';
import { paths, readProject } from '../project-fs';
import { LessonProjectSchema, type LessonProject, type Source } from '../project-schema';
import { ingestExistingLesson } from './existing-lesson';
import { ingestMixed } from './mixed';
import { ingestScript } from './script';
import { ingestSources } from './sources';
import { ingestTopic } from './topic';
import type { IngestContext, LessonCorpus } from './types';

export async function ingest(
  slug: string,
  ctx: IngestContext,
): Promise<LessonCorpus> {
  const project = await readProjectForIngest(slug);
  return ingestSource(slug, project.source, ctx);
}

export async function ingestSource(
  slug: string,
  source: Source,
  ctx: IngestContext,
): Promise<LessonCorpus> {
  switch (source.kind) {
    case 'existing-lesson':
      return ingestExistingLesson(slug, source, ctx);
    case 'topic':
      return ingestTopic(slug, source, ctx);
    case 'sources':
      return ingestSources(slug, source, ctx);
    case 'script':
      return ingestScript(slug, source, ctx);
    case 'mixed':
      return ingestMixed(slug, source, ctx);
  }
  const exhaustive: never = source;
  return exhaustive;
}

export * from './types';
export { ingestExistingLesson } from './existing-lesson';
export { ingestTopic } from './topic';
export { ingestSources } from './sources';
export { ingestScript } from './script';
export { ingestMixed } from './mixed';
export { validateLessonCorpus } from './ingest-validators';

async function readProjectForIngest(slug: string): Promise<LessonProject> {
  try {
    return await readProject(slug);
  } catch {
    const raw = JSON.parse(await readFile(paths(slug).projectJson, 'utf8'));
    delete raw.workflow;
    delete raw.validation;
    return LessonProjectSchema.parse(raw);
  }
}
