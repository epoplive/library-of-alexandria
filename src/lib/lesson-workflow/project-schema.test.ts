import { describe, expect, it } from 'vitest';
import { setWorkflowStepStatus } from './project-fs';
import { LessonProjectSchema } from './project-schema';

const artifactRef = {
  path: 'artifacts/lesson-input.json',
  hash: '150fa4a1368970506b91eeae148d3d46c90461db433f5a59693e8fb0a4f79597',
  bytes: 187459,
  schema_ref: 'loa.lesson-corpus.v1',
  updated_at: '2026-05-24T07:34:48.729Z',
};

const fixture = {
  schema_version: 'loa.project.v1',
  slug: 'looping-llms',
  identity: {
    lesson_id: 'looping-llms',
    title: 'Looped Language Models',
    summary: 'Depth through repeated shared blocks.',
    tags: ['ai', 'architecture'],
    current_tier: 'v0.1',
    authors: [],
  },
  source: {
    kind: 'existing-lesson',
    sections_ref: 'index.tsx',
  },
  cast_ref: 'characters.json',
  artifacts: {},
  validation: {},
  variations: [],
  funding: {
    production_cost_usd: 0,
    donations_received_usd: 0,
    donation_links: {
      github_sponsors: 'https://github.com/sponsors/epoplive?lesson=looping-llms',
    },
    planned_improvements: [
      {
        tier: 'v0.6',
        cost_usd: 12,
        what: 'Improved voices',
      },
    ],
    ledger: [],
  },
  provenance: {
    authors: [],
    created_at: '2026-05-21T02:00:00.000Z',
    license: 'CC-BY-4.0',
  },
};

const fullyPopulatedFixture = {
  schema_version: 'loa.project.v1',
  slug: 'looping-llms',
  identity: {
    lesson_id: 'looping-llms',
    title: 'Looped Language Models',
    summary: 'Depth through repeated shared blocks.',
    tags: ['ai', 'architecture', 'research'],
    current_tier: 'v0.3',
    authors: ['Brett'],
  },
  source: {
    kind: 'mixed',
    inputs: [
      {
        kind: 'existing-lesson',
        sections_ref: 'index.tsx',
      },
      {
        kind: 'topic',
        subject: 'Looped language models',
        depth_target: 'graduate seminar',
      },
      {
        kind: 'sources',
        source_refs: [
          {
            path: 'artifacts/references/paper.md',
            hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            media_type: 'text/markdown',
          },
        ],
        urls: ['https://example.com/looped-lms'],
        papers: ['artifacts/references/paper.pdf'],
        transcripts: ['artifacts/references/transcript.txt'],
      },
      {
        kind: 'script',
        script_path: 'artifacts/script.md',
      },
    ],
  },
  cast_ref: 'characters.json',
  artifacts: {
    lesson_input: artifactRef,
    curriculum: {
      ...artifactRef,
      path: 'artifacts/curriculum.json',
      schema_ref: 'loa.curriculum.v1',
    },
    scene_map: {
      ...artifactRef,
      path: 'artifacts/scene-map.json',
      schema_ref: 'loa.content-map.v1',
    },
    storyboard: {
      ...artifactRef,
      path: 'artifacts/storyboard.json',
      schema_ref: 'loa.storyboard.v1',
    },
    asset_manifest: {
      ...artifactRef,
      path: 'artifacts/asset-manifest.json',
      schema_ref: 'loa.asset-manifest.v1',
    },
    parity_report: {
      ...artifactRef,
      path: 'artifacts/parity-report.json',
      schema_ref: 'loa.parity-report.v1',
    },
  },
  timeline_ref: {
    path: 'productions/looping-llms.generated.ts',
    hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  },
  workflow: {
    ingest: {
      status: 'ok',
      last_ran_at: '2026-05-24T07:34:48.729Z',
      artifact_ref: 'artifacts/lesson-input.json',
    },
    curriculum: {
      status: 'running',
      last_ran_at: '2026-05-24T07:40:00.000Z',
      artifact_ref: 'artifacts/curriculum.json',
    },
    'scene-map': {
      status: 'pending',
      last_ran_at: '2026-05-24T07:41:00.000Z',
      artifact_ref: 'artifacts/scene-map.json',
    },
    storyboard: {
      status: 'failed',
      last_ran_at: '2026-05-24T07:42:00.000Z',
      artifact_ref: 'artifacts/storyboard.json',
    },
  },
  validation: {
    parity: 'n/a',
    self_consistency: 'pass',
    map_completeness: 'pass',
    tier_v0_1: 'pass',
    tier_v0_3: 'pending',
    asset_coverage: 'partial',
    character_sprite_coverage: 'missing',
  },
  variations: [
    {
      id: 'baseline',
      tier: 'v0.1',
      purpose: 'Reference lesson',
      slot_refs: ['opening'],
    },
    {
      id: 'upgrade',
      tier: 'v0.3',
      purpose: 'Higher fidelity variant',
      slot_refs: ['opening', 'closing'],
      differs_from: 'baseline',
    },
  ],
  funding: {
    production_cost_usd: 10,
    donations_received_usd: 4,
    donation_links: {
      github_sponsors: 'https://github.com/sponsors/epoplive?lesson=looping-llms',
      ko_fi: 'https://ko-fi.com/epoplive',
      open_collective: 'https://opencollective.com/epoplive',
    },
    planned_improvements: [
      {
        slot: 'voice',
        tier: 'v0.6',
        cost_usd: 12,
        what: 'Improved voices',
      },
    ],
    ledger: [
      {
        date: '2026-05-24T07:00:00.000Z',
        kind: 'spend',
        amount_usd: 10,
        slot: 'voice',
        note: 'Voice prototype',
        donor: 'Brett',
      },
    ],
  },
  provenance: {
    authors: ['Brett'],
    created_at: '2026-05-21T02:00:00.000Z',
    updated_at: '2026-05-24T07:34:48.729Z',
    license: 'CC-BY-4.0',
    forked_from: 'looping-transformers',
  },
  meta_overrides: {
    audience: 'visual learners',
    featured: true,
    credits: {
      editor: 'Brett',
    },
  },
  locked: {
    at: '2026-05-24T08:00:00.000Z',
    by: 'brett',
    reason: 'Release candidate',
  },
};

