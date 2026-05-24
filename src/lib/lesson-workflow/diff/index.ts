import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readArtifact, writeArtifact, type ArtifactWriteResult } from '../artifact-ref';
import { LessonCorpusSchema, type ExistingSection, type LessonCorpus } from '../ingest/types';
import { SceneMapArtifactSchema, type SceneMapEntry } from '../scene-map/types';
import { StoryboardSchema, type ShotPlan, type Storyboard } from '../storyboard/types';
import { ParityReportSchema, type ParityReport, type ParitySectionEntry } from '../validate/types';
import {
  LessonDiffSchema,
  RunLessonDiffArgsSchema,
  RunSectionDiffArgsSchema,
  SectionDiffSchema,
  type LessonDiff,
  type RunLessonDiffArgs,
  type RunSectionDiffArgs,
  type SectionDiff,
} from './types';

type ParsedSceneMapArtifact = ReturnType<typeof SceneMapArtifactSchema.parse>;

interface DiffArtifacts {
  corpus: LessonCorpus;
  sceneMap: ParsedSceneMapArtifact;
  storyboard: Storyboard;
  parityReport: ParityReport;
}

export async function runSectionDiff(args: RunSectionDiffArgs): Promise<SectionDiff> {
  const parsed = RunSectionDiffArgsSchema.parse(args);
  const rootDir = rootDirFrom(parsed.rootDir);
  const artifacts = await readDiffArtifacts(rootDir, parsed.slug);
  return buildSectionDiff(artifacts, parsed.section_id);
}

export async function runLessonDiff(args: RunLessonDiffArgs): Promise<LessonDiff> {
  const parsed = RunLessonDiffArgsSchema.parse(args);
  const rootDir = rootDirFrom(parsed.rootDir);
  const artifacts = await readDiffArtifacts(rootDir, parsed.slug);
  const sections = existingSectionsFor(artifacts.corpus).map((section) =>
    buildSectionDiff(artifacts, section.source_section_id),
  );
  return LessonDiffSchema.parse({
    schema_version: 'loa.lesson-diff.v1',
    lesson_slug: parsed.slug,
    sections,
  });
}

export async function writeSectionDiffArtifact(args: RunSectionDiffArgs): Promise<ArtifactWriteResult> {
  const parsed = RunSectionDiffArgsSchema.parse(args);
  const rootDir = rootDirFrom(parsed.rootDir);
  const diff = await runSectionDiff(parsed);
  return writeArtifact(
    sectionDiffPath(rootDir, parsed.slug, parsed.section_id),
    diff,
    SectionDiffSchema,
  );
}

function buildSectionDiff(artifacts: DiffArtifacts, sectionId: string): SectionDiff {
  const section = findSection(existingSectionsFor(artifacts.corpus), sectionId);
  const scene = findScene(artifacts.sceneMap, sectionId);
  const paritySection = findParitySection(artifacts.parityReport, sectionId);
  const plans = plansForScene(artifacts.storyboard, scene.scene_id);
  const sourceDiscoveryKeys = sortedKeys(section.discoveries);
  const cinematicDiscoveryKeys = artifacts.sceneMap.detail.scenes
    .filter((entry) => entry.scene_id === scene.scene_id)
    .flatMap((entry) => entry.discoveries.map((discovery) => discovery.key))
    .sort((a, b) => a.localeCompare(b));
  const sourceEyebrow = section.eyebrow === undefined ? '' : section.eyebrow;
  const cinematicEyebrow = scene.eyebrow === undefined ? '' : scene.eyebrow;
  const sourceGameComponentId = section.child_component_ref;
  const cinematicInteractiveComponentId = scene.interactive_ref === undefined
    ? undefined
    : scene.interactive_ref.component_id;
  const sourceBase = {
    eyebrow: sourceEyebrow,
    title: section.title,
    sentence_count: paritySection.sentence_counts.source,
    discovery_keys: sourceDiscoveryKeys,
  };
  const source = sourceGameComponentId === undefined
    ? sourceBase
    : {
      ...sourceBase,
      game_component_id: sourceGameComponentId,
    };
  const cinematicBase = {
    title: scene.title,
    sentence_count: paritySection.sentence_counts.storyboard,
    shot_count: plans.length,
    shot_kinds: uniqueInOrder(plans.map((plan) => plan.kind)),
    discovery_keys: cinematicDiscoveryKeys,
  };
  const cinematicWithEyebrow = scene.eyebrow === undefined
    ? cinematicBase
    : {
      ...cinematicBase,
      eyebrow: scene.eyebrow,
    };
  const cinematic = cinematicInteractiveComponentId === undefined
    ? cinematicWithEyebrow
    : {
      ...cinematicWithEyebrow,
      interactive_component_id: cinematicInteractiveComponentId,
    };

  return SectionDiffSchema.parse({
    schema_version: 'loa.section-diff.v1',
    section_id: sectionId,
    scene_id: scene.scene_id,
    source,
    cinematic,
    parity: {
      sentence_match: paritySection.sentence_counts.source === paritySection.sentence_counts.storyboard
        && paritySection.sentence_counts.source === paritySection.sentence_counts.matched,
      discovery_match: sameStrings(sourceDiscoveryKeys, cinematicDiscoveryKeys),
      metadata_match: sourceEyebrow === cinematicEyebrow && section.title === scene.title,
      game_match: sourceGameComponentId === cinematicInteractiveComponentId,
    },
    parity_diagnostics: paritySection.diagnostics,
  });
}

