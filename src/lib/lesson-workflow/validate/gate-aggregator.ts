import type { ConsistencyReport, ParityReport } from './types';
import {
  AggregatedValidationSchema,
  type AggregatedValidation,
  type HydrateValidationSnapshot,
} from './types';

export interface AggregateValidationArgs {
  parityReport: ParityReport;
  consistencyReport: ConsistencyReport;
  hydrateValidation: HydrateValidationSnapshot;
}

export function aggregateValidation(args: AggregateValidationArgs): AggregatedValidation {
  const mapCompletenessHasErrors = args.consistencyReport.gates.map_completeness
    .some((diagnostic) => diagnostic.severity === 'error');
  const tierV03 = args.hydrateValidation.tier_v0_3 === undefined
    ? 'pending'
    : args.hydrateValidation.tier_v0_3;

  return AggregatedValidationSchema.parse({
    parity: args.parityReport.overall_status,
    self_consistency: args.consistencyReport.overall_status,
    map_completeness: mapCompletenessHasErrors ? 'fail' : 'pass',
    tier_v0_1: args.hydrateValidation.tier_v0_1,
    tier_v0_3: tierV03,
    asset_coverage: args.hydrateValidation.asset_coverage,
    character_sprite_coverage: args.hydrateValidation.character_sprite_coverage,
  });
}

export function requiredGateFailures(validation: AggregatedValidation): string[] {
  const failures: string[] = [];
  if (validation.parity === 'fail') failures.push('parity');
  if (validation.self_consistency === 'fail') failures.push('self_consistency');
  if (validation.map_completeness === 'fail') failures.push('map_completeness');
  return failures;
}
