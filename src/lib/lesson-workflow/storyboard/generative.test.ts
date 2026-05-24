import { describe, expect, it } from 'vitest';
import { canonicalJsonStringify } from '../artifact-ref';
import { StepLockEntrySchema } from '../lockfile-schema';
import type { LlmClient, LlmJsonRequest, LlmJsonResult } from '../llm/types';
import { runGenerative } from './generative';
import { StoryboardSchema, type Storyboard } from './types';
import { storyboardCorpus, storyboardCurriculum, storyboardSceneMap } from './test-fixtures';

class RetryingStoryboardLlmClient implements LlmClient {
  attempts = 0;
  prompt = '';
  private readonly responses: unknown[];

  constructor(responses: unknown[]) {
    this.responses = responses;
  }

  async runJson<T>(req: LlmJsonRequest<T>): Promise<LlmJsonResult<T>> {
    this.prompt = req.prompt;
    const maxRetries = req.max_retries === undefined ? 0 : req.max_retries;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      this.attempts += 1;
      const responseIndex = attempt < this.responses.length ? attempt : this.responses.length - 1;
      const candidate = this.responses[responseIndex];
      const parsedCandidate = req.schema.safeParse(candidate);
      if (!parsedCandidate.success) continue;
      const diagnostics = req.validator === undefined ? [] : req.validator(parsedCandidate.data);
      if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) continue;
      const parsed = parsedCandidate.data;
      return {
        parsed,
        raw_response: canonicalJsonStringify(parsed),
        model_id: 'fake',
        run_id: 'fake-run',
        diagnostics,
        elapsed_ms: 0,
        lock_entry: StepLockEntrySchema.parse({
          status: 'completed',
          input_hashes: [],
          output_hashes: [],
          diagnostics,
          completed_at: '2026-05-24T00:00:00.000Z',
        }),
      };
    }
    throw new Error('fake LLM response failed validation');
  }
}

describe('runGenerative storyboard', () => {
  it('renders the storyboard prompt and parses a valid LLM storyboard', async () => {
    const llm = new RetryingStoryboardLlmClient([validStoryboard()]);
    const result = await runGenerative({
      corpus: storyboardCorpus(),
      curriculum: storyboardCurriculum(),
      sceneMap: storyboardSceneMap(),
      llm,
    });

    expect(llm.attempts).toBe(1);
    expect(llm.prompt).toContain('SCENE MAP');
    expect(result.storyboard.schema_version).toBe('loa.storyboard.v1');
    expect(result.storyboard.plans).toHaveLength(1);
    expect(result.shotTierByScene.get('scene-1')).toHaveLength(1);
  });

  it('allows the LLM client to retry after a Zod-invalid storyboard response', async () => {
    const llm = new RetryingStoryboardLlmClient([
      { schema_version: 'loa.storyboard.v1', plans: [{ kind: 'narrative' }] },
      validStoryboard(),
    ]);
    const result = await runGenerative({
      corpus: storyboardCorpus(),
      curriculum: storyboardCurriculum(),
      sceneMap: storyboardSceneMap(),
      llm,
    });

    expect(llm.attempts).toBe(2);
    expect(result.storyboard.plans[0].kind).toBe('narrative');
  });
});

function validStoryboard(): Storyboard {
  return StoryboardSchema.parse({
    schema_version: 'loa.storyboard.v1',
    plans: [{
      kind: 'narrative',
      shot_address: { scene_id: 'scene-1', shot_id: 'shot-1-1' },
      speakers: ['narrator'],
      spoken_lines: [{
        id: 'line-shot-1-1-1',
        cast_id: 'narrator',
        text: 'Alpha opens.',
        source_sentence_ids: ['s1-a'],
        audio_slot_id: 'audio-abcdef1234567890',
      }],
      duration_estimate_s: 1.2,
    }],
  });
}
