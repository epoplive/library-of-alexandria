import type { SceneId, ShotId } from '@/lib/lattice';

export type {
  CastId,
  FundingBlock,
  ISODateTime,
  Provenance,
  SceneId,
  ShotId,
  SlotId,
  Tier,
} from '@/lib/lattice';

export interface ShotAddress {
  scene_id: SceneId;
  shot_id: ShotId;
}

export const WORKFLOW_STEPS = [
  'ingest',
  'curriculum',
  'scene-map',
  'storyboard',
  'compose',
  'hydrate',
  'validate',
] as const;

export type WorkflowStep = typeof WORKFLOW_STEPS[number];

export const SOURCE_KINDS = [
  'existing-lesson',
  'topic',
  'sources',
  'script',
  'mixed',
] as const;

export type SourceKind = typeof SOURCE_KINDS[number];

export const ARTIFACT_KINDS = [
  'lesson-input',
  'curriculum',
  'scene-map',
  'storyboard',
  'asset-manifest',
  'parity-report',
] as const;

export type ArtifactKind = typeof ARTIFACT_KINDS[number];
