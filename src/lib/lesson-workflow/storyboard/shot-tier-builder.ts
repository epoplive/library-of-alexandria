import type { SceneId } from '@/lib/lattice';
import type { ShotMap } from '../project-schema';
import type { ShotPlan } from './types';

export function buildShotTier(plans: ShotPlan[]): Map<SceneId, ShotMap[]> {
  const shotTierByScene = new Map<SceneId, ShotMap[]>();

  for (const plan of plans) {
    const sceneId = plan.shot_address.scene_id;
    const existing = shotTierByScene.get(sceneId);
    const shotMap: ShotMap = {
      id: plan.shot_address.shot_id,
      kind: plan.kind,
      speakers: plan.speakers,
      duration_estimate_s: plan.duration_estimate_s,
      keyframes: [],
    };
    if (existing === undefined) {
      shotTierByScene.set(sceneId, [shotMap]);
    } else {
      existing.push(shotMap);
    }
  }

  return shotTierByScene;
}
