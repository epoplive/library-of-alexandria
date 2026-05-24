import type { ExistingSection, LessonCorpus } from '../ingest/types';
import { CurriculumPlanSchema, type CurriculumPlan } from './types';

const sourceHash = '0000000000000000000000000000000000000000000000000000000000000000';
const ingestedAt = '2026-05-24T00:00:00.000Z';
const one = 'Ada Lovelace explains looped depth. The narrator frames repeated computation. Learners compare cost.';
const two = 'Grace Hopper shows a training failure. Ada Lovelace diagnoses the gradient curve. The fix is checkpointing.';
const three = 'The narrator closes with cache pressure. Learners predict when looping helps.';

export function existingLessonCorpus(): LessonCorpus {
  return {
    schema_version: 'loa.lesson-corpus.v1',
    slug: 'looping-llms',
    source_kind: 'existing-lesson',
    source_items: [sectionDigest('section_01', one), sectionDigest('section_02', two), sectionDigest('section_03', three)],
    existing_sections: [
      section(0, 'section_01', '01', 'Looped depth', one),
      section(1, 'section_02', '02', 'Training failure', two, 'GradientSurgeon'),
      section(2, 'section_03', undefined, 'Cache pressure', three),
    ],
    cast_seed: [
      { id: 'narrator', name: 'Narrator' },
      { id: 'ada', name: 'Ada Lovelace' },
      { id: 'grace', name: 'Grace Hopper' },
    ],
    audio_index: {
      lesson_slug: 'looping-llms',
      entries: [audioEntry('one', one, 300000), audioEntry('two', two, 300000)],
    },
    interactive_inventory: [{ component_id: 'GradientSurgeon', file_ref: 'games/GradientSurgeon.tsx' }],
    discovery_inventory: [{ key: 'ada', brief: 'Ada Lovelace is a useful historical anchor.', source_section_id: 'section_01' }],
    provenance: provenance(),
  };
}

export function topicCorpus(): LessonCorpus {
  return {
    schema_version: 'loa.lesson-corpus.v1',
    slug: 'looping-llms',
    source_kind: 'topic',
    source_items: [
      {
        id: 'digest-1',
        kind: 'section',
        required: true,
        status: 'ok',
        content: {
          title: 'Looped models',
          text: 'Looped models reuse transformer blocks for latent reasoning.',
          key_points: ['weight sharing', 'adaptive compute'],
        },
      },
    ],
    research_brief: {
      topic: 'Looped language models',
      key_concepts: ['weight sharing', 'adaptive compute'],
      named_figures: [],
      papers: [],
      source_digest_ids: ['digest-1'],
    },
    cast_seed: [{ id: 'narrator', name: 'Narrator' }],
    interactive_inventory: [],
    discovery_inventory: [],
    provenance: provenance(),
  };
}

export function scriptCorpus(): LessonCorpus {
  const text = 'Opening explains why repeated blocks matter. The learner compares loop depth and stack depth.';
  return {
    schema_version: 'loa.lesson-corpus.v1',
    slug: 'looping-llms',
    source_kind: 'script',
    source_items: [{ id: 'script-1', kind: 'script-passage', required: true, status: 'ok', content: { text } }],
    script_outline: {
      total_runtime_estimate_s: 900,
      passages: [{ id: 'script-1', text, intent: 'opener' }],
    },
    cast_seed: [{ id: 'narrator', name: 'Narrator' }],
    interactive_inventory: [],
    discovery_inventory: [],
    provenance: provenance(),
  };
}

export function mixedCorpus(): LessonCorpus {
  const existing = existingLessonCorpus();
  const topic = topicCorpus();
  const sections = existing.existing_sections;
  if (sections === undefined) throw new Error('fixture expected existing_sections');
  return {
    schema_version: 'loa.lesson-corpus.v1',
    slug: 'looping-llms',
    source_kind: 'mixed',
    source_items: [...existing.source_items.slice(0, 2), ...topic.source_items],
    existing_sections: sections.slice(0, 2),
    research_brief: topic.research_brief,
    cast_seed: existing.cast_seed,
    audio_index: existing.audio_index,
    interactive_inventory: existing.interactive_inventory,
    discovery_inventory: existing.discovery_inventory,
    provenance: provenance(),
  };
}

export function validGeneratedPlan(overrides: Partial<CurriculumPlan> = {}): CurriculumPlan {
  return CurriculumPlanSchema.parse({
    schema_version: 'loa.curriculum.v1',
    acts: [{
      id: 'generated',
      title: 'Generated Act',
      summary: 'A generated act about looped models.',
      scenes: [{
        id: 'generated-scene',
        title: 'Generated Scene',
        summary: 'A generated scene about repeated computation.',
        learning_objective: 'Explain how looped depth spends compute without adding parameters.',
        cast_in_scene: ['narrator'],
        has_game: false,
        estimated_runtime_s: 900,
        source_digest_ids: ['digest-1'],
      }],
    }],
    estimated_total_runtime_s: 900,
    discovery_seed_plan: [],
    derivation: 'analytic',
    ...overrides,
  });
}

export function validAnalyticPlan(overrides: Partial<CurriculumPlan> = {}): CurriculumPlan {
  return CurriculumPlanSchema.parse({
    schema_version: 'loa.curriculum.v1',
    acts: [{
      id: 'main',
      title: 'Looped Language Models',
      summary: 'A valid analytic plan.',
      scenes: [{
        id: 'section-01',
        title: 'Looped depth',
        summary: 'Ada Lovelace explains looped depth.',
        learning_objective: 'Explain why repeated blocks create effective depth.',
        cast_in_scene: ['narrator'],
        has_game: false,
        estimated_runtime_s: 900,
        source_section_id: 'section_01',
      }],
    }],
    estimated_total_runtime_s: 900,
    discovery_seed_plan: [{ key: 'ada', brief: 'Ada Lovelace is a useful historical anchor.', source_section_id: 'section_01' }],
    derivation: 'analytic',
    ...overrides,
  });
}

function section(
  index: number,
  sourceSectionId: string,
  eyebrow: string | undefined,
  title: string,
  narration: string,
  childComponentRef?: string,
): ExistingSection {
  const discoveries: ExistingSection['discoveries'] = index === 0
    ? { ada: { brief: 'Ada Lovelace is a useful historical anchor.' } }
    : {};
  const base: ExistingSection = {
    index,
    source_section_id: sourceSectionId,
    title,
    narration,
    discoveries,
    source_offset: { start_line: index * 10 + 1, end_line: index * 10 + 10 },
  };
  if (eyebrow !== undefined) base.eyebrow = eyebrow;
  if (childComponentRef !== undefined) base.child_component_ref = childComponentRef;
  return base;
}

function sectionDigest(id: string, text: string): LessonCorpus['source_items'][number] {
  return { id, kind: 'section', required: true, status: 'ok', content: { title: id, text } };
}

function audioEntry(hash: string, text: string, durationMs: number): NonNullable<LessonCorpus['audio_index']>['entries'][number] {
  return {
    hash,
    text,
    voice_id: 'voice',
    file: `${hash}.mp3`,
    timings: [{ text, startMs: 0, durationMs }],
  };
}

function provenance(): LessonCorpus['provenance'] {
  return { ingested_at: ingestedAt, extractor_version: 'test', source_hash: sourceHash };
}