async function readDiffArtifacts(rootDir: string, slug: string): Promise<DiffArtifacts> {
  const artifactDir = path.join(rootDir, 'lessons', slug, 'artifacts');
  const corpus = await readArtifact<LessonCorpus>(
    path.join(artifactDir, 'lesson-input.json'),
    LessonCorpusSchema,
  );
  const sceneMap = SceneMapArtifactSchema.parse(
    JSON.parse(await readFile(path.join(artifactDir, 'scene-map.json'), 'utf8')),
  );
  const storyboard = await readArtifact<Storyboard>(
    path.join(artifactDir, 'storyboard.json'),
    StoryboardSchema,
  );
  const parityReport = await readArtifact<ParityReport>(
    path.join(artifactDir, 'parity-report.json'),
    ParityReportSchema,
  );
  return {
    corpus,
    sceneMap,
    storyboard,
    parityReport,
  };
}

function rootDirFrom(rootDir: string | undefined): string {
  if (rootDir === undefined) return process.cwd();
  return rootDir;
}

function sectionDiffPath(rootDir: string, slug: string, sectionId: string): string {
  return path.join(rootDir, 'lessons', slug, 'artifacts', 'diffs', `${sectionId}.json`);
}

function existingSectionsFor(corpus: LessonCorpus): ExistingSection[] {
  if (corpus.existing_sections === undefined) {
    throw new Error(`loa.diff.existing_sections_missing: ${corpus.slug}`);
  }
  return corpus.existing_sections;
}

function findSection(sections: ExistingSection[], sectionId: string): ExistingSection {
  for (const section of sections) {
    if (section.source_section_id === sectionId) return section;
  }
  throw new Error(`loa.diff.section_missing: ${sectionId}`);
}

function findScene(sceneMap: ParsedSceneMapArtifact, sectionId: string): SceneMapEntry {
  for (const scene of sceneMap.detail.scenes) {
    if (scene.source_section_id === sectionId) return scene;
  }
  throw new Error(`loa.diff.scene_missing: ${sectionId}`);
}

function findParitySection(report: ParityReport, sectionId: string): ParitySectionEntry {
  for (const section of report.per_section) {
    if (section.source_section_id === sectionId) return section;
  }
  throw new Error(`loa.diff.parity_section_missing: ${sectionId}`);
}

function plansForScene(storyboard: Storyboard, sceneId: string): ShotPlan[] {
  const plans: ShotPlan[] = [];
  for (const plan of storyboard.plans) {
    if (plan.shot_address.scene_id === sceneId) plans.push(plan);
  }
  return plans;
}

function sortedKeys(input: object): string[] {
  return Object.keys(input).sort((a, b) => a.localeCompare(b));
}

function uniqueInOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function sameStrings(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export { LessonDiffSchema, SectionDiffSchema };
export type { LessonDiff, SectionDiff };
