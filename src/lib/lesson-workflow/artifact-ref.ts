import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ZodSchema } from 'zod';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface ArtifactWriteResult {
  path: string;
  hash: string;
  bytes: number;
}

export function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function readArtifact<T>(path: string, schema: ZodSchema<T>): Promise<T> {
  const raw = await readFile(path, 'utf8');
  const json = JSON.parse(raw);
  return schema.parse(json);
}

export async function writeArtifact<T>(
  path: string,
  value: T,
  schema: ZodSchema<T>,
): Promise<ArtifactWriteResult> {
  const parsed = schema.parse(value);
  const canonical = canonicalJsonStringify(parsed);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, canonical, 'utf8');
  return {
    path,
    hash: sha256(canonical),
    bytes: Buffer.byteLength(canonical, 'utf8'),
  };
}

export async function hashFile(path: string): Promise<string> {
  const bytes = await readFile(path);
  return sha256(bytes);
}

export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(toCanonicalJson(value), null, 2);
}

function toCanonicalJson(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical JSON cannot encode a non-finite number');
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => toCanonicalJson(item));
  if (typeof value === 'object') {
    const out: { [key: string]: JsonValue } = {};
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    for (const [key, entryValue] of entries) {
      if (entryValue === undefined) {
        throw new Error(`canonical JSON cannot encode undefined at key "${key}"`);
      }
      out[key] = toCanonicalJson(entryValue);
    }
    return out;
  }
  throw new Error(`canonical JSON cannot encode value of type ${typeof value}`);
}
