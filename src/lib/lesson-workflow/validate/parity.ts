import { sha256 } from '../artifact-ref';
import { DiagnosticSchema, type Diagnostic } from '../diagnostic-schema';
import type { ExistingSection, LessonCorpus } from '../ingest/types';
import type { SceneMapArtifact, SceneMapEntry, SentenceRecord } from '../scene-map/types';
import type { SpokenLine, Storyboard } from '../storyboard/types';
import {
  type InteractiveRegistrySummary,
  type ParityReport,
  ParityReportSchema,
} from './types';

interface StoryboardUse {
  source_sentence_id: string;
  cast_id: string;
  text: string;
  path: Array<string | number>;
}

interface SectionSpeaker {
  source_section_id: string;
  cast_id: string;
}

export interface BuildParityReportArgs {
  lessonSlug: string;
  corpus: LessonCorpus;
  sceneMap: SceneMapArtifact;
  storyboard: Storyboard;
  interactives: InteractiveRegistrySummary;
}

export function buildParityReport(args: BuildParityReportArgs): ParityReport {
  if (!isParityApplicable(args.corpus)) {
    return ParityReportSchema.parse({
      schema_version: 'loa.parity-report.v1',
      lesson_slug: args.lessonSlug,
      source_kind: args.corpus.source_kind,
      applicable: false,
      per_section: [],
      overall_status: 'n/a',
    });
  }

  const existingSections = args.corpus.existing_sections;
  if (existingSections === undefined) {
    throw new Error('parity requires existing_sections for existing-lesson sources');
  }

  const sectionSpeakers = defaultSpeakersBySection(args.corpus);
  const discoveryOwners = discoveryOwnerByKey(args.corpus);
  const perSection = existingSections.map((section, sectionIndex) =>
    buildSectionEntry({
      section,
      sectionIndex,
      sceneMap: args.sceneMap,
      storyboard: args.storyboard,
      interactives: args.interactives,
      defaultSpeaker: sectionSpeakers.get(section.source_section_id),
      discoveryOwners,
    }),
  );
  const failed = perSection.some((entry) => entry.status === 'fail');

  return ParityReportSchema.parse({
    schema_version: 'loa.parity-report.v1',
    lesson_slug: args.lessonSlug,
    source_kind: args.corpus.source_kind,
    applicable: true,
    per_section: perSection,
    overall_status: failed ? 'fail' : 'pass',
  });
}

function isParityApplicable(corpus: LessonCorpus): boolean {
  if (corpus.source_kind === 'existing-lesson') return true;
  if (corpus.source_kind !== 'mixed') return false;
  if (corpus.existing_sections === undefined) return false;
  return corpus.existing_sections.length > 0;
}

function buildSectionEntry(args: {
  section: ExistingSection;
  sectionIndex: number;
  sceneMap: SceneMapArtifact;
  storyboard: Storyboard;
  interactives: InteractiveRegistrySummary;
  defaultSpeaker: string | undefined;
  discoveryOwners: Map<string, string>;
}) {
  const scenes = args.sceneMap.detail.scenes
    .filter((scene) => scene.source_section_id === args.section.source_section_id);
  const primaryScene = scenes.length === 0 ? undefined : scenes[0];
  const sourceSentences = orderedSectionSentences(scenes);
  const sceneIds = new Set(scenes.map((scene) => scene.scene_id));
  const storyboardUses = storyboardUsesForScenes(args.storyboard, sceneIds);
  const diagnostics: Diagnostic[] = [
    ...sentenceDiagnostics({
      sourceSentences,
      storyboardUses,
      sectionIndex: args.sectionIndex,
    }),
    ...speakerDiagnostics({
      storyboardUses,
      sourceSentences,
      defaultSpeaker: args.defaultSpeaker,
      sectionIndex: args.sectionIndex,
    }),
    ...gameDiagnostics({
      section: args.section,
      scene: primaryScene,
      sectionIndex: args.sectionIndex,
      interactives: args.interactives,
    }),
    ...discoveryDiagnostics({
      section: args.section,
      scene: primaryScene,
      sectionIndex: args.sectionIndex,
      discoveryOwners: args.discoveryOwners,
    }),
    ...metadataDiagnostics({
      section: args.section,
      scene: primaryScene,
      sectionIndex: args.sectionIndex,
    }),
  ];
  const hasError = diagnostics.some((diagnosticEntry) => diagnosticEntry.severity === 'error');

  const uniqueStoryboardIds = uniqueStrings(storyboardUses.map((entry) => entry.source_sentence_id));
  const sourceIds = new Set(sourceSentences.map((sentence) => sentence.id));
  const matched = uniqueStoryboardIds.filter((sourceId) => sourceIds.has(sourceId)).length;
  const entryBase = {
    source_section_id: args.section.source_section_id,
    title: args.section.title,
    status: hasError ? 'fail' : 'pass',
    sentence_counts: {
      source: sourceSentences.length,
      storyboard: uniqueStoryboardIds.length,
      matched,
    },
    diagnostics,
  };
  const withEyebrow = args.section.eyebrow === undefined
    ? entryBase
    : {
      ...entryBase,
      eyebrow: args.section.eyebrow,
    };
  if (primaryScene === undefined) return withEyebrow;
  return {
    ...withEyebrow,
    scene_id: primaryScene.scene_id,
  };
}

