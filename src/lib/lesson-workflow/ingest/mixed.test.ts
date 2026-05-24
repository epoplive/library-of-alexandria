import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLessonCorpus } from './ingest-validators';
import { ingestMixed } from './mixed';

describe('ingestMixed', () => {
  it('returns diagnostics through validation for empty inputs', async () => {
    const corpus = await ingestMixed(
      'mixed-demo',
      { kind: 'mixed', inputs: [] },
      { now: () => new Date('2026-05-24T00:00:00.000Z') },
    );

    expect(validateLessonCorpus(corpus).map((diag) => diag.code)).toEqual([
      'ingest.source.empty',
      'ingest.cast_seed.missing',
    ]);
  });

  it('aggregates script and source corpora', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'loa-mixed-'));
    try {
      const scriptPath = path.join(dir, 'script.md');
      const transcriptPath = path.join(dir, 'transcript.txt');
      await writeFile(scriptPath, '# Open\n\nExplain loops.', 'utf8');
      await writeFile(transcriptPath, 'A source transcript.', 'utf8');

      const corpus = await ingestMixed(
        'mixed-demo',
        {
          kind: 'mixed',
          inputs: [
            { kind: 'script', script_path: scriptPath },
            { kind: 'sources', transcripts: [transcriptPath] },
          ],
        },
        { now: () => new Date('2026-05-24T00:00:00.000Z') },
      );

      expect(corpus.source_items.map((item) => item.kind)).toEqual([
        'script-passage',
        'script-passage',
        'transcript',
      ]);
      expect(corpus.script_outline).toBeDefined();
      expect(corpus.research_brief).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
