import { describe, expect, it } from 'vitest';
import { canonicalJsonStringify } from '../artifact-ref';
import { validGeneratedPlan } from '../curriculum/test-fixtures';
import { StepLockEntrySchema } from '../lockfile-schema';
import type { LlmClient, LlmJsonRequest, LlmJsonResult } from '../llm/types';
import { runGenerative } from './generative';
import { generatedCorpus, generatedSceneMapArtifact } from './test-fixtures';
import type { SceneMapArtifact } from './types';

class StaticSceneMapLlmClient implements LlmClient {
  calls = 0;
  prompt = '';
  private readonly artifact: SceneMapArtifact;

  constructor(artifact: SceneMapArtifact) {
    this.artifact = artifact;
  }

  async runJson<T>(req: LlmJsonRequest<T>): Promise<LlmJsonResult<T>> {
    this.calls += 1;
    this.prompt = req.prompt;
    const parsed = req.schema.parse(this.artifact);
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

describe('runGenerative scene-map', () => {
  it('renders the scene-map prompt and parses the LLM artifact', async () => {
    const llm = new StaticSceneMapLlmClient(generatedSceneMapArtifact());
    const result = await runGenerative({
      corpus: generatedCorpus(),
      curriculum: validGeneratedPlan({ derivation: 'generative' }),
      llm,
    });

    expect(llm.calls).toBe(1);
    expect(llm.prompt).toContain('CURRICULUM PLAN');
    expect(llm.prompt).toContain('"schema_version": "loa.curriculum.v1"');
    expect(result.artifact.schema_version).toBe('loa.scene-map.v1');
    expect(result.artifact.detail.scenes[0].beats[0].source_sentence_ids).toHaveLength(2);
    expect(result.diagnostics).toEqual([]);
  });
});