function orderedSectionSentences(scenes: SceneMapEntry[]): SentenceRecord[] {
  const sentences: SentenceRecord[] = [];
  for (const scene of scenes) {
    sentences.push(...scene.sentences);
  }
  return sentences.slice().sort((left, right) => {
    const leftOffset = sentenceOffset(left, 0);
    const rightOffset = sentenceOffset(right, 0);
    if (leftOffset !== rightOffset) return leftOffset - rightOffset;
    return left.id.localeCompare(right.id);
  });
}

function storyboardUsesForScenes(storyboard: Storyboard, sceneIds: Set<string>): StoryboardUse[] {
  const uses: StoryboardUse[] = [];
  for (let planIndex = 0; planIndex < storyboard.plans.length; planIndex += 1) {
    const plan = storyboard.plans[planIndex];
    if (!sceneIds.has(plan.shot_address.scene_id)) continue;
    for (let lineIndex = 0; lineIndex < plan.spoken_lines.length; lineIndex += 1) {
      const line = plan.spoken_lines[lineIndex];
      for (let idIndex = 0; idIndex < line.source_sentence_ids.length; idIndex += 1) {
        uses.push({
          source_sentence_id: line.source_sentence_ids[idIndex],
          cast_id: line.cast_id,
          text: line.text,
          path: ['storyboard', 'plans', planIndex, 'spoken_lines', lineIndex, 'source_sentence_ids', idIndex],
        });
      }
    }
  }
  return uses;
}

function sentenceDiagnostics(args: {
  sourceSentences: SentenceRecord[];
  storyboardUses: StoryboardUse[];
  sectionIndex: number;
}): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const sourceById = new Map(args.sourceSentences.map((sentence) => [sentence.id, sentence]));
  const useCounts = new Map<string, number>();
  for (const use of args.storyboardUses) {
    const current = useCounts.get(use.source_sentence_id);
    useCounts.set(use.source_sentence_id, current === undefined ? 1 : current + 1);
  }

  for (const sentence of args.sourceSentences) {
    if (useCounts.has(sentence.id)) continue;
    diagnostics.push(diagnostic({
      code: 'parity.sentence.missing',
      path: ['scene-map', 'detail', 'scenes', args.sectionIndex, 'sentences', sentence.id],
      actual: 'not referenced by storyboard',
      expected: sentence.id,
      repair: 'add a storyboard spoken_line source_sentence_ids entry for this sentence',
      severity: 'error',
    }));
  }

  const emittedExtras = new Set<string>();
  for (const use of args.storyboardUses) {
    if (sourceById.has(use.source_sentence_id)) continue;
    if (emittedExtras.has(use.source_sentence_id)) continue;
    emittedExtras.add(use.source_sentence_id);
    diagnostics.push(diagnostic({
      code: 'parity.sentence.extra',
      path: use.path,
      actual: use.source_sentence_id,
      expected: 'a source sentence id from this Section',
      repair: 'remove the extra source_sentence_id or anchor it to the correct source Section',
      severity: 'error',
    }));
  }

  const emittedDuplicates = new Set<string>();
  for (const use of args.storyboardUses) {
    const count = useCounts.get(use.source_sentence_id);
    if (count === undefined) continue;
    if (count <= 1) continue;
    if (emittedDuplicates.has(use.source_sentence_id)) continue;
    emittedDuplicates.add(use.source_sentence_id);
    diagnostics.push(diagnostic({
      code: 'parity.sentence.duplicate',
      path: use.path,
      actual: count,
      expected: 'one storyboard reference for this source sentence id',
      repair: 'confirm the duplicate is intentional or remove the repeated source_sentence_id',
      severity: 'warning',
    }));
  }

  for (const use of args.storyboardUses) {
    const source = sourceById.get(use.source_sentence_id);
    if (source === undefined) continue;
    if (source.canonical_text === use.text) continue;
    diagnostics.push(diagnostic({
      code: 'parity.sentence.modified',
      path: use.path,
      actual: use.text,
      expected: source.canonical_text,
      repair: 'restore the storyboard spoken_line text to the source canonical_text',
      severity: 'error',
    }));
  }

  const sourceOrder = sourceOrderById(args.sourceSentences);
  const matchedUses = args.storyboardUses.filter((use) => sourceOrder.has(use.source_sentence_id));
  const emittedMoved = new Set<string>();
  for (let index = 1; index < matchedUses.length; index += 1) {
    const previous = matchedUses[index - 1];
    const current = matchedUses[index];
    const previousOffset = sourceOrder.get(previous.source_sentence_id);
    const currentOffset = sourceOrder.get(current.source_sentence_id);
    if (previousOffset === undefined || currentOffset === undefined) continue;
    if (previousOffset <= currentOffset) continue;
    if (emittedMoved.has(current.source_sentence_id)) continue;
    emittedMoved.add(current.source_sentence_id);
    diagnostics.push(diagnostic({
      code: 'parity.sentence.moved',
      path: current.path,
      actual: {
        previous_source_sentence_id: previous.source_sentence_id,
        current_source_sentence_id: current.source_sentence_id,
      },
      expected: 'storyboard source_sentence_ids in nondecreasing source_offset order',
      repair: 'restore storyboard spoken line order to match the source Section order',
      severity: 'warning',
    }));
  }

  return diagnostics;
}

