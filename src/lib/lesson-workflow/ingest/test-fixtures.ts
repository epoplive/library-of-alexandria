import type { LessonCorpus } from './types';

export function minimalCorpus(overrides: Partial<LessonCorpus> = {}): LessonCorpus {
  return {
    schema_version: 'loa.lesson-corpus.v1',
    slug: 'looping-llms',
    source_kind: 'existing-lesson',
    source_items: [
      {
        id: 'section-1',
        kind: 'section',
        required: true,
        status: 'ok',
        content: {
          text: 'Narration.',
        },
      },
    ],
    cast_seed: [
      {
        id: 'narrator',
        name: 'Narrator',
      },
    ],
    interactive_inventory: [
      {
        component_id: 'BanachPlayableScene',
        file_ref: 'games/BanachPlayableScene.tsx',
      },
    ],
    discovery_inventory: [],
    provenance: {
      ingested_at: '2026-05-24T00:00:00.000Z',
      extractor_version: 'test',
      source_hash: '0000000000000000000000000000000000000000000000000000000000000000',
    },
    ...overrides,
  };
}
