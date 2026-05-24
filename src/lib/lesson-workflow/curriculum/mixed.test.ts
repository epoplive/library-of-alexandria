import { describe, expect, it } from 'vitest';
import { canonicalJsonStringify } from '../artifact-ref';
import { StepLockEntrySchema } from '../lockfile-schema';
import type { LlmClient, LlmJsonRequest, LlmJsonResult } from '../llm/types';
import { runMixed } from './mixed';
import { mixedCorpus, validGeneratedPlan } from './test-fixtures';

class StaticLlmClient implements LlmClient {
  calls = 0;

  async runJson<T>(req: LlmJsonRequest<T>): Promise<LlmJsonResult<T>> {
    this.calls += 1;
    const parsed = req.schema.parse(validGeneratedPlan({ derivation: 'generative' }));
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

describe('runMixed', () => {
  it('places analytic acts before generated acts', async () => {
    const llm = new StaticLlmClient();
    const result = await runMixed({
      corpus: mixedCorpus(),
      llm,
      lessonTitle: 'Fixture Lesson',
    });

    expect(llm.calls).toBe(1);
    expect(result.plan.derivation).toBe('generative');
    expect(result.plan.acts).toHaveLength(2);
    expect(result.plan.acts[0].id).toBe('main');
    expect(result.plan.acts[0].scenes).toHaveLength(2);
    expect(result.plan.acts[1].id).toBe('generated');
  });
});
