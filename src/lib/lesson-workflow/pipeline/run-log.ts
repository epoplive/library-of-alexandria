import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RunLogEvent } from './types';

export function emptyRunLogEvent(args: {
  timestamp: string;
  step: RunLogEvent['step'];
  status: RunLogEvent['status'];
}): RunLogEvent {
  return {
    timestamp: args.timestamp,
    step: args.step,
    status: args.status,
    elapsedMs: 0,
    artifact: '',
    hash: '',
    reason: '',
    error: '',
    llmRunPaths: [],
  };
}

export function formatRunLogEntry(event: RunLogEvent): string {
  const fields = [
    `step=${event.step}`,
    `status=${event.status}`,
  ];
  if (event.elapsedMs > 0) fields.push(`elapsed_ms=${event.elapsedMs}`);
  if (event.artifact.length > 0) fields.push(`artifact=${event.artifact}`);
  if (event.hash.length > 0) fields.push(`hash=${event.hash}`);
  if (event.reason.length > 0) fields.push(`reason=${quoteIfNeeded(event.reason)}`);
  if (event.error.length > 0) fields.push(`error="${escapeQuotedValue(event.error)}"`);
  if (event.llmRunPaths.length > 0) fields.push(`llm_runs=${event.llmRunPaths.join(',')}`);
  return `[${event.timestamp}] ${fields.join(' ')}`;
}

export function formatRunLog(events: RunLogEvent[]): string {
  if (events.length === 0) return '';
  return `${events.map((event) => formatRunLogEntry(event)).join('\n')}\n`;
}

export async function writeRunLogFile(logPath: string, events: RunLogEvent[]): Promise<void> {
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, formatRunLog(events), 'utf8');
}

export async function appendRunLogEntry(logPath: string, event: RunLogEvent): Promise<void> {
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, `${formatRunLogEntry(event)}\n`, 'utf8');
}

function quoteIfNeeded(value: string): string {
  if (!value.includes(' ')) return value;
  return `"${escapeQuotedValue(value)}"`;
}

function escapeQuotedValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
