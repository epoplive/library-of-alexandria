import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestScript } from './script';

describe('ingestScript', () => {
  it('splits markdown scripts into classified passages', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'loa-script-'));
    try {
      const scriptPath = path.join(dir, 'script.md');
      await writeFile(scriptPath, [
        '# Opening',
        '',
        'This is the main explanation.',
        '',
        'Aside: this is a side path.',
        '',
        '# Closing',
      ].join('\n'), 'utf8');

      const corpus = await ingestScript(
        'script-demo',
        { kind: 'script', script_path: scriptPath },
        { now: () => new Date('2026-05-24T00:00:00.000Z') },
      );

      if (corpus.script_outline === undefined) throw new Error('expected script outline');
      expect(corpus.script_outline.passages.map((passage) => passage.intent)).toEqual([
        'opener',
        'explanation',
        'aside',
        'closer',
      ]);
      expect(corpus.source_items.map((item) => item.kind)).toEqual([
        'script-passage',
        'script-passage',
        'script-passage',
        'script-passage',
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
