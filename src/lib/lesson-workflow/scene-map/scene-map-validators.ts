import { INTERACTIVES_REGISTRY as LOOPING_LLMS_INTERACTIVES_REGISTRY } from '../../../../lessons/looping-llms/interactives/registry';
import { DiagnosticSchema, type Diagnostic } from '../diagnostic-schema';
import type { LessonCorpus } from '../ingest/types';
import type { SceneMapArtifact } from './types';

interface InteractiveRegistryLookup {
  size: number;
  complete: boolean;
  has: (componentId: string) => boolean;
}

const INTERACTIVE_REGISTRIES: Array<{
  slug: string;
  registry: InteractiveRegistryLookup;
}> = [
  {
    slug: 'looping-llms',
    registry: LOOPING_LLMS_INTERACTIVES_REGISTRY,
  },
];

export function validateSceneMapArtifact(artifact: SceneMapArtifact, ctx: { corpus: LessonCorpus }): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  diagnostics.push(...validateSectionCompleteness(artifact, ctx.corpus));
  diagnostics.push(...validateSceneDetails(artifact, ctx.corpus));
  return diagnostics;
}

function validateSectionCompleteness(artifact: SceneMapArtifact, corpus: LessonCorpus): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (corpus.source_kind !== 'existing-lesson') return diagnostics;

  const sections = corpus.existing_sections;
  if (sections === undefined) return diagnostics;

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    const count = sceneCountForSourceSection(artifact, section.source_section_id);
    if (count === 1) continue;
    diagnostics.push(diagnostic({
      code: 'scene-map.section.missing',
      path: ['content_map', 'source_section_id', section.source_section_id],
      actual: count,
      expected: 'exactly one Scene with this source_section_id',
      repair: 'add exactly one scene-map entry for this source section',
      severity: 'error',
    }));
  }

  return diagnostics;
}

function sceneCountForSourceSection(artifact: SceneMapArtifact, sourceSectionId: string): number {
  let count = 0;
  for (const act of artifact.content_map.acts) {
    for (const scene of act.scenes) {
      if (scene.source_section_id === sourceSectionId) count += 1;
    }
  }
  return count;
}

function validateSceneDetails(artifact: SceneMapArtifact, corpus: LessonCorpus): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const castIds = new Set(corpus.cast_seed.map((cast) => cast.id));
  const interactiveRegistry = interactiveRegistryForSlug(corpus.slug);

  artifact.detail.scenes.forEach((scene, sceneIndex) => {
    if (scene.beats.length === 0) {
      diagnostics.push(diagnostic({
        code: 'scene-map.scene.empty_beats',
        path: ['detail', 'scenes', sceneIndex, 'beats'],
        actual: 0,
        expected: 'at least one beat',
        repair: 'add beat outlines that segment this scene narrative',
        severity: 'error',
      }));
    }

    scene.cast_in_scene.forEach((castId, castIndex) => {
      if (castIds.has(castId)) return;
      diagnostics.push(diagnostic({
        code: 'scene-map.cast.unknown',
        path: ['detail', 'scenes', sceneIndex, 'cast_in_scene', castIndex],
        actual: castId,
        expected: 'cast id from corpus.cast_seed',
        repair: 'use a known cast id or add it to the lesson cast seed',
        severity: 'error',
      }));
    });

    scene.beats.forEach((beat, beatIndex) => {
      if (beat.source_sentence_ids.length === 0) {
        diagnostics.push(diagnostic({
          code: 'scene-map.beat.no_source_sentences',
          path: ['detail', 'scenes', sceneIndex, 'beats', beatIndex, 'source_sentence_ids'],
          actual: 0,
          expected: 'at least one source sentence id',
          repair: 'point the beat at the sentence ids it covers',
          severity: 'error',
        }));
      }

      beat.speaker_ids.forEach((speakerId, speakerIndex) => {
        if (castIds.has(speakerId)) return;
        diagnostics.push(diagnostic({
          code: 'scene-map.cast.unknown',
          path: ['detail', 'scenes', sceneIndex, 'beats', beatIndex, 'speaker_ids', speakerIndex],
          actual: speakerId,
          expected: 'cast id from corpus.cast_seed',
          repair: 'use a known cast id or add it to the lesson cast seed',
          severity: 'error',
        }));
      });
    });

    if (scene.interactive_ref !== undefined) {
      diagnostics.push(...validateInteractiveRef(
        scene.interactive_ref.component_id,
        sceneIndex,
        interactiveRegistry,
        corpus.slug,
      ));
    }
  });

  return diagnostics;
}

function validateInteractiveRef(
  componentId: string,
  sceneIndex: number,
  registry: InteractiveRegistryLookup | undefined,
  slug: string,
): Diagnostic[] {
  if (registry !== undefined && registry.complete) {
    if (registry.has(componentId)) return [];
    return [diagnostic({
      code: 'scene-map.interactive.unknown_component',
      path: ['detail', 'scenes', sceneIndex, 'interactive_ref', 'component_id'],
      actual: componentId,
      expected: `registered component id for lessons/${slug}`,
      repair: 'register the component or remove interactive_ref from this scene',
      severity: 'error',
    })];
  }

  return [diagnostic({
    code: 'scene-map.interactive.unknown_component',
    path: ['detail', 'scenes', sceneIndex, 'interactive_ref', 'component_id'],
    actual: componentId,
    expected: `registered component id for lessons/${slug}`,
    repair: 'register the component before visual execution uses this scene',
    severity: 'warning',
  })];
}

function interactiveRegistryForSlug(slug: string): InteractiveRegistryLookup | undefined {
  for (const entry of INTERACTIVE_REGISTRIES) {
    if (entry.slug === slug) return entry.registry;
  }
  return undefined;
}

function diagnostic(args: Diagnostic): Diagnostic {
  return DiagnosticSchema.parse(args);
}
