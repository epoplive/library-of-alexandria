import { existsSync } from 'node:fs';
import path from 'node:path';
import { INTERACTIVES_REGISTRY as LOOPING_LLMS_INTERACTIVES_REGISTRY } from '../../../../lessons/looping-llms/interactives/registry';
import { DiagnosticSchema, type Diagnostic } from '../diagnostic-schema';
import type { LessonCorpus } from './types';

interface InteractiveRegistryLookup {
  size: number;
  complete: boolean;
  has: (componentId: string) => boolean;
}

const INTERACTIVE_REGISTRIES: Array<{
  slug: string;
  registry: InteractiveRegistryLookup;
}> = [
  {
    slug: 'looping-llms',
    registry: LOOPING_LLMS_INTERACTIVES_REGISTRY,
  },
];

export function validateLessonCorpus(corpus: LessonCorpus): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!corpus.source_items.some((item) => item.status === 'ok')) {
    diagnostics.push(diagnostic({
      code: 'ingest.source.empty',
      path: ['source_items'],
      actual: corpus.source_items.length,
      expected: 'at least one ok source item',
      repair: 'provide at least one source that can be ingested',
      severity: 'error',
    }));
  }

  corpus.source_items.forEach((item, index) => {
    if (item.required && item.status !== 'ok') {
      diagnostics.push(diagnostic({
        code: 'ingest.source.required_failed',
        path: ['source_items', index, 'status'],
        actual: item.status,
        expected: 'ok',
        repair: 'fix the required source or mark it optional before ingest',
        severity: 'error',
      }));
    }
  });

  if (corpus.cast_seed.length === 0) {
    diagnostics.push(diagnostic({
      code: 'ingest.cast_seed.missing',
      path: ['cast_seed'],
      actual: 0,
      expected: 'at least one cast seed',
      repair: 'provide a narrator or lesson cast seed',
      severity: 'error',
    }));
  }

  const interactiveRegistry = interactiveRegistryForSlug(corpus.slug);
  corpus.interactive_inventory.forEach((entry, index) => {
    if (interactiveRegistry !== undefined && interactiveRegistry.complete) {
      if (!interactiveRegistry.has(entry.component_id)) {
        diagnostics.push(diagnostic({
          code: 'ingest.interactive.unknown_component',
          path: ['interactive_inventory', index, 'component_id'],
          actual: entry.component_id,
          expected: `registered component id for lessons/${corpus.slug}`,
          repair: 'add the component to the per-lesson interactives registry',
          severity: 'error',
        }));
      }
      return;
    }

    if (interactiveFileExists(corpus.slug, entry.file_ref)) {
      if (interactiveRegistry !== undefined) {
        diagnostics.push(diagnostic({
          code: 'ingest.interactive.unknown_component',
          path: ['interactive_inventory', index, 'component_id'],
          actual: entry.component_id,
          expected: `registered component id for lessons/${corpus.slug}`,
          repair: 'add the component to the per-lesson interactives registry',
          severity: 'warning',
        }));
      }
      return;
    }

    diagnostics.push(diagnostic({
      code: 'ingest.interactive.unknown_component',
      path: ['interactive_inventory', index, 'file_ref'],
      actual: entry.file_ref,
      expected: `existing component file under lessons/${corpus.slug}`,
      repair: 'register the component with a valid file_ref',
      severity: 'error',
    }));
  });

  const sections = corpus.existing_sections;
  if (sections !== undefined) {
    sections.forEach((section, index) => {
      if (!nonEmpty(section.eyebrow) || !nonEmpty(section.title) || !nonEmpty(section.narration)) {
        diagnostics.push(diagnostic({
          code: 'ingest.section.invalid',
          path: ['existing_sections', index],
          actual: {
            eyebrow: section.eyebrow === undefined ? '' : section.eyebrow,
            title: section.title,
            narration: section.narration,
          },
          expected: 'non-empty eyebrow, title, and narration',
          repair: 'fill the missing Section props in the lesson source',
          severity: 'error',
        }));
      }
    });
  }

  const seenDiscoveryKeys = new Set<string>();
  corpus.discovery_inventory.forEach((discovery, index) => {
    if (seenDiscoveryKeys.has(discovery.key)) {
      diagnostics.push(diagnostic({
        code: 'ingest.discovery.duplicate_key',
        path: ['discovery_inventory', index, 'key'],
        actual: discovery.key,
        expected: 'unique discovery key',
        repair: 'rename or merge duplicate discovery entries',
        severity: 'error',
      }));
    }
    seenDiscoveryKeys.add(discovery.key);
  });

  return diagnostics;
}

function nonEmpty(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

function interactiveRegistryForSlug(slug: string): InteractiveRegistryLookup | undefined {
  for (const entry of INTERACTIVE_REGISTRIES) {
    if (entry.slug === slug) return entry.registry;
  }
  return undefined;
}

function interactiveFileExists(slug: string, fileRef: string | undefined): boolean {
  if (fileRef === undefined) return false;
  const normalized = path.normalize(fileRef);
  if (path.isAbsolute(normalized)) return false;
  if (normalized.startsWith('..')) return false;
  return existsSync(path.join('lessons', slug, normalized));
}

function diagnostic(args: Diagnostic): Diagnostic {
  return DiagnosticSchema.parse(args);
}
