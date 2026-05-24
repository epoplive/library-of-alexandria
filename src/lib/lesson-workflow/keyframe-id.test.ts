import { describe, expect, it } from 'vitest';
import { defaultMapKeyframeId } from './project-schema';

describe('defaultMapKeyframeId', () => {
  it('is deterministic for the same scene, shot, time, and label', () => {
    const first = defaultMapKeyframeId('scene-a', 'shot-one', 0.5, 'Opening');
    const second = defaultMapKeyframeId('scene-a', 'shot-one', 0.5, 'Opening');

    expect(first).toBe(second);
  });

  it('includes scene_id in the hash basis because shot ids are scene-local', () => {
    expect(defaultMapKeyframeId('scene-a', 'shot-one', 0))
      .not.toBe(defaultMapKeyframeId('scene-b', 'shot-one', 0));
  });
});
