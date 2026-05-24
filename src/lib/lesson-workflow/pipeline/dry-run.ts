import type { HashEntry } from '../lockfile-schema';
import {
  STEP_NAMES,
  type DryRunStepDecision,
  type DryRunStepInput,
  type PipelineRunPlan,
  type StepName,
} from './types';

export function decideDryRunStep(input: DryRunStepInput): DryRunStepDecision {
  if (input.lockEntry.status !== 'completed') {
    return {
      step: input.step,
      status: 'would-run',
      reason: `lock-status ${input.lockEntry.status}`,
    };
  }

  if (!hashEntriesEqual(input.currentInputHashes, input.lockEntry.input_hashes)) {
    return {
      step: input.step,
      status: 'would-run',
      reason: `hash-mismatch (${input.step} input hash differs)`,
    };
  }

  if (!input.outputsPresent) {
    return {
      step: input.step,
      status: 'would-run',
      reason: 'output-missing',
    };
  }

  return {
    step: input.step,
    status: 'short-circuit',
    reason: 'hash-match',
  };
}

export function computePipelineDryRun(inputs: DryRunStepInput[]): PipelineRunPlan {
  const decisions: DryRunStepDecision[] = [];
  let upstreamStep: StepName | undefined;

  for (const step of STEP_NAMES) {
    if (upstreamStep !== undefined) {
      decisions.push({
        step,
        status: 'would-run',
        reason: `downstream of ${upstreamStep}`,
      });
      continue;
    }

    const input = requireDryRunInput(inputs, step);
    const decision = decideDryRunStep(input);
    decisions.push(decision);
    if (decision.status === 'would-run') upstreamStep = step;
  }

  const wouldRunCount = decisions.filter((decision) => decision.status === 'would-run').length;
  return {
    decisions,
    wouldRunCount,
    shortCircuitCount: decisions.length - wouldRunCount,
  };
}

export function formatDryRunTable(slug: string, plan: PipelineRunPlan): string {
  const rows = [
    ['step', 'status', 'reason'],
    ['---', '---', '---'],
    ...plan.decisions.map((decision) => [
      decision.step,
      decision.status,
      decision.reason,
    ]),
  ];
  const widths = columnWidths(rows);
  const lines = rows.map((row) => formatRow(row, widths));
  const wouldRunStepLabel = plan.wouldRunCount === 1 ? 'step' : 'steps';
  const shortCircuitStepLabel = plan.shortCircuitCount === 1 ? 'step' : 'steps';

  return [
    `loa produce ${slug} (dry-run)`,
    '',
    ...lines,
    '',
    `${plan.wouldRunCount} ${wouldRunStepLabel} would run; ${plan.shortCircuitCount} ${shortCircuitStepLabel} would short-circuit.`,
  ].join('\n');
}

function requireDryRunInput(inputs: DryRunStepInput[], step: StepName): DryRunStepInput {
  for (const input of inputs) {
    if (input.step === step) return input;
  }
  throw new Error(`missing dry-run input for ${step}`);
}

function hashEntriesEqual(left: HashEntry[], right: HashEntry[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = left.slice().sort(compareHashEntries);
  const sortedRight = right.slice().sort(compareHashEntries);
  for (let index = 0; index < sortedLeft.length; index += 1) {
    if (sortedLeft[index].path !== sortedRight[index].path) return false;
    if (sortedLeft[index].hash !== sortedRight[index].hash) return false;
  }
  return true;
}

function compareHashEntries(left: HashEntry, right: HashEntry): number {
  return left.path.localeCompare(right.path);
}

function columnWidths(rows: string[][]): number[] {
  const widths: number[] = [];
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      const current = widths[index];
      if (current === undefined || row[index].length > current) {
        widths[index] = row[index].length;
      }
    }
  }
  return widths;
}

function formatRow(row: string[], widths: number[]): string {
  const parts: string[] = [];
  for (let index = 0; index < row.length; index += 1) {
    const width = widths[index];
    parts.push(row[index].padEnd(width));
  }
  return parts.join(' ');
}
