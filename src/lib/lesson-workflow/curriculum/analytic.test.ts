import { describe, expect, it } from 'vitest';
import { runAnalytic } from './analytic';
import { existingLessonCorpus } from './test-fixtures';

describe('runAnalytic', () => {
  it('maps existing lesson sections to one scene each', async () => {
    const corpus = existingLessonCorpus();
    const result = await runAnalytic({
      corpus,
      lessonTitle: 'Fixture Lesson',
    });

    expect(result.plan.derivation).toBe('analytic');
    expect(result.plan.acts).toHaveLength(1);
    expect(result.plan.acts[0].title).toBe('Fixture Lesson');
    expect(result.plan.acts[0].scenes).toHaveLength(3);
    expect(result.plan.discovery_seed_plan).toEqual(corpus.discovery_inventory);

    const scenes = result.plan.acts[0].scenes;
    expect(scenes[0].id).toBe('section-01');
    expect(scenes[0].source_section_id).toBe('section_01');
    expect(scenes[0].title).toBe('Looped depth');
    expect(scenes[0].eyebrow).toBe('01');
    expect(scenes[0].learning_objective).toContain('Understand Looped depth');
    expect(scenes[0].cast_in_scene).toContain('ada');
    expect(scenes[0].estimated_runtime_s).toBe(300);

    expect(scenes[1].has_game).toBe(true);
    expect(scenes[1].game_component_id).toBe('GradientSurgeon');
    expect(scenes[1].cast_in_scene).toEqual(['ada', 'grace']);

    expect(scenes[2].estimated_runtime_s).toBeGreaterThan(0);
    expect(scenes[2].learning_objective.length).toBeGreaterThan(0);
  });
});
