import { sha256 } from '../artifact-ref';
import type { CurriculumPlan } from '../curriculum/types';
import type { Diagnostic } from '../diagnostic-schema';
import type { AudioIndexSnapshot, LessonCorpus } from '../ingest/types';
import type { SceneMapArtifact, SceneMapEntry, SentenceRecord } from '../scene-map/types';
import { buildShotTier } from './shot-tier-builder';
import { validateStoryboard } from './storyboard-validators';
import {
  StoryboardSchema,
  type ActionCueHint,
  type CharacterOnStage,
  type ShotPlan,
  type SpokenLine,
  type Storyboard,
} from './types';

export interface AnalyticStoryboardArgs {
  corpus: LessonCorpus;
  curriculum: CurriculumPlan;
  sceneMap: SceneMapArtifact;
}

export interface StoryboardRunResult {
  storyboard: Storyboard;
  shotTierByScene: ReturnType<typeof buildShotTier>;
  diagnostics: Diagnostic[];
}

interface AudioMatch {
  slotId: string;
  durationS: number;
  resolved: boolean;
}

export async function runAnalytic(args: AnalyticStoryboardArgs): Promise<StoryboardRunResult> {
  void args.curriculum;
  const storyboard = buildAnalyticStoryboard(args);
  const shotTierByScene = buildShotTier(storyboard.plans);
  return {
    storyboard,
    shotTierByScene,
    diagnostics: validateStoryboard(storyboard, {
      corpus: args.corpus,
      sceneMap: args.sceneMap,
    }),
  };
}

export function buildAnalyticStoryboard(args: AnalyticStoryboardArgs): Storyboard {
  const plans: ShotPlan[] = [];
  for (let sceneIndex = 0; sceneIndex < args.sceneMap.detail.scenes.length; sceneIndex += 1) {
    const scene = args.sceneMap.detail.scenes[sceneIndex];
    for (let beatIndex = 0; beatIndex < scene.beats.length; beatIndex += 1) {
      plans.push(planForBeat({
        corpus: args.corpus,
        scene,
        sceneIndex,
        beatIndex,
      }));
    }
  }
  return StoryboardSchema.parse({
    schema_version: 'loa.storyboard.v1',
    plans,
  });
}

function planForBeat(args: {
  corpus: LessonCorpus;
  scene: SceneMapEntry;
  sceneIndex: number;
  beatIndex: number;
}): ShotPlan {
  const beat = args.scene.beats[args.beatIndex];
  const sceneNumber = args.sceneIndex + 1;
  const beatNumber = args.beatIndex + 1;
  const shotId = `shot-${sceneNumber}-${beatNumber}`;
  const speakers = beat.speaker_ids.length === 0 ? ['narrator'] : beat.speaker_ids;
  const spokenLines = spokenLinesForBeat({
    shotId,
    speakerId: speakers[0],
    scene: args.scene,
    sourceSentenceIds: beat.source_sentence_ids,
    audioIndex: args.corpus.audio_index,
  });
  const base = {
    shot_address: {
      scene_id: args.scene.scene_id,
      shot_id: shotId,
    },
    source_beat_id: beat.id,
    speakers,
    spoken_lines: spokenLines,
    duration_estimate_s: durationEstimate(spokenLines, args.corpus.audio_index),
  };
  const withTransition = transitionFor(args.sceneIndex, args.beatIndex) === undefined
    ? base
    : {
      ...base,
      transition_in: transitionFor(args.sceneIndex, args.beatIndex),
    };
  const withBackground = args.beatIndex === 0
    ? {
      ...withTransition,
      background_intent: defaultBackgroundIntent(),
    }
    : withTransition;

  if (args.sceneIndex === 0 && args.beatIndex === 0 && args.scene.eyebrow !== undefined && args.scene.title.length > 0) {
    return {
      kind: 'narrator-opener',
      ...withBackground,
      scene_eyebrow: args.scene.eyebrow,
      scene_title: args.scene.title,
    };
  }

  if (beat.intent === 'demo' && beat.visual_role === 'game' && args.scene.interactive_ref !== undefined) {
    return {
      kind: 'interactive-takeover',
      ...withBackground,
      component_id: args.scene.interactive_ref.component_id,
      layout: {
        position: [0.5, 0.5, 0],
        size: {
          width: 0.8,
          height: 0.8,
        },
        z_order: 10,
        opacity: 1,
      },
    };
  }

  if (beat.visual_role === 'character' || beat.speaker_ids.length > 1) {
    return {
      kind: 'character-demo-beat',
      ...withBackground,
      characters_on_stage: charactersOnStage(beat.speaker_ids),
      action_cues: [] satisfies ActionCueHint[],
    };
  }

  return {
    kind: 'narrative',
    ...withBackground,
  };
}

