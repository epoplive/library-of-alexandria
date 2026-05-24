import { z } from 'zod';
import type { CastMember, Production, AssetManifest, ProductionId } from '@/lib/lattice';
import type { InteractivesRegistry } from '@/lib/interactives';
import { composeProduction } from '../composers/runner';
import type { ContentMap } from '../project-schema';
import type { Diagnostic } from '../diagnostic-schema';
import type { Storyboard } from '../storyboard/types';
import { emitProductionModule } from './production-emitter';
import { validateComposeArtifacts } from './compose-validators';

const COMPOSE_TIMESTAMP = '1970-01-01T00:00:00.000Z';

export interface RunComposeArgs {
  slug: string;
  storyboard: Storyboard;
  contentMap: ContentMap;
  cast: CastMember[];
  interactives: InteractivesRegistry;
  productionId: ProductionId;
}

export interface RunComposeResult {
  production: Production;
  manifest: AssetManifest;
  generatedTs: string;
  diagnostics: Diagnostic[];
}

export async function runCompose(args: RunComposeArgs): Promise<RunComposeResult> {
  const result = composeProduction(args.storyboard.plans, {
    production_id: args.productionId,
    cast: args.cast,
    interactives: args.interactives,
    manifest_view: {
      production_id: args.productionId,
      slots: {},
    },
    contentMap: args.contentMap,
  });
  const production = deterministicProduction(result.production);
  const manifest = deterministicManifest(result.manifest);
  const diagnostics = [
    ...result.diagnostics,
    ...validateComposeArtifacts({ production, manifest }),
  ];
  const generatedTs = emitProductionModule({
    slug: args.slug,
    production,
    manifest,
  });
  return {
    production,
    manifest,
    generatedTs,
    diagnostics,
  };
}

function deterministicProduction(production: Production): Production {
  const { updated_at, ...provenance } = production.provenance;
  void updated_at;
  return {
    ...production,
    provenance: {
      ...provenance,
      created_at: COMPOSE_TIMESTAMP,
    },
  };
}

function deterministicManifest(manifest: AssetManifest): AssetManifest {
  const { updated_at, ...stableManifest } = manifest;
  void updated_at;
  return stableManifest;
}

const TierSchema = z.custom((value) => {
  if (typeof value !== 'string') return false;
  if (value === 'v0.1') return true;
  if (value === 'v0.3') return true;
  if (value === 'v0.6') return true;
  if (value === 'v0.9') return true;
  if (value === 'v1.0') return true;
  return /^mastery:\d+$/.test(value);
});

const ArtifactRefSchema = z.object({
  url: z.string().optional(),
  path: z.string().optional(),
  hash: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  mime: z.string().optional(),
}).strict();

const AudioTimingSchema = z.object({
  text: z.string(),
  startMs: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
}).strict();

const TakeSchema = z.object({
  tier: TierSchema,
  artifact: ArtifactRefSchema.optional(),
  status: z.enum(['pending', 'queued', 'rendering', 'ready', 'failed', 'superseded']),
  cost_usd: z.number().nonnegative().optional(),
  timings: z.array(AudioTimingSchema).optional(),
  provenance: z.object({
    provider: z.string(),
    model: z.string().optional(),
    voice_id: z.string().optional(),
    prompt: z.string().optional(),
    seed: z.union([z.number(), z.string()]).optional(),
  }).strict().optional(),
  rendered_at: z.string().datetime({ offset: true }).optional(),
  note: z.string().optional(),
}).strict();

const SlotSelectionSchema = z.union([
  z.literal('best-available'),
  z.literal('lowest-tier'),
  z.object({
    fixed: TierSchema,
  }).strict(),
]);

const SlotSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'audio-vo',
    'audio-dialogue',
    'audio-music',
    'audio-sfx',
    'image',
    'video',
    'model-3d',
    'sprite-sheet',
    'lookup-text',
  ]),
  description: z.string().min(1),
  takes: z.array(TakeSchema),
  selection: SlotSelectionSchema.optional(),
}).strict();

const LedgerEntrySchema = z.object({
  date: z.string().datetime({ offset: true }),
  kind: z.enum(['spend', 'donation']),
  amount_usd: z.number(),
  slot: z.string().optional(),
  note: z.string().optional(),
  donor: z.string().optional(),
}).strict();

export const AssetManifestSchema = z.object({
  production_id: z.string().min(1),
  slots: z.record(SlotSchema),
  ledger: z.array(LedgerEntrySchema).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
}).strict().describe('loa.asset-manifest.v1');

export { emitProductionModule } from './production-emitter';
export { validateComposeArtifacts, tscFailedDiagnostic } from './compose-validators';
