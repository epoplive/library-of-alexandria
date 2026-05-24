import type { ActPlan, CurriculumPlan, ScenePlan } from '../curriculum/types';
import { CurriculumPlanSchema } from '../curriculum/types';
import type { LessonCorpus } from '../ingest/types';
import type { LlmClient } from '../llm/types';
import type { ContentMap, SceneMap } from '../project-schema';
import { SceneMapArtifactSchema, type SceneMapArtifact, type SceneMapEntry } from '../scene-map/types';
import { runAnalytic, type StoryboardRunResult } from './analytic';
import { runGenerative } from './generative';
import { buildShotTier } from './shot-tier-builder';
import { validateStoryboard } from './storyboard-validators';
import { StoryboardSchema, type ShotPlan } from './types';

export interface MixedStoryboardArgs {
  corpus: LessonCorpus;
  curriculum: CurriculumPlan;
  sceneMap: SceneMapArtifact;
  llm?: LlmClient;
}

type ScenePredicate = (scene: ScenePlan) => boolean;

export async function runMixed(args: MixedStoryboardArgs): Promise<StoryboardRunResult> {
  const analyticSourceSectionIds = analyticSourceSectionIdSet(args.corpus);
  const analyticPlan = curriculumSubset(args.curriculum, (scene) => isAnalyticScene(scene, analyticSourceSectionIds));
  const generatedPlan = curriculumSubset(args.curriculum, (scene) => !isAnalyticScene(scene, analyticSourceSectionIds));
  const results: StoryboardRunResult[] = [];

  if (hasScenes(analyticPlan)) {
    results.push(await runAnalytic({
      corpus: args.corpus,
      curriculum: analyticPlan,
      sceneMap: sceneMapSubset(args.sceneMap, analyticPlan),
    }));
  }

  if (hasScenes(generatedPlan)) {
    if (args.llm === undefined) throw new Error('storyboard: mixed generative path requires an LlmClient');
    results.push(await runGenerative({
      corpus: args.corpus,
      curriculum: generatedPlan,
      sceneMap: sceneMapSubset(args.sceneMap, generatedPlan),
      llm: args.llm,
    }));
  }

  if (results.length === 0) throw new Error('storyboard: mixed corpus has no analytic or generative scenes');

  const storyboard = StoryboardSchema.parse({
    schema_version: 'loa.storyboard.v1',
    plans: mergePlans(args.curriculum, results),
  });
  return {
    storyboard,
    shotTierByScene: buildShotTier(storyboard.plans),
    diagnostics: validateStoryboard(storyboard, {
      corpus: args.corpus,
      sceneMap: args.sceneMap,
    }),
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

function sceneMapSubset(sceneMap: SceneMapArtifact, curriculum: CurriculumPlan): SceneMapArtifact {
  const contentScenes = contentScenesById(sceneMap);
  const detailScenes = detailScenesById(sceneMap);
  const contentMap: ContentMap = {
    schema_version: 'loa.content-map.v1',
    lesson_slug: sceneMap.content_map.lesson_slug,
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

function mergePlans(curriculum: CurriculumPlan, results: StoryboardRunResult[]): ShotPlan[] {
  const plansByScene = new Map<string, ShotPlan[]>();
  for (const result of results) {
    for (const plan of result.storyboard.plans) {
      const sceneId = plan.shot_address.scene_id;
      const plans = plansByScene.get(sceneId);
      if (plans === undefined) {
        plansByScene.set(sceneId, [plan]);
      } else {
        plans.push(plan);
      }
    }
  }

  const merged: ShotPlan[] = [];
  for (const act of curriculum.acts) {
    for (const scene of act.scenes) {
      const plans = plansByScene.get(scene.id);
      if (plans === undefined) throw new Error(`storyboard: merged storyboard missing scene "${scene.id}"`);
      merged.push(...plans);
    }
  }
  return merged;
}

function contentScenesById(sceneMap: SceneMapArtifact): Map<string, SceneMap> {
  const scenes = new Map<string, SceneMap>();
  for (const act of sceneMap.content_map.acts) {
    for (const scene of act.scenes) {
      scenes.set(scene.id, scene);
    }
  }
  return scenes;
}

function detailScenesById(sceneMap: SceneMapArtifact): Map<string, SceneMapEntry> {
  const scenes = new Map<string, SceneMapEntry>();
  for (const scene of sceneMap.detail.scenes) {
    scenes.set(scene.scene_id, scene);
  }
  return scenes;
}

function requiredContentScene(scenes: Map<string, SceneMap>, sceneId: string): SceneMap {
  const scene = scenes.get(sceneId);
  if (scene === undefined) throw new Error(`storyboard: scene-map content missing scene "${sceneId}"`);
  return scene;
}

function requiredDetailScene(scenes: Map<string, SceneMapEntry>, sceneId: string): SceneMapEntry {
  const scene = scenes.get(sceneId);
  if (scene === undefined) throw new Error(`storyboard: scene-map detail missing scene "${sceneId}"`);
  return scene;
}
