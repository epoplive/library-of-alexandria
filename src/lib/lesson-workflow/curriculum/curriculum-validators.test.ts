import { describe, expect, it } from 'vitest';
import { validateCurriculumPlan } from './curriculum-validators';
import { validAnalyticPlan } from './test-fixtures';

describe('validateCurriculumPlan', () => {
  it('accepts a valid curriculum plan', () => {
    expect(validateCurriculumPlan(validAnalyticPlan(), { slug: 'looping-llms' })).toEqual([]);
  });

  it('reports missing learning objectives', () => {
    const base = validAnalyticPlan();
    const plan = validAnalyticPlan({
      acts: [
        {
          ...base.acts[0],
          scenes: [
            {
              ...base.acts[0].scenes[0],
              learning_objective: ' ',
            },
          ],
        },
      ],
    });

    expect(validateCurriculumPlan(plan, { slug: 'looping-llms' }).map((diag) => diag.code)).toEqual([
      'curriculum.scene.missing_objective',
    ]);
  });

  it('reports runtime outside the v0.1 range', () => {
    const plan = validAnalyticPlan({
      estimated_total_runtime_s: 60,
    });

    expect(validateCurriculumPlan(plan, { slug: 'looping-llms' }).map((diag) => diag.code)).toEqual([
      'curriculum.runtime.out_of_range',
    ]);
  });

  it('reports uncited discovery seeds', () => {
    const plan = validAnalyticPlan({
      discovery_seed_plan: [
        {
          key: 'missing',
          brief: 'Missing citation.',
          source_section_id: 'section_99',
        },
      ],
    });

    expect(validateCurriculumPlan(plan, { slug: 'looping-llms' }).map((diag) => diag.code)).toEqual([
      'curriculum.discovery.uncited',
    ]);
  });

  it('reports unknown game components', () => {
    const base = validAnalyticPlan();
    const plan = validAnalyticPlan({
      acts: [
        {
          ...base.acts[0],
          scenes: [
            {
              ...base.acts[0].scenes[0],
              has_game: true,
              game_component_id: 'MissingGame',
            },
          ],
        },
      ],
    });

    const diagnostics = validateCurriculumPlan(plan, { slug: 'looping-llms' });
    expect(diagnostics.map((diag) => diag.code)).toEqual([
      'curriculum.game.unknown_component',
    ]);
    expect(diagnostics[0].severity).toBe('warning');
  });
});
