import { describe, expect, it } from 'vitest';
import { canonicalJsonStringify } from '../artifact-ref';
import { mixedCorpus, validGeneratedPlan } from '../curriculum/test-fixtures';
import { CurriculumPlanSchema } from '../curriculum/types';
import { StepLockEntrySchema } from '../lockfile-schema';
import type { LlmClient, LlmJsonRequest, LlmJsonResult } from '../llm/types';
import { runMixed } from './mixed';
import { generatedSceneMapArtifact, sceneMapCurriculum } from './test-fixtures';

class StaticSceneMapLlmClient implements LlmClient {
  calls = 0;

  async runJson<T>(req: LlmJsonRequest<T>): Promise<LlmJsonResult<T>> {
    this.calls += 1;
    const parsed = req.schema.parse(generatedSceneMapArtifact());
    return {
      parsed,
      raw_response: canonicalJsonStringify(parsed),
      model_id: 'fake',
      run_id: 'fake-run',
      diagnostics: [],
      elapsed_ms: 0,
      lock_entry: StepLockEntrySchema.parse({
        status: 'completed',
        input_hashes: [],
        output_hashes: [],
        diagnostics: [],
        completed_at: '2026-05-24T00:00:00.000Z',
      }),
    };
  }
}

describe('runMixed scene-map', () => {
  it('merges analytic existing scenes with generated scenes in curriculum order', async () => {
    const analytic = sceneMapCurriculum();
    const generated = validGeneratedPlan({ derivation: 'generative' });
    const curriculum = CurriculumPlanSchema.parse({
      schema_version: 'loa.curriculum.v1',
      acts: [
        {
          ...analytic.acts[0],
          scenes: analytic.acts[0].scenes.slice(0, 2),
        },
        generated.acts[0],
      ],
      estimated_total_runtime_s: 1500,
      discovery_seed_plan: analytic.discovery_seed_plan,
      derivation: 'generative',
    });
    const llm = new StaticSceneMapLlmClient();

    const result = await runMixed({
      corpus: mixedCorpus(),
      curriculum,
      llm,
    });

    expect(llm.calls).toBe(1);
    expect(result.artifact.content_map.acts).toHaveLength(2);
    expect(result.artifact.content_map.acts[0].scenes.map((scene) => scene.id)).toEqual(['section-01', 'section-02']);
    expect(result.artifact.content_map.acts[1].scenes.map((scene) => scene.id)).toEqual(['generated-scene']);
    expect(result.artifact.detail.scenes.map((scene) => scene.scene_id)).toEqual(['section-01', 'section-02', 'generated-scene']);
    expect(result.diagnostics.every((diag) => diag.severity !== 'error')).toBe(true);
  });
});
