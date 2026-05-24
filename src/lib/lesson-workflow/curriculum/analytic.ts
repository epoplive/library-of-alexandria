import type {
  AudioIndexSnapshot,
  CastSeed,
  ExistingSection,
  LessonCorpus,
  ScriptOutline,
} from '../ingest/types';
import { CurriculumPlanSchema, type CurriculumRunResult, type ScenePlan } from './types';
import { validateCurriculumPlan } from './curriculum-validators';

export interface AnalyticCurriculumArgs {
  corpus: LessonCorpus;
  lessonTitle?: string;
}

export async function runAnalytic(args: AnalyticCurriculumArgs): Promise<CurriculumRunResult> {
  const plan = buildAnalyticPlan(args);
  return {
    plan,
    diagnostics: validateCurriculumPlan(plan, { slug: args.corpus.slug }),
  };
}

export function buildAnalyticPlan(args: AnalyticCurriculumArgs) {
  const corpus = args.corpus;
  const sections = corpus.existing_sections;
  const scenes = sections !== undefined && sections.length > 0
    ? sections.map((section) => sceneFromSection(section, corpus))
    : scenesFromScript(corpus.script_outline, corpus);
  if (scenes.length === 0) throw new Error('curriculum analytic path requires existing_sections or script_outline');

  const totalRuntime = scenes.reduce((sum, scene) => sum + scene.estimated_runtime_s, 0);
  return CurriculumPlanSchema.parse({
    schema_version: 'loa.curriculum.v1',
    acts: [
      {
        id: 'main',
        title: args.lessonTitle === undefined ? titleFromSlug(corpus.slug) : args.lessonTitle,
        summary: scenes.map((scene) => scene.summary).slice(0, 2).join(' '),
        scenes,
      },
    ],
    estimated_total_runtime_s: totalRuntime,
    discovery_seed_plan: corpus.discovery_inventory,
    derivation: 'analytic',
  });
}

function sceneFromSection(section: ExistingSection, corpus: LessonCorpus): ScenePlan {
  const summary = firstSentences(section.narration, 3);
  const firstSentence = firstSentences(section.narration, 1);
  const hasGame = section.child_component_ref !== undefined;
  const sceneBase = {
    id: sceneIdFromSourceSectionId(section.source_section_id),
    title: section.title,
    summary,
    // Deterministic for C8a; an LLM polish pass can improve wording later without changing the contract.
    learning_objective: `Understand ${section.title}: ${firstSentence}`,
    cast_in_scene: castMentionedInNarration(section.narration, corpus.cast_seed),
    has_game: hasGame,
    estimated_runtime_s: estimateSectionRuntime(section, corpus.audio_index),
    source_section_id: section.source_section_id,
  };

  const sceneWithEyebrow = section.eyebrow === undefined
    ? sceneBase
    : {
      ...sceneBase,
      eyebrow: section.eyebrow,
    };
  if (!hasGame) return sceneWithEyebrow;
  return {
    ...sceneWithEyebrow,
    game_component_id: section.child_component_ref,
  };
}

function scenesFromScript(scriptOutline: ScriptOutline | undefined, corpus: LessonCorpus): ScenePlan[] {
  if (scriptOutline === undefined) return [];
  const passageCount = scriptOutline.passages.length;
  const runtimePerPassage = scriptOutline.total_runtime_estimate_s === undefined || passageCount === 0
    ? 0
    : scriptOutline.total_runtime_estimate_s / passageCount;
  return scriptOutline.passages.map((passage) => {
    const summary = firstSentences(passage.text, 2);
    const firstSentence = firstSentences(passage.text, 1);
    const runtime = runtimePerPassage > 0 ? runtimePerPassage : Math.max(1, passage.text.length / 15);
    return {
      id: sceneIdFromSourceSectionId(passage.id),
      title: titleFromPassage(passage.text, passage.intent),
      summary,
      learning_objective: `Understand ${titleFromPassage(passage.text, passage.intent)}: ${firstSentence}`,
      cast_in_scene: castMentionedInNarration(passage.text, corpus.cast_seed),
      has_game: false,
      estimated_runtime_s: Math.max(1, Math.round(runtime)),
      source_digest_ids: [passage.id],
    };
  });
}

function estimateSectionRuntime(section: ExistingSection, audioIndex: AudioIndexSnapshot | undefined): number {
  const matchedEntries = matchingAudioEntries(section, audioIndex);
  const matchedRuntime = matchedEntries.reduce((sum, entry) => sum + audioEntryRuntimeS(entry), 0);
  if (matchedRuntime > 0) return Math.max(1, Math.round(matchedRuntime));
  return Math.max(1, Math.round(section.narration.length / 15));
}

function matchingAudioEntries(section: ExistingSection, audioIndex: AudioIndexSnapshot | undefined): AudioIndexSnapshot['entries'] {
  if (audioIndex === undefined) return [];
  const normalizedNarration = normalizeText(section.narration);
  const exact = audioIndex.entries.filter((entry) => normalizeText(entry.text) === normalizedNarration);
  if (exact.length > 0) return exact;
  return audioIndex.entries.filter((entry) => {
    const normalizedEntry = normalizeText(entry.text);
    return normalizedNarration.includes(normalizedEntry) || normalizedEntry.includes(normalizedNarration);
  });
}

function audioEntryRuntimeS(entry: AudioIndexSnapshot['entries'][number]): number {
  if (entry.timings === undefined) return Math.max(1, entry.text.length / 15);
  const durationMs = entry.timings.reduce((sum, timing) => sum + timing.durationMs, 0);
  return durationMs / 1000;
}

function castMentionedInNarration(narration: string, castSeed: CastSeed[]): string[] {
  const matched: string[] = [];
  for (const cast of castSeed) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(cast.name)}(?:'s)?([^a-z0-9]|$)`, 'i');
    if (pattern.test(narration)) matched.push(cast.id);
  }
  if (matched.length > 0) return uniqueStrings(matched);
  return ['narrator'];
}

function firstSentences(text: string, count: number): string {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return text.trim();
  return sentences.slice(0, count).join(' ');
}

function splitSentences(text: string): string[] {
  const normalized = normalizeText(text);
  if (normalized.length === 0) return [];
  return normalized.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
}

function sceneIdFromSourceSectionId(sourceSectionId: string): string {
  return sourceSectionId.toLowerCase().replace(/_/g, '-').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-/, '').replace(/-$/, '');
}

function titleFromPassage(text: string, intent: ScriptOutline['passages'][number]['intent']): string {
  const first = firstSentences(text, 1).replace(/[.!?]$/, '');
  if (first.length > 0 && first.length <= 80) return first;
  return intent.split('-').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function titleFromSlug(slug: string): string {
  return slug.split('-').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
