import { DiagnosticSchema, type Diagnostic } from '../diagnostic-schema';

export function mkDiagnostic(args: Diagnostic): Diagnostic {
  return DiagnosticSchema.parse(args);
}

export function formatDiagnostics(diags: Diagnostic[]): string {
  return diags.map((diag) => {
    const path = diag.path.length === 0 ? '$' : diag.path.map(String).join('.');
    const repair = diag.repair === undefined ? '' : ` repair=${diag.repair}`;
    return `[${diag.severity}] ${diag.code} at ${path}: expected=${formatValue(diag.expected)} actual=${formatValue(diag.actual)}${repair}`;
  }).join('\n');
}

function formatValue(value: Diagnostic['actual']): string {
  if (value === undefined) return '<unset>';
  return JSON.stringify(value);
}
