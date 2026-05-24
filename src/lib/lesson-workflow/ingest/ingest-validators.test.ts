import { describe, expect, it } from 'vitest';
import { validateLessonCorpus } from './ingest-validators';
import { minimalCorpus } from './test-fixtures';

describe('validateLessonCorpus', () => {
  it('accepts a minimal valid corpus', () => {
    expect(validateLessonCorpus(minimalCorpus())).toEqual([]);
  });

  it('reports required quarantined sources', () => {
    const diagnostics = validateLessonCorpus(minimalCorpus({
      source_items: [
        {
          id: 'source-1',
          kind: 'url',
          required: true,
          status: 'quarantined',
          quarantine: {
            code: 'fetch-failed',
            message: 'request failed',
            excluded_reason: 'network failure',
          },
        },
      ],
    }));

    expect(diagnostics.map((diag) => diag.code)).toContain('ingest.source.required_failed');
  });

  it('reports invalid existing sections and duplicate discoveries', () => {
    const diagnostics = validateLessonCorpus(minimalCorpus({
      existing_sections: [
        {
          index: 0,
          source_section_id: 's1',
          eyebrow: '01',
          title: 'Title',
          narration: '',
          discoveries: {},
          source_offset: { start_line: 1, end_line: 5 },
        },
      ],
      discovery_inventory: [
        { key: 'fixed point', brief: 'one', source_section_id: 's1' },
        { key: 'fixed point', brief: 'two', source_section_id: 's2' },
      ],
    }));

    expect(diagnostics.map((diag) => diag.code)).toEqual([
      'ingest.section.invalid',
      'ingest.discovery.duplicate_key',
    ]);
  });

  it('reports missing interactive component files', () => {
    const diagnostics = validateLessonCorpus(minimalCorpus({
      interactive_inventory: [
        {
          component_id: 'MissingGame',
          file_ref: 'games/MissingGame.tsx',
        },
      ],
    }));

    expect(diagnostics.map((diag) => diag.code)).toEqual(['ingest.interactive.unknown_component']);
  });
});
