import type { AssetManifest, Production } from '@/lib/lattice';
import type { Diagnostic } from '../diagnostic-schema';
import type { LessonCorpus } from '../ingest/types';
import type { LessonProject } from '../project-schema';
import type { SceneMapArtifact } from '../scene-map/types';
import type { Storyboard } from '../storyboard/types';
import { aggregateValidation, requiredGateFailures } from './gate-aggregator';
import { buildParityReport } from './parity';
import { buildConsistencyReport } from './self-consistency';
import {
  HydrateValidationSnapshotSchema,
  type AggregatedValidation,
  type ConsistencyReport,
  type HydrateValidationSnapshot,
  type InteractiveRegistrySummary,
  type ParityReport,
} from './types';

export interface RunValidateArgs {
  lessonSlug: string;
  project: LessonProject;
  corpus: LessonCorpus;
  sceneMap: SceneMapArtifact;
  storyboard: Storyboard;
  production: Production;
  manifest: AssetManifest;
  interactives: InteractiveRegistrySummary;
}

export interface RunValidateResult {
  parityReport: ParityReport;
  consistencyReport: ConsistencyReport;
  validation: AggregatedValidation;
  requiredGateFailures: string[];
  diagnostics: Diagnostic[];
}

export function runValidate(args: RunValidateArgs): RunValidateResult {
  const hydrateValidation = hydrateValidationFromProject(args.project);
  const parityReport = buildParityReport({
    lessonSlug: args.lessonSlug,
    corpus: args.corpus,
    sceneMap: args.sceneMap,
    storyboard: args.storyboard,
    interactives: args.interactives,
  });
  const consistencyReport = buildConsistencyReport({
    lessonSlug: args.lessonSlug,
    production: args.production,
    manifest: args.manifest,
    contentMap: args.sceneMap.content_map,
    interactives: args.interactives,
  });
  const validation = aggregateValidation({
    parityReport,
    consistencyReport,
    hydrateValidation,
  });
  return {
    parityReport,
    consistencyReport,
    validation,
    requiredGateFailures: requiredGateFailures(validation),
    diagnostics: [
      ...parityReport.per_section.flatMap((section) => section.diagnostics),
      ...consistencyDiagnostics(consistencyReport),
    ],
  };
}

function hydrateValidationFromProject(project: LessonProject): HydrateValidationSnapshot {
  const validation = project.validation;
  if (validation === undefined) {
    throw new Error('validate requires hydrate validation in project.validation');
  }
  if (validation.tier_v0_1 === undefined) {
    throw new Error('validate requires project.validation.tier_v0_1 from hydrate');
  }
  if (validation.asset_coverage === undefined) {
    throw new Error('validate requires project.validation.asset_coverage from hydrate');
  }
  if (validation.character_sprite_coverage === undefined) {
    throw new Error('validate requires project.validation.character_sprite_coverage from hydrate');
  }

  const base = {
    tier_v0_1: validation.tier_v0_1,
    asset_coverage: validation.asset_coverage,
    character_sprite_coverage: validation.character_sprite_coverage,
  };
  if (validation.tier_v0_3 === undefined) {
    return HydrateValidationSnapshotSchema.parse(base);
  }
  return HydrateValidationSnapshotSchema.parse({
    ...base,
    tier_v0_3: validation.tier_v0_3,
  });
}

function consistencyDiagnostics(report: ConsistencyReport): Diagnostic[] {
  return [
    ...report.gates.cast_unknown,
    ...report.gates.slot_unknown,
    ...report.gates.shot_silent,
    ...report.gates.action_method_unknown,
    ...report.gates.interactive_unregistered,
    ...report.gates.transition_non_adjacent,
    ...report.gates.field_overlap,
    ...report.gates.map_completeness,
  ];
}

export { formatParityReport, formatValidateReport } from './cli-printer';
export { aggregateValidation, requiredGateFailures } from './gate-aggregator';
export { buildParityReport } from './parity';
export { buildConsistencyReport } from './self-consistency';
export {
  AggregatedValidationSchema,
  ConsistencyReportSchema,
  HydrateValidationSnapshotSchema,
  InteractiveRegistrySummarySchema,
  ParityReportSchema,
} from './types';
