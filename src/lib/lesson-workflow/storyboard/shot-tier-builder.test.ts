import { describe, expect, it } from 'vitest';
import { buildShotTier } from './shot-tier-builder';
import { StoryboardSchema } from './types';

describe('buildShotTier', () => {
  it('groups ShotPlans by scene id and emits content-map shot rows', () => {
    const storyboard = StoryboardSchema.parse({
      schema_version: 'loa.storyboard.v1',
      plans: [
        plan('scene-1', 'shot-1-1', 'narrative'),
        plan('scene-1', 'shot-1-2', 'interactive-takeover'),
        plan('scene-2', 'shot-2-1', 'character-demo-beat'),
      ],
    });
    const shotTier = buildShotTier(storyboard.plans);

    expect(shotTier.get('scene-1')).toEqual([
      {
        id: 'shot-1-1',
        kind: 'narrative',
        speakers: ['narrator'],
        duration_estimate_s: 1,
        keyframes: [],
      },
      {
        id: 'shot-1-2',
        kind: 'interactive-takeover',
        speakers: ['narrator'],
        duration_estimate_s: 1,
        keyframes: [],
      },
    ]);
    expect(shotTier.get('scene-2')).toHaveLength(1);
  });
});

function plan(sceneId: string, shotId: string, kind: 'narrative' | 'interactive-takeover' | 'character-demo-beat') {
  const base = {
    kind,
    shot_address: { scene_id: sceneId, shot_id: shotId },
    speakers: ['narrator'],
    spoken_lines: [{
      id: `line-${shotId}-1`,
      cast_id: 'narrator',
      text: 'A line.',
      source_sentence_ids: ['sentence-1'],
      audio_slot_id: `audio-${shotId}`,
    }],
    duration_estimate_s: 1,
  };
  if (kind === 'interactive-takeover') {
    return {
      ...base,
      component_id: 'Game',
      layout: { position: [0.5, 0.5, 0] },
    };
  }
  if (kind === 'character-demo-beat') {
    return {
      ...base,
      characters_on_stage: [{ cast_id: 'narrator' }],
      action_cues: [],
    };
  }
  return base;
}
