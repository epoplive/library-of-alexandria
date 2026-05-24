import path from 'node:path';
import type {
  AssetManifest,
  AudioTiming,
  CastId,
  CastMember,
  Slot,
  SlotId,
  Take,
} from '@/lib/lattice';
import type { Diagnostic } from '../diagnostic-schema';
import type { Storyboard, SpokenLine } from '../storyboard/types';
import type { AudioIndex, AudioIndexEntry, MissingAudioAsset } from './types';

interface AudioMatch {
  entry: AudioIndexEntry;
  timings: AudioTiming[] | undefined;
  matchedTimingRow: boolean;
}

export interface ResolveAudioArgs {
  manifest: AssetManifest;
  storyboard: Storyboard;
  audioIndex: AudioIndex;
  cast: CastMember[];
  lessonDir: string;
  lessonSlug: string;
}

export interface AudioResolveResult {
  manifest: AssetManifest;
  attachedSlotIds: Set<SlotId>;
  missing: MissingAudioAsset[];
  diagnostics: Diagnostic[];
}

export function resolveAudio(args: ResolveAudioArgs): AudioResolveResult {
  const slots = cloneSlots(args.manifest);
  const spokenLineBySlotId = firstSpokenLineBySlotId(args.storyboard);
  const castById = castMembersById(args.cast);
  const attachedSlotIds = new Set<SlotId>();
  const missing: MissingAudioAsset[] = [];
  const diagnostics: Diagnostic[] = [];
  const sortedSlotIds = Object.keys(slots).sort((left, right) => left.localeCompare(right));

  for (const slotId of sortedSlotIds) {
    const slot = slots[slotId];
    if (!isAudioSlot(slot)) continue;
    const spokenLine = spokenLineBySlotId.get(slot.id);
    if (spokenLine === undefined) continue;
    const castMember = castById.get(spokenLine.cast_id);
    if (castMember === undefined) {
      missing.push({
        slot_id: slot.id,
        kind: slot.kind,
        cast_id: spokenLine.cast_id,
        voice_id: '',
        text: spokenLine.text,
      });
      continue;
    }
    const voiceId = castMember.voice_profile.voice_id;
    if (hasReadyV01Take(slot)) continue;

    const match = findAudioMatch(args.audioIndex, voiceId, spokenLine.text);
    if (match === undefined) {
      missing.push({
        slot_id: slot.id,
        kind: slot.kind,
        cast_id: spokenLine.cast_id,
        voice_id: voiceId,
        text: spokenLine.text,
      });
      continue;
    }

    if (!match.matchedTimingRow && match.entry.timings === undefined) {
      diagnostics.push({
        code: 'hydrate.audio.timings_dropped',
        path: ['audio_index', 'entries', match.entry.hash, 'timings'],
        actual: undefined,
        expected: 'AudioTiming[] for matched audio entry',
        repair: 'regenerate audio/index.json with sentence timings for this file.',
        severity: 'warning',
      });
    }

    const take = buildAudioTake({
      entry: match.entry,
      timings: match.timings,
      castMember,
      lessonDir: args.lessonDir,
      lessonSlug: args.lessonSlug,
    });
    slots[slot.id] = {
      ...slot,
      takes: [...slot.takes, take],
    };
    attachedSlotIds.add(slot.id);
  }

  return {
    manifest: {
      ...args.manifest,
      slots,
    },
    attachedSlotIds,
    missing,
    diagnostics,
  };
}

export function hasReadyV01Take(slot: Slot): boolean {
  return slot.takes.some((take) => take.tier === 'v0.1' && take.status === 'ready');
}

function isAudioSlot(slot: Slot): slot is Slot & { kind: 'audio-vo' | 'audio-dialogue' } {
  return slot.kind === 'audio-vo' || slot.kind === 'audio-dialogue';
}

function firstSpokenLineBySlotId(storyboard: Storyboard): Map<SlotId, SpokenLine> {
  const bySlotId = new Map<SlotId, SpokenLine>();
  for (const plan of storyboard.plans) {
    for (const spokenLine of plan.spoken_lines) {
      if (!bySlotId.has(spokenLine.audio_slot_id)) {
        bySlotId.set(spokenLine.audio_slot_id, spokenLine);
      }
    }
  }
  return bySlotId;
}

function castMembersById(cast: CastMember[]): Map<CastId, CastMember> {
  const byId = new Map<CastId, CastMember>();
  for (const castMember of cast) {
    byId.set(castMember.id, castMember);
  }
  return byId;
}

function findAudioMatch(audioIndex: AudioIndex, voiceId: string, text: string): AudioMatch | undefined {
  for (const entry of audioIndex.entries) {
    if (entry.voice_id !== voiceId) continue;
    if (entry.text === text) {
      return {
        entry,
        timings: cloneTimings(entry.timings),
        matchedTimingRow: false,
      };
    }
    if (entry.timings === undefined) continue;
    for (const timing of entry.timings) {
      if (timing.text === text) {
        return {
          entry,
          timings: [cloneTiming(timing)],
          matchedTimingRow: true,
        };
      }
    }
  }
  return undefined;
}

function buildAudioTake(args: {
  entry: AudioIndexEntry;
  timings: AudioTiming[] | undefined;
  castMember: CastMember;
  lessonDir: string;
  lessonSlug: string;
}): Take {
  const artifactPath = path.join(args.lessonDir, 'audio', args.entry.file);
  const provenance: NonNullable<Take['provenance']> = {
    provider: args.castMember.voice_profile.service,
    voice_id: args.castMember.voice_profile.voice_id,
  };
  if (args.castMember.voice_profile.voice_model !== undefined) {
    provenance.model = args.castMember.voice_profile.voice_model;
  }
  const take: Take = {
    tier: 'v0.1',
    status: 'ready',
    artifact: {
      url: `lessons/${args.lessonSlug}/audio/${args.entry.file}`,
      path: artifactPath,
      hash: args.entry.hash,
    },
    provenance,
  };
  if (args.timings !== undefined) {
    take.timings = cloneTimings(args.timings);
  }
  return take;
}

function cloneSlots(manifest: AssetManifest): { [slotId: string]: Slot } {
  const slots: { [slotId: string]: Slot } = {};
  for (const slotId of Object.keys(manifest.slots)) {
    const slot = manifest.slots[slotId];
    slots[slotId] = {
      ...slot,
      takes: slot.takes.slice(),
    };
  }
  return slots;
}

function cloneTimings(timings: AudioTiming[] | undefined): AudioTiming[] | undefined {
  if (timings === undefined) return undefined;
  return timings.map((timing) => cloneTiming(timing));
}

function cloneTiming(timing: AudioTiming): AudioTiming {
  return {
    text: timing.text,
    startMs: timing.startMs,
    durationMs: timing.durationMs,
  };
}