describe('LessonProjectSchema', () => {
  it('parses a valid manifest fixture', () => {
    expect(LessonProjectSchema.parse(fixture).slug).toBe('looping-llms');
  });

  it('round-trips a fully populated manifest through JSON', () => {
    const parsed = LessonProjectSchema.parse(JSON.parse(JSON.stringify(fullyPopulatedFixture)));
    expect(parsed).toEqual(fullyPopulatedFixture);
  });

  it('validates setWorkflowStepStatus helper output', () => {
    const project = LessonProjectSchema.parse(fixture);
    const next = setWorkflowStepStatus(
      project,
      'ingest',
      'ok',
      'artifacts/lesson-input.json',
      '2026-05-24T07:34:48.729Z',
    );

    expect(LessonProjectSchema.parse(next).workflow).toEqual({
      ingest: {
        status: 'ok',
        last_ran_at: '2026-05-24T07:34:48.729Z',
        artifact_ref: 'artifacts/lesson-input.json',
      },
    });
  });

  it('rejects invalid manifest data', () => {
    expect(() => LessonProjectSchema.parse({
      ...fixture,
      slug: 'Looping LLMs',
    })).toThrow();
  });

  it('rejects removed production ref aliases', () => {
    expect(() => LessonProjectSchema.parse({
      ...fixture,
      generated_production_ref: 'productions/looping-llms.generated.ts',
    })).toThrow();
  });

  it('rejects old existing-lesson source field names', () => {
    expect(() => LessonProjectSchema.parse({
      ...fixture,
      source: {
        kind: 'existing-lesson',
        lesson_ref: 'index.tsx',
        meta_ref: 'meta.json',
        cast_ref: 'characters.json',
        audio_index_ref: 'audio/index.json',
      },
    })).toThrow();
  });

  it('surfaces unsupported source kinds from the schema boundary', () => {
    const result = LessonProjectSchema.safeParse({
      ...fixture,
      source: {
        kind: 'unknown',
      },
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected unsupported source failure');
    expect(JSON.stringify(result.error.issues)).toContain('ingest.source.unsupported');
  });
});
