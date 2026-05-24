import { splitSentences } from '../../narration-context';
import { sha256 } from '../artifact-ref';
import type { CurriculumPlan, ScenePlan } from '../curriculum/types';
import type { Diagnostic } from '../diagnostic-schema';
import type { ExistingSection, LessonCorpus, ScriptOutline } from '../ingest/types';
import type { ContentMap, SceneMap } from '../project-schema';
import { validateSceneMapArtifact } from './scene-map-validators';
import {
  SceneMapArtifactSchema,
  type BeatOutline,
  type DiscoveryEntry,
  type SceneMapArtifact,
  type SceneMapEntry,
  type SentenceRecord,
} from './types';

export interface AnalyticSceneMapArgs {
  corpus: LessonCorpus;
  curriculum: CurriculumPlan;
}

export interface SceneMapRunResult {
  artifact: SceneMapArtifact;
  diagnostics: Diagnostic[];
}

interface TextSource {
  text: string;
  source_section_id?: string;
}

export async function runAnalytic(args: AnalyticSceneMapArgs): Promise<SceneMapRunResult> {
  const artifact = buildAnalyticSceneMapArtifact(args);
  return {
    artifact,
    diagnostics: validateSceneMapArtifact(artifact, { corpus: args.corpus }),
  };
}

export function buildAnalyticSceneMapArtifact(args: AnalyticSceneMapArgs): SceneMapArtifact {
  const contentMap = buildContentMap(args.corpus, args.curriculum);
  const scenes: SceneMapEntry[] = [];
  for (const act of args.curriculum.acts) {
    for (const scene of act.scenes) {
      scenes.push(buildSceneDetail(scene, args.corpus));
    }
  }
  return SceneMapArtifactSchema.parse({
    schema_version: 'loa.scene-map.v1',
    content_map: contentMap,
    detail: {
      scenes,
    },
  });
}

function buildSceneDetail(scene: ScenePlan, corpus: LessonCorpus): SceneMapEntry {
  const textSource = textSourceForScene(scene, corpus);
  const sentenceTexts = splitSentences(textSource.text)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
  const sentences = sentenceTexts.map((sentence, index) => sentenceRecord(scene.id, index, sentence, textSource.source_section_id));
  const beats = scene.has_game
    ? gameBeats(scene.id, scene.cast_in_scene, sentences)
    : narrationBeats(scene.id, scene.cast_in_scene, sentences);
  const base: SceneMapEntry = {
    scene_id: scene.id,
    title: scene.title,
    summary: scene.summary,
    learning_objective: scene.learning_objective,
    cast_in_scene: scene.cast_in_scene,
    discoveries: discoveriesForScene(corpus, textSource.source_section_id),
    beats,
    sentences,
  };
  if (textSource.source_section_id !== undefined) base.source_section_id = textSource.source_section_id;
  if (scene.eyebrow !== undefined) base.eyebrow = scene.eyebrow;
  if (scene.has_game && scene.game_component_id !== undefined) {
    base.interactive_ref = { component_id: scene.game_component_id };
  }
  return base;
}

function textSourceForScene(scene: ScenePlan, corpus: LessonCorpus): TextSource {
  if (scene.source_section_id !== undefined) {
    const section = existingSectionForScene(corpus, scene.source_section_id);
    return {
      text: section.narration,
      source_section_id: section.source_section_id,
    };
  }
  const scriptPassage = scriptPassageForScene(scene, corpus.script_outline);
  if (scriptPassage !== undefined) {
    return {
      text: scriptPassage.text,
    };
  }
  throw new Error(`scene-map analytic path cannot find source text for scene "${scene.id}"`);
}

function existingSectionForScene(corpus: LessonCorpus, sourceSectionId: string): ExistingSection {
  const sections = corpus.existing_sections;
  if (sections === undefined) {
    throw new Error(`scene-map analytic path requires existing_sections for "${sourceSectionId}"`);
  }
  for (const section of sections) {
    if (section.source_section_id === sourceSectionId) return section;
  }
  throw new Error(`scene-map analytic path missing existing section "${sourceSectionId}"`);
}

function scriptPassageForScene(
  scene: ScenePlan,
  scriptOutline: ScriptOutline | undefined,
): ScriptOutline['passages'][number] | undefined {
  if (scriptOutline === undefined) return undefined;
  const digestIds = scene.source_digest_ids;
  if (digestIds === undefined || digestIds.length === 0) return undefined;
  const passageId = digestIds[0];
  for (const passage of scriptOutline.passages) {
    if (passage.id === passageId) return passage;
  }
  return undefined;
}

function sentenceRecord(
  sceneId: string,
  index: number,
  canonicalText: string,
  sourceSectionId: string | undefined,
): SentenceRecord {
  const base: SentenceRecord = {
    id: sentenceId(sceneId, index, canonicalText),
    canonical_text: canonicalText,
    normalized_text: normalizeSentence(canonicalText),
    source_offset: index,
  };
  if (sourceSectionId !== undefined) base.source_section_id = sourceSectionId;
  return base;
}

