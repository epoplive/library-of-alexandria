import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { canonicalJsonStringify } from '../artifact-ref';
import { LessonCorpusSchema } from '../ingest/types';
import { StepLockEntrySchema } from '../lockfile-schema';
import type { LlmClient, LlmJsonRequest, LlmJsonResult } from '../llm/types';
import { runCurriculum } from './index';
import {
  existingLessonCorpus,
  mixedCorpus,
  scriptCorpus,
  topicCorpus,
  validGeneratedPlan,
} from './test-fixtures';

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

describe('runCurriculum dispatcher', () => {
  it('routes existing lessons to the analytic implementation', async () => {
    const result = await runCurriculum({
      corpus: existingLessonCorpus(),
      lessonTitle: 'Fixture Lesson',
    });

    expect(result.plan.derivation).toBe('analytic');
    expect(result.plan.acts[0].scenes).toHaveLength(3);
  });

  it('routes scripts to the analytic implementation', async () => {
    const result = await runCurriculum({
      corpus: scriptCorpus(),
      lessonTitle: 'Script Lesson',
    });

    expect(result.plan.derivation).toBe('analytic');
    expect(result.plan.acts[0].scenes).toHaveLength(1);
  });

  it('routes topics and sources to the generative implementation', async () => {
    const topicClient = new StaticLlmClient();
    const topicResult = await runCurriculum({
      corpus: topicCorpus(),
      llm: topicClient,
    });
    expect(topicResult.plan.derivation).toBe('generative');
    expect(topicClient.calls).toBe(1);

    const sources = topicCorpus();
    sources.source_kind = 'sources';
    const sourcesClient = new StaticLlmClient();
    const sourcesResult = await runCurriculum({
      corpus: sources,
      llm: sourcesClient,
    });
    expect(sourcesResult.plan.derivation).toBe('generative');
    expect(sourcesClient.calls).toBe(1);
  });

  it('routes mixed inputs to merged analytic and generative output', async () => {
    const llm = new StaticLlmClient();
    const result = await runCurriculum({
      corpus: mixedCorpus(),
      llm,
      lessonTitle: 'Mixed Lesson',
    });

    expect(result.plan.derivation).toBe('generative');
    expect(result.plan.acts[0].id).toBe('main');
    expect(result.plan.acts[1].id).toBe('generated');
  });

  it('requires an LLM client for generative source kinds', async () => {
    await expect(runCurriculum({
      corpus: topicCorpus(),
    })).rejects.toThrow('curriculum: generative path requires an LlmClient');
  });

  it('throws for unsupported source kinds', async () => {
    const corpus = existingLessonCorpus();
    Object.defineProperty(corpus, 'source_kind', {
      value: 'unsupported',
    });

    await expect(runCurriculum({ corpus })).rejects.toThrow('curriculum: unsupported source_kind unsupported');
  });
});

describe('curriculum smoke fixture', () => {
  it('builds twelve analytic scenes from the looping-llms ingest artifact', async () => {
    const raw = await readFile('lessons/looping-llms/artifacts/lesson-input.json', 'utf8');
    const corpus = LessonCorpusSchema.parse(JSON.parse(raw));
    const result = await runCurriculum({
      corpus,
      lessonTitle: 'Looped Language Models',
    });

    expect(result.plan.acts).toHaveLength(1);
    expect(result.plan.acts[0].scenes).toHaveLength(12);
    expect(result.plan.derivation).toBe('analytic');
    expect(canonicalJsonStringify(result.plan)).toContain('"schema_version": "loa.curriculum.v1"');
  });
});
