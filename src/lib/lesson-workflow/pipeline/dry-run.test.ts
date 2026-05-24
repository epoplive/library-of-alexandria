import { describe, expect, it } from 'vitest';
import type { HashEntry, StepLockEntry } from '../lockfile-schema';
import { computePipelineDryRun, formatDryRunTable } from './dry-run';
import { STEP_NAMES, StepName, type DryRunStepInput } from './types';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

describe('computePipelineDryRun', () => {
  it('marks hash matches as short-circuit and cascades after the first would-run step', () => {
    const matchingHashes = [{ path: 'input.json', hash: HASH_A }];
    const mismatchedHashes = [{ path: 'input.json', hash: HASH_B }];
    const inputs = STEP_NAMES.map((step) => dryRunInput({
      step,
      lockEntry: completedEntry(matchingHashes),
      currentInputHashes: step === StepName.Storyboard ? mismatchedHashes : matchingHashes,
      outputsPresent: true,
    }));

    const plan = computePipelineDryRun(inputs);

    expect(plan.wouldRunCount).toBe(4);
    expect(plan.shortCircuitCount).toBe(3);
    expect(plan.decisions.map((decision) => decision.status)).toEqual([
      'short-circuit',
      'short-circuit',
      'short-circuit',
      'would-run',
      'would-run',
      'would-run',
      'would-run',
    ]);
    expect(plan.decisions[3].reason).toBe('hash-mismatch (storyboard input hash differs)');
    expect(plan.decisions[4].reason).toBe('downstream of storyboard');
  });

  it('formats the dry-run table with aligned columns and counts', () => {
    const matchingHashes = [{ path: 'input.json', hash: HASH_C }];
    const inputs = STEP_NAMES.map((step) => dryRunInput({
      step,
      lockEntry: completedEntry(matchingHashes),
      currentInputHashes: matchingHashes,
      outputsPresent: true,
    }));

    const plan = computePipelineDryRun(inputs);
    const table = formatDryRunTable('looping-llms', plan);

    expect(table).toContain('loa produce looping-llms (dry-run)');
    expect(table).toContain('ingest     short-circuit hash-match');
    expect(table).toContain('0 steps would run; 7 steps would short-circuit.');
  });
});

function dryRunInput(args: DryRunStepInput): DryRunStepInput {
  return args;
}

function completedEntry(inputHashes: HashEntry[]): StepLockEntry {
  return {
    status: 'completed',
    input_hashes: inputHashes,
    output_hashes: [{ path: 'output.json', hash: HASH_C }],
    diagnostics: [],
    elapsed_ms: 1,
    completed_at: '2026-05-24T00:00:00.000Z',
  };
}
