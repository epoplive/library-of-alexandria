import type { Diagnostic } from '../diagnostic-schema';
import type { HashEntry, StepLockEntry } from '../lockfile-schema';

export enum StepName {
  Ingest = 'ingest',
  Curriculum = 'curriculum',
  SceneMap = 'scene-map',
  Storyboard = 'storyboard',
  Compose = 'compose',
  Hydrate = 'hydrate',
  Validate = 'validate',
}

export const STEP_NAMES: readonly StepName[] = [
  StepName.Ingest,
  StepName.Curriculum,
  StepName.SceneMap,
  StepName.Storyboard,
  StepName.Compose,
  StepName.Hydrate,
  StepName.Validate,
];

export type DryRunStatus = 'short-circuit' | 'would-run';
export type PipelineStepStatus = 'ok' | 'short-circuit' | 'failed';
export type RunLogStatus = 'running' | PipelineStepStatus;

export interface StepOutputArtifact {
  path: string;
  hash: string;
}

export interface DryRunStepInput {
  step: StepName;
  lockEntry: StepLockEntry;
  currentInputHashes: HashEntry[];
  outputsPresent: boolean;
}

export interface DryRunStepDecision {
  step: StepName;
  status: DryRunStatus;
  reason: string;
}

export interface PipelineRunPlan {
  decisions: DryRunStepDecision[];
  wouldRunCount: number;
  shortCircuitCount: number;
}

export interface PipelineStepResult {
  step: StepName;
  status: PipelineStepStatus;
  reason: string;
  diagnostics: Diagnostic[];
  elapsedMs: number;
  artifacts: StepOutputArtifact[];
  error: string;
  llmRunPaths: string[];
}

export interface PipelineStepRunner {
  step: StepName;
  run: () => Promise<PipelineStepResult>;
}

export interface RunLogEvent {
  timestamp: string;
  step: StepName;
  status: RunLogStatus;
  elapsedMs: number;
  artifact: string;
  hash: string;
  reason: string;
  error: string;
  llmRunPaths: string[];
}

export interface PipelineRunResult {
  runId: string;
  status: 'ok' | 'failed';
  exitCode: 0 | 1;
  results: PipelineStepResult[];
  stepsRan: number;
  stepsShortCircuited: number;
  totalElapsedMs: number;
  logPath: string;
  error: string;
}
