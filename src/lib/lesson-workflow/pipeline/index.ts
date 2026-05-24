import { STEP_NAMES, type PipelineRunResult, type PipelineStepResult, type PipelineStepRunner, type RunLogEvent, type StepName } from './types';
import { appendRunLogEntry, emptyRunLogEvent, writeRunLogFile } from './run-log';

export {
  StepName,
  STEP_NAMES,
  type DryRunStepDecision,
  type DryRunStepInput,
  type PipelineRunPlan,
  type PipelineRunResult,
  type PipelineStepResult,
  type PipelineStepRunner,
  type RunLogEvent,
  type StepOutputArtifact,
} from './types';
export { computePipelineDryRun, decideDryRunStep, formatDryRunTable } from './dry-run';
export { appendRunLogEntry, emptyRunLogEvent, formatRunLog, formatRunLogEntry, writeRunLogFile } from './run-log';

export interface RunPipelineArgs {
  runId: string;
  logPath: string;
  runners: PipelineStepRunner[];
  now?: () => string;
  timeMs?: () => number;
}

export async function runPipeline(args: RunPipelineArgs): Promise<PipelineRunResult> {
  const now = args.now === undefined ? () => new Date().toISOString() : args.now;
  const timeMs = args.timeMs === undefined ? () => Date.now() : args.timeMs;
  const startedAt = timeMs();
  const results: PipelineStepResult[] = [];
  let stepsRan = 0;
  let stepsShortCircuited = 0;

  await writeRunLogFile(args.logPath, []);

  for (const step of STEP_NAMES) {
    const runner = requireRunner(args.runners, step);
    await appendRunLogEntry(args.logPath, emptyRunLogEvent({
      timestamp: now(),
      step,
      status: 'running',
    }));

    let result: PipelineStepResult;
    try {
      result = await runner.run();
    } catch (error) {
      const failedResult = failedStepResult(step, errorMessage(error));
      results.push(failedResult);
      await appendRunLogEntry(args.logPath, eventForResult(now(), failedResult));
      return failedPipelineResult(args, results, stepsRan, stepsShortCircuited, timeMs() - startedAt, failedResult.error);
    }

    results.push(result);
    if (result.status === 'short-circuit') {
      stepsShortCircuited += 1;
    } else {
      stepsRan += 1;
    }
    await appendRunLogEntry(args.logPath, eventForResult(now(), result));

    if (result.status === 'failed' || hasErrorDiagnostics(result)) {
      return failedPipelineResult(args, results, stepsRan, stepsShortCircuited, timeMs() - startedAt, result.error);
    }
  }

  return {
    runId: args.runId,
    status: 'ok',
    exitCode: 0,
    results,
    stepsRan,
    stepsShortCircuited,
    totalElapsedMs: timeMs() - startedAt,
    logPath: args.logPath,
    error: '',
  };
}

function requireRunner(runners: PipelineStepRunner[], step: StepName): PipelineStepRunner {
  for (const runner of runners) {
    if (runner.step === step) return runner;
  }
  throw new Error(`missing pipeline runner for ${step}`);
}

function eventForResult(timestamp: string, result: PipelineStepResult): RunLogEvent {
  const artifact = result.artifacts[0];
  const artifactPath = artifact === undefined ? '' : artifact.path;
  const artifactHash = artifact === undefined ? '' : artifact.hash;
  return {
    timestamp,
    step: result.step,
    status: result.status,
    elapsedMs: result.elapsedMs,
    artifact: artifactPath,
    hash: artifactHash,
    reason: result.reason,
    error: result.error,
    llmRunPaths: result.llmRunPaths,
  };
}

function failedStepResult(step: StepName, message: string): PipelineStepResult {
  return {
    step,
    status: 'failed',
    reason: '',
    diagnostics: [],
    elapsedMs: 0,
    artifacts: [],
    error: message,
    llmRunPaths: [],
  };
}

function failedPipelineResult(
  args: RunPipelineArgs,
  results: PipelineStepResult[],
  stepsRan: number,
  stepsShortCircuited: number,
  totalElapsedMs: number,
  error: string,
): PipelineRunResult {
  return {
    runId: args.runId,
    status: 'failed',
    exitCode: 1,
    results,
    stepsRan,
    stepsShortCircuited,
    totalElapsedMs,
    logPath: args.logPath,
    error,
  };
}

function hasErrorDiagnostics(result: PipelineStepResult): boolean {
  return result.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