function speakerDiagnostics(args: {
  storyboardUses: StoryboardUse[];
  sourceSentences: SentenceRecord[];
  defaultSpeaker: string | undefined;
  sectionIndex: number;
}): Diagnostic[] {
  if (args.defaultSpeaker === undefined) return [];
  const sourceIds = new Set(args.sourceSentences.map((sentence) => sentence.id));
  const diagnostics: Diagnostic[] = [];
  const emittedPaths = new Set<string>();
  for (const use of args.storyboardUses) {
    if (!sourceIds.has(use.source_sentence_id)) continue;
    if (use.cast_id === args.defaultSpeaker) continue;
    const key = use.path.join('.');
    if (emittedPaths.has(key)) continue;
    emittedPaths.add(key);
    diagnostics.push(diagnostic({
      code: 'parity.speaker.drift',
      path: use.path,
      actual: use.cast_id,
      expected: args.defaultSpeaker,
      repair: 'match the storyboard cast_id to the Section audio voice owner',
      severity: 'warning',
    }));
  }
  void args.sectionIndex;
  return diagnostics;
}

function gameDiagnostics(args: {
  section: ExistingSection;
  scene: SceneMapEntry | undefined;
  sectionIndex: number;
  interactives: InteractiveRegistrySummary;
}): Diagnostic[] {
  if (args.section.child_component_ref === undefined) return [];
  const diagnostics: Diagnostic[] = [];
  if (args.scene === undefined || args.scene.interactive_ref === undefined) {
    diagnostics.push(diagnostic({
      code: 'parity.game.missing_component',
      path: ['existing_sections', args.sectionIndex, 'child_component_ref'],
      actual: 'missing scene interactive_ref',
      expected: args.section.child_component_ref,
      repair: 'carry the existing Section child_component_ref into scene_map.detail.scenes[].interactive_ref',
      severity: 'error',
    }));
    return diagnostics;
  }
  const componentId = args.scene.interactive_ref.component_id;
  if (componentId !== args.section.child_component_ref) {
    diagnostics.push(diagnostic({
      code: 'parity.game.missing_component',
      path: ['scene-map', 'detail', 'scenes', args.sectionIndex, 'interactive_ref', 'component_id'],
      actual: componentId,
      expected: args.section.child_component_ref,
      repair: 'align the scene interactive_ref component_id with the existing Section child_component_ref',
      severity: 'error',
    }));
  }
  if (!hasContract(args.interactives, args.section.child_component_ref)) {
    diagnostics.push(diagnostic({
      code: 'parity.game.uncontracted',
      path: ['interactives', 'registry.ts', args.section.child_component_ref],
      actual: args.section.child_component_ref,
      expected: 'registered InteractiveContract',
      repair: 'register this component in INTERACTIVES_REGISTRY with an InteractiveContract',
      severity: args.interactives.complete ? 'error' : 'warning',
    }));
  }
  return diagnostics;
}

