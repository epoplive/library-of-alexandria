import { describe, expect, it } from 'vitest';
import { validateLessonCorpus } from './ingest-validators';
import { minimalCorpus } from './test-fixtures';

describe('validateLessonCorpus', () => {
  it('accepts a minimal valid corpus', () => {
    expect(validateLessonCorpus(minimalCorpus({
      interactive_inventory: [],
    }))).toEqual([]);
  });

  it('warns when a component file exists but the lesson registry is empty', () => {
    const diagnostics = validateLessonCorpus(minimalCorpus());

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'ingest.interactive.unknown_component',
      path: ['interactive_inventory', 0, 'component_id'],
      actual: 'BanachPlayableScene',
      severity: 'warning',
    });
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
      interactive_inventory: [],
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

  it('reports missing interactive component files as errors', () => {
    const diagnostics = validateLessonCorpus(minimalCorpus({
      interactive_inventory: [
        {
          component_id: 'MissingGame',
          file_ref: 'games/MissingGame.tsx',
        },
      ],
    }));

    expect(diagnostics.map((diag) => diag.code)).toEqual(['ingest.interactive.unknown_component']);
    expect(diagnostics.map((diag) => diag.severity)).toEqual(['error']);
  });
});
