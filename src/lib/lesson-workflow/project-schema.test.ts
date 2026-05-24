import { describe, expect, it } from 'vitest';
import { LessonProjectSchema } from './project-schema';

const fixture = {
  schema_version: 'loa.project.v1',
  slug: 'looping-llms',
  identity: {
    title: 'Looped Language Models',
    summary: 'Depth through repeated shared blocks.',
    tags: ['ai', 'architecture'],
    tier: 'v0.1',
    created_at: '2026-05-21T02:00:00.000Z',
  },
  source: {
    kind: 'existing-lesson',
    lesson_ref: 'index.tsx',
    meta_ref: 'meta.json',
    cast_ref: 'characters.json',
    audio_index_ref: 'audio/index.json',
  },
  meta_ref: 'meta.json',
  cast_ref: 'characters.json',
  audio_index_ref: 'audio/index.json',
  artifacts: {},
  generated_production_ref: 'productions/looping-llms.generated.ts',
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

describe('LessonProjectSchema', () => {
  it('parses a valid manifest fixture', () => {
    expect(LessonProjectSchema.parse(fixture).slug).toBe('looping-llms');
  });

  it('rejects invalid manifest data', () => {
    expect(() => LessonProjectSchema.parse({
      ...fixture,
      slug: 'Looping LLMs',
    })).toThrow();
  });
});
