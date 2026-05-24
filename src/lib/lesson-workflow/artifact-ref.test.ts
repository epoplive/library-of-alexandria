import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  canonicalJsonStringify,
  readArtifact,
  sha256,
  writeArtifact,
} from './artifact-ref';

describe('artifact-ref', () => {
  it('stringifies JSON with deterministic key order', () => {
    const first = canonicalJsonStringify({
      b: 2,
      a: {
        d: 4,
        c: 3,
      },
    });
    const second = canonicalJsonStringify({
      a: {
        c: 3,
        d: 4,
      },
      b: 2,
    });

    expect(first).toBe(second);
    expect(first).toBe(`{
  "a": {
    "c": 3,
    "d": 4
  },
  "b": 2
}`);
  });

  it('produces stable hashes from canonical JSON', () => {
    const first = canonicalJsonStringify({ b: 2, a: 1 });
    const second = canonicalJsonStringify({ a: 1, b: 2 });

    expect(sha256(first)).toBe(sha256(second));
  });

  it('validates and round-trips written artifacts', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'loa-artifact-'));
    try {
      const schema = z.object({
        id: z.string(),
        count: z.number().int(),
      }).strict();
      const artifactPath = path.join(dir, 'artifact.json');
      const result = await writeArtifact(artifactPath, { count: 2, id: 'demo' }, schema);
      const read = await readArtifact(artifactPath, schema);

      expect(read).toEqual({ count: 2, id: 'demo' });
      expect(result.path).toBe(artifactPath);
      expect(result.hash).toBe(sha256(canonicalJsonStringify(read)));
      expect(result.bytes).toBe(Buffer.byteLength(canonicalJsonStringify(read), 'utf8'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
