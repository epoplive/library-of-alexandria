import { describe, expect, it } from 'vitest';
import { canonicalJsonStringify } from '../artifact-ref';
import { scriptCorpus, topicCorpus, validGeneratedPlan } from '../curriculum/test-fixtures';
import { buildAnalyticPlan } from '../curriculum/analytic';
import { StepLockEntrySchema } from '../lockfile-schema';
import type { LlmClient, LlmJsonRequest, LlmJsonResult } from '../llm/types';
import { runSceneMap } from './index';
import { generatedSceneMapArtifact, sceneMapCorpus, sceneMapCurriculum } from './test-fixtures';

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

describe('runSceneMap dispatcher', () => {
  it('routes existing lessons and scripts to the analytic implementation', async () => {
    const existing = await runSceneMap({
      corpus: sceneMapCorpus(),
      curriculum: sceneMapCurriculum(),
    });
    expect(existing.artifact.detail.scenes).toHaveLength(3);

    const script = scriptCorpus();
    const scriptCurriculum = buildAnalyticPlan({ corpus: script });
    const scriptResult = await runSceneMap({
      corpus: script,
      curriculum: scriptCurriculum,
    });
    expect(scriptResult.artifact.detail.scenes).toHaveLength(1);
    expect(scriptResult.artifact.detail.scenes[0].sentences).toHaveLength(2);
  });

  it('routes topics and sources to the generative implementation', async () => {
    const llm = new StaticSceneMapLlmClient();
    const result = await runSceneMap({
      corpus: topicCorpus(),
      curriculum: validGeneratedPlan({ derivation: 'generative' }),
      llm,
    });

    expect(llm.calls).toBe(1);
    expect(result.artifact.content_map.acts[0].id).toBe('generated');
  });

  it('requires an LLM client for generative source kinds', async () => {
    await expect(runSceneMap({
      corpus: topicCorpus(),
      curriculum: validGeneratedPlan({ derivation: 'generative' }),
    })).rejects.toThrow('scene-map: generative path requires an LlmClient');
  });

  it('throws for unsupported source kinds', async () => {
    const corpus = sceneMapCorpus();
    Object.defineProperty(corpus, 'source_kind', {
      value: 'unsupported',
    });

    await expect(runSceneMap({
      corpus,
      curriculum: sceneMapCurriculum(),
    })).rejects.toThrow('scene-map: unsupported source_kind unsupported');
  });
});
