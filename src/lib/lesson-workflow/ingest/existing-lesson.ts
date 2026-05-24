import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { canonicalJsonStringify, sha256 } from '../artifact-ref';
import { paths } from '../project-fs';
import type { Source } from '../project-schema';
import { extractExistingLessonSections } from './ast-extract';
import {
  AudioIndexSnapshotSchema,
  CastSeedSchema,
  EXTRACTOR_VERSION,
  type AudioIndexSnapshot,
  type CastSeed,
  type DiscoverySeed,
  type IngestContext,
  type InteractiveRef,
  type LessonCorpus,
  type SourceDigest,
} from './types';

type ExistingLessonSource = Extract<Source, { kind: 'existing-lesson' }>;

const CastFileSchema = z.object({
  characters: z.array(CastSeedSchema),
  default_speaker_id: z.string().optional(),
}).strict();

const RawAudioIndexSchema = z.object({
  lesson: z.string().min(1),
  updated_at: z.string().optional(),
  voices: z.array(z.string()).optional(),
  entries: z.array(z.object({
    hash: z.string().min(1),
    text: z.string(),
    speaker_id: z.string().optional(),
    voice_id: z.string().min(1),
    file: z.string().min(1),
    source_file: z.string().optional(),
    timings: z.array(z.object({
      text: z.string(),
      startMs: z.number().nonnegative(),
      durationMs: z.number().nonnegative(),
    }).strict()).optional(),
  }).strict()),
}).strict();

export async function ingestExistingLesson(
  slug: string,
  source: ExistingLessonSource,
  ctx: IngestContext,
): Promise<LessonCorpus> {
  const projectPaths = paths(slug);
  const lessonPath = path.join(projectPaths.lessonDir, source.sections_ref);
  const castPath = projectPaths.charactersJson;
  const audioPath = path.join(projectPaths.audioDir, 'index.json');
  const metaPath = projectPaths.metaJson;
  const [lessonSource, castRaw, audioRaw, metaRaw] = await Promise.all([
    readFile(lessonPath, 'utf8'),
    readFile(castPath, 'utf8'),
    readFile(audioPath, 'utf8'),
    readFile(metaPath, 'utf8'),
  ]);
  const extracted = extractExistingLessonSections({
    slug,
    filePath: lessonPath,
    sourceText: lessonSource,
  });
  const sections = extracted.sections.map((entry) => entry.section);
  const sourceItems = extracted.sections.map<SourceDigest>((entry) => {
    if (entry.issues.length === 0) {
      return {
        id: entry.section.source_section_id,
        kind: 'section',
        required: true,
        status: 'ok',
        content: {
          title: entry.section.title,
          text: entry.section.narration,
        },
      };
    }

    return {
      id: entry.section.source_section_id,
      kind: 'section',
      required: true,
      status: 'quarantined',
      quarantine: {
        code: 'parse-failed',
        message: entry.issues.map((issue) => issue.message).join('; '),
        excluded_reason: 'section failed required existing-lesson extraction checks',
      },
      content: {
        title: entry.section.title,
        text: entry.section.narration,
      },
    };
  });

  const castSeed = CastFileSchema.parse(JSON.parse(castRaw)).characters;
  const audioIndex = audioSnapshotFromRaw(audioRaw);
  const interactiveInventory = buildInteractiveInventory({
    slug,
    lessonRef: source.sections_ref,
    sections,
    importedGameRefs: extracted.imported_game_refs,
  });
  const discoveryInventory = buildDiscoveryInventory(sections);

  return {
    schema_version: 'loa.lesson-corpus.v1',
    slug,
    source_kind: 'existing-lesson',
    source_items: sourceItems,
    existing_sections: sections,
    cast_seed: castSeed,
    audio_index: audioIndex,
    interactive_inventory: interactiveInventory,
    discovery_inventory: discoveryInventory,
    provenance: {
      ingested_at: ctx.now().toISOString(),
      extractor_version: EXTRACTOR_VERSION,
      source_hash: sha256(canonicalJsonStringify({
        audio: sha256(audioRaw),
        cast: sha256(castRaw),
        lesson: sha256(lessonSource),
        meta: sha256(metaRaw),
      })),
    },
  };
}

function audioSnapshotFromRaw(raw: string): AudioIndexSnapshot {
  const parsed = RawAudioIndexSchema.parse(JSON.parse(raw));
  return AudioIndexSnapshotSchema.parse({
    lesson_slug: parsed.lesson,
    entries: parsed.entries.map((entry) => {
      if (entry.timings === undefined) {
        return {
          hash: entry.hash,
          text: entry.text,
          voice_id: entry.voice_id,
          file: entry.file,
        };
      }
      return {
        hash: entry.hash,
        text: entry.text,
        voice_id: entry.voice_id,
        file: entry.file,
        timings: entry.timings,
      };
    }),
  });
}

function buildInteractiveInventory(args: {
  slug: string;
  lessonRef: string;
  sections: Array<{
    title: string;
    child_component_ref?: string;
  }>;
  importedGameRefs: Array<{ component_id: string; file_ref: string }>;
}): InteractiveRef[] {
  const importedRefs = new Map(args.importedGameRefs.map((ref) => [ref.component_id, ref.file_ref]));
  const seen = new Set<string>();
  const inventory: InteractiveRef[] = [];
  for (const section of args.sections) {
    const componentId = section.child_component_ref;
    if (componentId === undefined) continue;
    if (seen.has(componentId)) continue;
    seen.add(componentId);
    inventory.push({
      component_id: componentId,
      scene_hint: section.title,
      file_ref: resolveComponentFileRef(args.slug, args.lessonRef, componentId, importedRefs),
    });
  }
  return inventory;
}

function resolveComponentFileRef(
  slug: string,
  lessonRef: string,
  componentId: string,
  importedRefs: ReadonlyMap<string, string>,
): string {
  const importedRef = importedRefs.get(componentId);
  if (importedRef !== undefined) return importedRef;
  const gameRef = path.join('games', `${componentId}.tsx`);
  if (existsSync(path.join(paths(slug).lessonDir, gameRef))) return gameRef;
  return lessonRef;
}

function buildDiscoveryInventory(sections: Array<{
  source_section_id: string;
  discoveries: { [key: string]: { brief: string; deep?: string } };
}>): DiscoverySeed[] {
  const seen = new Set<string>();
  const discoveries: DiscoverySeed[] = [];
  for (const section of sections) {
    for (const [key, detail] of Object.entries(section.discoveries)) {
      if (seen.has(key)) continue;
      seen.add(key);
      const discovery: DiscoverySeed = {
        key,
        brief: detail.brief,
        source_section_id: section.source_section_id,
      };
      if (detail.deep !== undefined) discovery.deep = detail.deep;
      discoveries.push(discovery);
    }
  }
  return discoveries;
}
