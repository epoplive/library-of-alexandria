import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLessonCorpus } from './ingest-validators';
import { ingestSources } from './sources';

describe('ingestSources', () => {
  it('keeps an optional quarantined URL beside a good URL', async () => {
    const server = await startFixtureServer();
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('expected TCP server address');
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const corpus = await ingestSources(
        'sources-demo',
        {
          kind: 'sources',
          source_refs: [
            { path: `${baseUrl}/good`, required: true },
            { path: `${baseUrl}/missing`, required: false },
          ],
        },
        { now: () => new Date('2026-05-24T00:00:00.000Z') },
      );

      expect(corpus.source_items.map((item) => item.status)).toEqual(['ok', 'quarantined']);
      expect(validateLessonCorpus(corpus).map((diag) => diag.code)).toEqual([]);
    } finally {
      await closeServer(server);
    }
  });

  it('reads checked-in transcript paths and quarantines PDFs without a parser', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'loa-sources-'));
    try {
      const transcript = path.join(dir, 'transcript.md');
      await writeFile(transcript, '# Transcript\n\nLooped models reuse weights.', 'utf8');
      const corpus = await ingestSources(
        'sources-demo',
        {
          kind: 'sources',
          transcripts: [transcript],
          papers: [path.join(dir, 'paper.pdf')],
        },
        { now: () => new Date('2026-05-24T00:00:00.000Z') },
      );

      const transcriptItem = corpus.source_items.find((item) => item.kind === 'transcript');
      const paperItem = corpus.source_items.find((item) => item.kind === 'paper');
      if (transcriptItem === undefined) throw new Error('expected transcript source item');
      if (paperItem === undefined) throw new Error('expected paper source item');
      expect(transcriptItem.status).toBe('ok');
      expect(paperItem.status).toBe('quarantined');
      const quarantine = paperItem.quarantine;
      if (quarantine === undefined) throw new Error('expected PDF quarantine');
      expect(quarantine.excluded_reason).toBe('pdf parsing not yet available');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

async function startFixtureServer(): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.url === '/good') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><title>Good Source</title><main><p>Looped depth works.</p></main></html>');
      return;
    }
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('broken');
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
