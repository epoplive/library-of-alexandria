import type { ActPlan, CurriculumPlan, ScenePlan } from '../curriculum/types';
import { CurriculumPlanSchema } from '../curriculum/types';
import type { LessonCorpus } from '../ingest/types';
import type { LlmClient } from '../llm/types';
import type { ContentMap, SceneMap } from '../project-schema';
import { runAnalytic, type SceneMapRunResult } from './analytic';
import { runGenerative } from './generative';
import { validateSceneMapArtifact } from './scene-map-validators';
import { SceneMapArtifactSchema, type SceneMapEntry } from './types';

export interface MixedSceneMapArgs {
  corpus: LessonCorpus;
  curriculum: CurriculumPlan;
  llm?: LlmClient;
}

type ScenePredicate = (scene: ScenePlan) => boolean;

export async function runMixed(args: MixedSceneMapArgs): Promise<SceneMapRunResult> {
  const analyticSourceSectionIds = analyticSourceSectionIdSet(args.corpus);
  const analyticPlan = curriculumSubset(args.curriculum, (scene) => isAnalyticScene(scene, analyticSourceSectionIds));
  const generatedPlan = curriculumSubset(args.curriculum, (scene) => !isAnalyticScene(scene, analyticSourceSectionIds));
  const results: SceneMapRunResult[] = [];

  if (hasScenes(analyticPlan)) {
    results.push(await runAnalytic({
      corpus: args.corpus,
      curriculum: analyticPlan,
    }));
  }

  if (hasScenes(generatedPlan)) {
    if (args.llm === undefined) throw new Error('scene-map: mixed generative path requires an LlmClient');
    results.push(await runGenerative({
      corpus: args.corpus,
      curriculum: generatedPlan,
      llm: args.llm,
    }));
  }

  if (results.length === 0) throw new Error('scene-map: mixed corpus has no analytic or generative scenes');

  const artifact = mergeResults(args.curriculum, args.corpus.slug, results);
  return {
    artifact,
    diagnostics: validateSceneMapArtifact(artifact, { corpus: args.corpus }),
  };
}

function analyticSourceSectionIdSet(corpus: LessonCorpus): Set<string> {
  const out = new Set<string>();
  const sections = corpus.existing_sections;
  if (sections === undefined) return out;
  for (const section of sections) {
    out.add(section.source_section_id);
  }
  return out;
}

function isAnalyticScene(scene: ScenePlan, sourceSectionIds: Set<string>): boolean {
  if (scene.source_section_id === undefined) return false;
  return sourceSectionIds.has(scene.source_section_id);
}

function curriculumSubset(curriculum: CurriculumPlan, predicate: ScenePredicate): CurriculumPlan {
  const acts: ActPlan[] = [];
  for (const act of curriculum.acts) {
    const scenes = act.scenes.filter((scene) => predicate(scene));
    if (scenes.length === 0) continue;
    acts.push({
      id: act.id,
      title: act.title,
      summary: act.summary,
      scenes,
    });
  }
  return CurriculumPlanSchema.parse({
    schema_version: 'loa.curriculum.v1',
    acts,
    estimated_total_runtime_s: totalRuntime(acts),
    discovery_seed_plan: curriculum.discovery_seed_plan,
    derivation: curriculum.derivation,
  });
}

function hasScenes(curriculum: CurriculumPlan): boolean {
  for (const act of curriculum.acts) {
    if (act.scenes.length > 0) return true;
  }
  return false;
}

function totalRuntime(acts: ActPlan[]): number {
  return acts.reduce((actSum, act) => actSum + act.scenes.reduce((sceneSum, scene) => sceneSum + scene.estimated_runtime_s, 0), 0);
}

function mergeResults(curriculum: CurriculumPlan, slug: string, results: SceneMapRunResult[]) {
  const contentScenes = new Map<string, SceneMap>();
  const detailScenes = new Map<string, SceneMapEntry>();

  for (const result of results) {
    for (const act of result.artifact.content_map.acts) {
      for (const scene of act.scenes) {
        contentScenes.set(scene.id, scene);
      }
    }
    for (const scene of result.artifact.detail.scenes) {
      detailScenes.set(scene.scene_id, scene);
    }
  }

  const contentMap: ContentMap = {
    schema_version: 'loa.content-map.v1',
    lesson_slug: slug,
    acts: curriculum.acts.map((act) => ({
      id: act.id,
      title: act.title,
      summary: act.summary,
      scenes: act.scenes.map((scene) => requiredContentScene(contentScenes, scene.id)),
    })),
  };
  const scenes: SceneMapEntry[] = [];
  for (const act of curriculum.acts) {
    for (const scene of act.scenes) {
      scenes.push(requiredDetailScene(detailScenes, scene.id));
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

function requiredContentScene(scenes: Map<string, SceneMap>, sceneId: string): SceneMap {
  const scene = scenes.get(sceneId);
  if (scene === undefined) throw new Error(`scene-map: merged content map missing scene "${sceneId}"`);
  return scene;
}

function requiredDetailScene(scenes: Map<string, SceneMapEntry>, sceneId: string): SceneMapEntry {
  const scene = scenes.get(sceneId);
  if (scene === undefined) throw new Error(`scene-map: merged detail missing scene "${sceneId}"`);
  return scene;
}