function discoveryDiagnostics(args: {
  section: ExistingSection;
  scene: SceneMapEntry | undefined;
  sectionIndex: number;
  discoveryOwners: Map<string, string>;
}): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const sceneDiscoveries = new Map<string, string>();
  if (args.scene !== undefined) {
    for (const discovery of args.scene.discoveries) {
      sceneDiscoveries.set(discovery.key, discovery.brief);
    }
  }

  const keys = Object.keys(args.section.discoveries).sort();
  for (const key of keys) {
    const owner = args.discoveryOwners.get(key);
    if (owner !== undefined && owner !== args.section.source_section_id) continue;
    const existing = args.section.discoveries[key];
    const sceneBrief = sceneDiscoveries.get(key);
    if (sceneBrief === undefined) {
      diagnostics.push(diagnostic({
        code: 'parity.discovery.missing',
        path: ['existing_sections', args.sectionIndex, 'discoveries', key],
        actual: 'missing from scene-map discoveries',
        expected: key,
        repair: 'carry the existing Section discovery key into scene_map.detail.scenes[].discoveries',
        severity: 'error',
      }));
      continue;
    }
    if (sha256(sceneBrief) === sha256(existing.brief)) continue;
    diagnostics.push(diagnostic({
      code: 'parity.discovery.modified',
      path: ['existing_sections', args.sectionIndex, 'discoveries', key, 'brief'],
      actual: sha256(sceneBrief),
      expected: sha256(existing.brief),
      repair: 'restore the discovery brief content from the existing Section',
      severity: 'error',
    }));
  }
  return diagnostics;
}

function discoveryOwnerByKey(corpus: LessonCorpus): Map<string, string> {
  const owners = new Map<string, string>();
  for (const discovery of corpus.discovery_inventory) {
    if (owners.has(discovery.key)) continue;
    owners.set(discovery.key, discovery.source_section_id);
  }
  return owners;
}

function metadataDiagnostics(args: {
  section: ExistingSection;
  scene: SceneMapEntry | undefined;
  sectionIndex: number;
}): Diagnostic[] {
  if (args.scene === undefined) {
    return [diagnostic({
      code: 'parity.section.metadata_drift',
      path: ['existing_sections', args.sectionIndex],
      actual: 'missing scene',
      expected: args.section.title,
      repair: 'create a scene-map detail scene for this source_section_id',
      severity: 'error',
    })];
  }
  const diagnostics: Diagnostic[] = [];
  if (displayValue(args.section.eyebrow) !== displayValue(args.scene.eyebrow)) {
    diagnostics.push(diagnostic({
      code: 'parity.section.metadata_drift',
      path: ['existing_sections', args.sectionIndex, 'eyebrow'],
      actual: displayValue(args.scene.eyebrow),
      expected: displayValue(args.section.eyebrow),
      repair: 'preserve the existing Section eyebrow in the scene-map scene',
      severity: 'error',
    }));
  }
  if (args.section.title !== args.scene.title) {
    diagnostics.push(diagnostic({
      code: 'parity.section.metadata_drift',
      path: ['existing_sections', args.sectionIndex, 'title'],
      actual: args.scene.title,
      expected: args.section.title,
      repair: 'preserve the existing Section title in the scene-map scene',
      severity: 'error',
    }));
  }
  return diagnostics;
}

function defaultSpeakersBySection(corpus: LessonCorpus): Map<string, string> {
  const speakers = new Map<string, string>();
  if (corpus.existing_sections === undefined) return speakers;
  if (corpus.audio_index === undefined) return speakers;

  const castByVoiceId = new Map<string, string>();
  for (const cast of corpus.cast_seed) {
    if (cast.voice_id === undefined) continue;
    castByVoiceId.set(cast.voice_id, cast.id);
  }

  const sectionSpeakers: SectionSpeaker[] = [];
  for (const section of corpus.existing_sections) {
    for (const entry of corpus.audio_index.entries) {
      if (!section.narration.includes(entry.text)) continue;
      const castId = castByVoiceId.get(entry.voice_id);
      if (castId === undefined) continue;
      sectionSpeakers.push({
        source_section_id: section.source_section_id,
        cast_id: castId,
      });
      break;
    }
  }
  for (const speaker of sectionSpeakers) {
    speakers.set(speaker.source_section_id, speaker.cast_id);
  }
  return speakers;
}

function sourceOrderById(sentences: SentenceRecord[]): Map<string, number> {
  const order = new Map<string, number>();
  for (let index = 0; index < sentences.length; index += 1) {
    order.set(sentences[index].id, sentenceOffset(sentences[index], index));
  }
  return order;
}

function sentenceOffset(sentence: SentenceRecord, fallback: number): number {
  if (sentence.source_offset === undefined) return fallback;
  return sentence.source_offset;
}

function hasContract(interactives: InteractiveRegistrySummary, componentId: string): boolean {
  for (const contract of interactives.contracts) {
    if (contract.component_id === componentId) return true;
  }
  return false;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function displayValue(value: string | undefined): string {
  if (value === undefined) return '(missing)';
  return value;
}

function diagnostic(args: Diagnostic): Diagnostic {
  return DiagnosticSchema.parse(args);
}