export function sentenceId(sceneId: string, index: number, canonicalText: string): string {
  return sha256(`${sceneId}\n${index}\n${canonicalText}`).slice(0, 16);
}

function normalizeSentence(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function gameBeats(sceneId: string, speakerIds: string[], sentences: SentenceRecord[]): BeatOutline[] {
  const sentenceIds = sentences.map((sentence) => sentence.id);
  const firstCount = sentenceIds.length >= 4 ? 2 : 1;
  const lastCount = sentenceIds.length >= 4 ? 2 : 1;
  const openerIds = sentenceIds.slice(0, Math.min(firstCount, sentenceIds.length));
  const closerStart = Math.max(0, sentenceIds.length - lastCount);
  const closerIds = sentenceIds.slice(closerStart);
  let middleIds = sentenceIds.slice(openerIds.length, closerStart);
  if (middleIds.length === 0 && sentenceIds.length > 0) middleIds = sentenceIds.slice();
  return [
    beat(sceneId, 0, 'opener', speakerIds, openerIds, 'background'),
    beat(sceneId, 1, 'demo', speakerIds, middleIds, 'game'),
    beat(sceneId, 2, 'closer', speakerIds, closerIds, speakerIds.length > 1 ? 'character' : 'background'),
  ];
}

function narrationBeats(sceneId: string, speakerIds: string[], sentences: SentenceRecord[]): BeatOutline[] {
  const sentenceIds = sentences.map((sentence) => sentence.id);
  if (sentenceIds.length <= 1) {
    return [
      beat(sceneId, 0, 'opener', speakerIds, sentenceIds, 'background'),
      beat(sceneId, 1, 'closer', speakerIds, sentenceIds, speakerIds.length > 1 ? 'character' : 'background'),
    ];
  }
  const splitIndex = Math.ceil(sentenceIds.length / 2);
  return [
    beat(sceneId, 0, 'opener', speakerIds, sentenceIds.slice(0, splitIndex), 'background'),
    beat(sceneId, 1, 'closer', speakerIds, sentenceIds.slice(splitIndex), speakerIds.length > 1 ? 'character' : 'background'),
  ];
}

function beat(
  sceneId: string,
  index: number,
  intent: BeatOutline['intent'],
  speakerIds: string[],
  sourceSentenceIds: string[],
  visualRole: BeatOutline['visual_role'],
): BeatOutline {
  return {
    id: sha256(`${sceneId}|${index}`).slice(0, 16),
    intent,
    speaker_ids: speakerIds,
    source_sentence_ids: sourceSentenceIds,
    visual_role: visualRole,
  };
}

function discoveriesForScene(corpus: LessonCorpus, sourceSectionId: string | undefined): DiscoveryEntry[] {
  if (sourceSectionId === undefined) return [];
  return corpus.discovery_inventory
    .filter((discovery) => discovery.source_section_id === sourceSectionId)
    .map((discovery) => {
      const entry: DiscoveryEntry = {
        key: discovery.key,
        brief: discovery.brief,
        source_section_id: discovery.source_section_id,
      };
      if (discovery.deep !== undefined) entry.deep = discovery.deep;
      return entry;
    });
}

function buildContentMap(corpus: LessonCorpus, curriculum: CurriculumPlan): ContentMap {
  return {
    schema_version: 'loa.content-map.v1',
    lesson_slug: corpus.slug,
    acts: curriculum.acts.map((act) => ({
      id: act.id,
      title: act.title,
      summary: act.summary,
      scenes: act.scenes.map((scene) => contentMapScene(scene, corpus)),
    })),
  };
}

function contentMapScene(scene: ScenePlan, corpus: LessonCorpus): SceneMap {
  const base = {
    id: scene.id,
    title: scene.title,
    summary: scene.summary,
    learning_objective: scene.learning_objective,
    cast_in_scene: scene.cast_in_scene,
    discoveries: discoveryKeysForScene(corpus, scene.source_section_id),
    shots: [],
  };
  const withSource = scene.source_section_id === undefined
    ? base
    : {
      ...base,
      source_section_id: scene.source_section_id,
    };
  const withEyebrow = scene.eyebrow === undefined
    ? withSource
    : {
      ...withSource,
      eyebrow: scene.eyebrow,
    };
  if (!scene.has_game || scene.game_component_id === undefined) return withEyebrow;
  return {
    ...withEyebrow,
    interactive_ref: {
      component_id: scene.game_component_id,
    },
  };
}

function discoveryKeysForScene(corpus: LessonCorpus, sourceSectionId: string | undefined): string[] {
  if (sourceSectionId === undefined) return [];
  return corpus.discovery_inventory
    .filter((discovery) => discovery.source_section_id === sourceSectionId)
    .map((discovery) => discovery.key);
}
