import type { Diagnostic } from '../diagnostic-schema';
import type { AggregatedValidation, ConsistencyReport, ParityReport } from './types';

const CONSISTENCY_GATES = [
  'cast_unknown',
  'slot_unknown',
  'shot_silent',
  'action_method_unknown',
  'interactive_unregistered',
  'transition_non_adjacent',
  'field_overlap',
  'map_completeness',
] as const;

type ConsistencyGate = typeof CONSISTENCY_GATES[number];

export function formatValidateReport(
  slug: string,
  parityReport: ParityReport,
  consistencyReport: ConsistencyReport,
  validation: AggregatedValidation,
): string {
  const lines = [
    `loa validate ${slug}`,
    '='.repeat(`loa validate ${slug}`.length),
    ...formatParityLines(parityReport),
    'Self-consistency',
    ...formatConsistencyLines(consistencyReport),
    'Tier readiness',
    `${indent()}${pad('v0.1', 26)}${validation.tier_v0_1}`,
    `${indent()}${pad('v0.3', 26)}${validation.tier_v0_3}`,
    'Asset coverage',
    `${indent()}${pad('audio', 26)}${validation.asset_coverage}`,
    `${indent()}${pad('character sprites', 26)}${validation.character_sprite_coverage}`,
    '',
    overallLine(validation),
  ];
  return lines.join('\n');
}

export function formatParityReport(slug: string, parityReport: ParityReport): string {
  const lines = [
    `loa parity ${slug}`,
    '='.repeat(`loa parity ${slug}`.length),
    ...formatParityLines(parityReport),
  ];
  return lines.join('\n');
}

function formatParityLines(report: ParityReport): string[] {
  const sourceLabel = report.source_kind === 'existing-lesson'
    ? 'existing-lesson'
    : report.source_kind;
  const lines = [`Parity                  (${sourceLabel})`];
  if (!report.applicable) {
    lines.push(`${indent()}n/a`);
    return lines;
  }
  for (let index = 0; index < report.per_section.length; index += 1) {
    const section = report.per_section[index];
    const label = `Section ${String(index + 1).padStart(2, '0')} · ${section.title}`;
    lines.push(`${indent()}${pad(label, 48)}${pad(section.status, 8)}${sectionSuffix(section.diagnostics, section.sentence_counts.matched, section.sentence_counts.source)}`);
    for (const diagnostic of section.diagnostics) {
      lines.push(formatDiagnostic(diagnostic));
    }
  }
  return lines;
}

function formatConsistencyLines(report: ConsistencyReport): string[] {
  const lines: string[] = [];
  for (const gate of CONSISTENCY_GATES) {
    const diagnostics = report.gates[gate];
    lines.push(`${indent()}${pad(gate, 27)}${gateStatus(diagnostics)}`);
    for (const diagnostic of diagnostics) {
      lines.push(formatDiagnostic(diagnostic));
    }
  }
  return lines;
}

function gateStatus(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return 'clean';
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;
  if (errors > 0) return `fail   (${formatCounts(errors, warnings)})`;
  return `warn   (${formatCounts(errors, warnings)})`;
}

function sectionSuffix(diagnostics: Diagnostic[], matched: number, source: number): string {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;
  if (errors > 0) return `(${formatCounts(errors, warnings)})`;
  if (warnings > 0) return `(${matched}/${source} sentences, ${warnings} warnings)`;
  return `(${matched}/${source} sentences)`;
}

function formatCounts(errors: number, warnings: number): string {
  const parts: string[] = [];
  if (errors === 1) parts.push('1 error');
  if (errors > 1) parts.push(`${errors} errors`);
  if (warnings === 1) parts.push('1 warning');
  if (warnings > 1) parts.push(`${warnings} warnings`);
  return parts.join(', ');
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  const path = diagnostic.path.length === 0 ? '$' : diagnostic.path.map(String).join('.');
  const details = diagnosticDetails(diagnostic);
  const spacer = details.length === 0 ? '' : `  ${details}`;
  return `${indent(2)}[${diagnostic.severity}] ${pad(diagnostic.code, 36)}  ${path}${spacer}`;
}

function diagnosticDetails(diagnostic: Diagnostic): string {
  const details: string[] = [];
  if (diagnostic.expected !== undefined) details.push(`expected=${formatValue(diagnostic.expected)}`);
  if (diagnostic.actual !== undefined) details.push(`actual=${formatValue(diagnostic.actual)}`);
  if (diagnostic.repair !== undefined) details.push(`repair=${diagnostic.repair}`);
  return details.join(' ');
}

function formatValue(value: string | number | boolean | null | unknown[] | object): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function overallLine(validation: AggregatedValidation): string {
  const failures = validationFailures(validation);
  if (failures.length === 0) return 'Overall: PASS';
  return `Overall: FAIL (${failures.join(', ')})`;
}

function validationFailures(validation: AggregatedValidation): string[] {
  const failures: string[] = [];
  if (validation.parity === 'fail') failures.push('parity');
  if (validation.self_consistency === 'fail') failures.push('self_consistency');
  if (validation.map_completeness === 'fail') failures.push('map_completeness');
  if (validation.tier_v0_1 === 'fail') failures.push('tier_v0_1');
  if (validation.tier_v0_3 === 'fail') failures.push('tier_v0_3');
  if (validation.asset_coverage !== 'ok') failures.push('asset_coverage');
  if (validation.character_sprite_coverage !== 'ok') failures.push('character_sprite_coverage');
  return failures;
}

function pad(value: string, width: number): string {
  return value.padEnd(width, ' ');
}

function indent(level = 1): string {
  return '  '.repeat(level);
}