function spokenLinesForBeat(args: {
  shotId: string;
  speakerId: string;
  scene: SceneMapEntry;
  sourceSentenceIds: string[];
  audioIndex: AudioIndexSnapshot | undefined;
}): SpokenLine[] {
  const lines: SpokenLine[] = [];
  const usedSlotIds = new Set<string>();
  for (let index = 0; index < args.sourceSentenceIds.length; index += 1) {
    const sentenceId = args.sourceSentenceIds[index];
    const sentence = requiredSentence(args.scene, sentenceId);
    const lineId = `line-${args.shotId}-${index + 1}`;
    const audioMatch = audioMatchForSentence(sentence, args.audioIndex, args.shotId, lineId);
    const audioSlotId = usedSlotIds.has(audioMatch.slotId)
      ? pendingAudioSlotId(args.shotId, lineId)
      : audioMatch.slotId;
    usedSlotIds.add(audioSlotId);
    lines.push({
      id: lineId,
      cast_id: args.speakerId,
      text: sentence.canonical_text,
      source_sentence_ids: [sentence.id],
      audio_slot_id: audioSlotId,
    });
  }
  return lines;
}

function requiredSentence(scene: SceneMapEntry, sentenceId: string): SentenceRecord {
  for (const sentence of scene.sentences) {
    if (sentence.id === sentenceId) return sentence;
  }
  throw new Error(`storyboard analytic path missing sentence "${sentenceId}" in scene "${scene.scene_id}"`);
}

function audioMatchForSentence(
  sentence: SentenceRecord,
  audioIndex: AudioIndexSnapshot | undefined,
  shotId: string,
  lineId: string,
): AudioMatch {
  const entry = audioEntryForSentence(sentence, audioIndex);
  if (entry !== undefined) {
    return {
      slotId: `audio-${entry.hash.slice(0, 16)}`,
      durationS: audioEntryDurationS(entry),
      resolved: true,
    };
  }
  return {
    slotId: pendingAudioSlotId(shotId, lineId),
    durationS: Math.max(1, sentence.canonical_text.length / 15),
    resolved: false,
  };
}

function pendingAudioSlotId(shotId: string, lineId: string): string {
  return `audio-pending-${sha256(`${shotId}|${lineId}`).slice(0, 16)}`;
}

function audioEntryForSentence(
  sentence: SentenceRecord,
  audioIndex: AudioIndexSnapshot | undefined,
): AudioIndexSnapshot['entries'][number] | undefined {
  if (audioIndex === undefined) return undefined;
  const normalizedSentence = normalizeAudioText(sentence.canonical_text);
  for (const entry of audioIndex.entries) {
    if (entry.text === sentence.canonical_text) return entry;
    if (normalizeAudioText(entry.text) === normalizedSentence) return entry;
  }
  return undefined;
}

function durationEstimate(lines: SpokenLine[], audioIndex: AudioIndexSnapshot | undefined): number {
  let total = 0;
  for (const line of lines) {
    const audioMatch = audioMatchForLine(line, audioIndex);
    total += audioMatch.durationS;
  }
  return total;
}

function audioMatchForLine(line: SpokenLine, audioIndex: AudioIndexSnapshot | undefined): AudioMatch {
  const sentence: SentenceRecord = {
    id: line.source_sentence_ids[0],
    canonical_text: line.text,
    normalized_text: normalizeAudioText(line.text),
  };
  return audioMatchForSentence(sentence, audioIndex, 'duration', line.id);
}

function audioEntryDurationS(entry: AudioIndexSnapshot['entries'][number]): number {
  const timings = entry.timings;
  if (timings === undefined || timings.length === 0) return Math.max(1, entry.text.length / 15);
  const last = timings[timings.length - 1];
  return (last.startMs + last.durationMs) / 1000;
}

function transitionFor(sceneIndex: number, beatIndex: number): ShotPlan['transition_in'] {
  if (sceneIndex === 0 && beatIndex === 0) return undefined;
  if (beatIndex === 0) {
    return {
      kind: 'cross-dissolve',
      duration_ms: 600,
    };
  }
  return {
    kind: 'cut',
    duration_ms: 0,
  };
}

function defaultBackgroundIntent(): ShotPlan['background_intent'] {
  return {
    kind: 'gradient',
    stops: [
      {
        offset: 0,
        color: '#0f172a',
      },
      {
        offset: 0.52,
        color: '#1f4f46',
      },
      {
        offset: 1,
        color: '#f2c14e',
      },
    ],
    drift: {
      speed_s: 30,
      direction: 'right',
    },
  };
}

function charactersOnStage(speakerIds: string[]): CharacterOnStage[] {
  return speakerIds.map((castId) => ({
    cast_id: castId,
  }));
}

function normalizeAudioText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}
