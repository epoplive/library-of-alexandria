import type { AssetManifest, Production } from '@/lib/lattice';
import { DiagnosticSchema, type Diagnostic } from '../diagnostic-schema';

export interface ValidateComposeArtifactsArgs {
  production: Production;
  manifest: AssetManifest;
}

export interface TscFailedDiagnosticArgs {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function validateComposeArtifacts(args: ValidateComposeArtifactsArgs): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (args.production.scenes.length === 0) {
    diagnostics.push(diagnostic({
      code: 'compose.production.empty',
      path: ['production', 'scenes'],
      actual: 0,
      expected: 'at least one Scene',
      repair: 'check storyboard plans and composer output; compose should not emit an empty Production.',
      severity: 'error',
    }));
  }

  // composer.manifest.takes_attached is already emitted by the composer-runner.
  void args.manifest;
  return diagnostics;
}

export function tscFailedDiagnostic(args: TscFailedDiagnosticArgs): Diagnostic {
  const output = args.stderr.length > 0 ? args.stderr : args.stdout;
  const repair = output.length > 0 ? output : 'run npx tsc --noEmit from the project root';
  return diagnostic({
    code: 'compose.tsc.failed',
    path: ['productions'],
    actual: {
      exit_code: args.exitCode,
      stderr: args.stderr,
      stdout: args.stdout,
    },
    expected: 'generated TypeScript module compiles with npx tsc --noEmit',
    repair,
    severity: 'error',
  });
}

function diagnostic(args: Diagnostic): Diagnostic {
  return DiagnosticSchema.parse(args);
}
