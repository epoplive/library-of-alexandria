import { describe, expect, it } from 'vitest';
import { validateLessonCorpus } from './ingest-validators';
import { ingestExistingLesson } from './existing-lesson';

describe('ingestExistingLesson', () => {
  it('extracts the looping-llms lesson corpus', async () => {
    const corpus = await ingestExistingLesson(
      'looping-llms',
      {
        kind: 'existing-lesson',
        lesson_ref: 'index.tsx',
        meta_ref: 'meta.json',
        cast_ref: 'characters.json',
        audio_index_ref: 'audio/index.json',
      },
      { now: () => new Date('2026-05-24T00:00:00.000Z') },
    );

    expect(corpus.schema_version).toBe('loa.lesson-corpus.v1');
    expect(corpus.source_kind).toBe('existing-lesson');
    expect(corpus.existing_sections).toHaveLength(12);
    expect(corpus.source_items).toHaveLength(12);
    expect(corpus.cast_seed.map((cast) => cast.id)).toEqual(['narrator', 'banach-goose']);
    expect(corpus.audio_index).toBeDefined();
    if (corpus.audio_index === undefined) throw new Error('expected audio index');
    expect(corpus.audio_index.entries).toHaveLength(73);
    expect(corpus.interactive_inventory.map((entry) => entry.component_id)).toContain('BanachPlayableScene');
    expect(corpus.interactive_inventory.map((entry) => entry.component_id)).toContain('KVCacheArchitect');
    expect(validateLessonCorpus(corpus)).toEqual([]);
  });
});
