import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sha256 } from '../artifact-ref';
import { FakeLlmClient } from '../llm/fake-adapter';
import { renderPrompt } from '../prompts/render';
import { ingestTopic } from './topic';

describe('ingestTopic', () => {
  it('uses LlmClient JSON validation and retries malformed output', async () => {
    const promptPath = fileURLToPath(new URL('../prompts/ingest-topic.v1.md', import.meta.url));
    const prompt = renderPrompt(promptPath, { topic: 'Looped transformers' });
    const client = new FakeLlmClient({
      responses: new Map([
        [
          sha256(prompt.rendered),
          [
            { topic: '', key_concepts: [] },
            {
              topic: 'Looped transformers',
              key_concepts: ['weight sharing', 'adaptive depth'],
              named_figures: [{ name: 'Mostafa Dehghani', relevance: 'Universal Transformer' }],
              papers: [{ title: 'Universal Transformers', year: 2018 }],
              source_digest_ids: [],
            },
          ],
        ],
      ]),
    });

    const corpus = await ingestTopic(
      'topic-demo',
      { kind: 'topic', subject: 'Looped transformers', depth_target: 'expert' },
      { now: () => new Date('2026-05-24T00:00:00.000Z'), llmClient: client },
    );

    if (corpus.research_brief === undefined) throw new Error('expected research brief');
    expect(corpus.research_brief.topic).toBe('Looped transformers');
    expect(corpus.research_brief.depth_target).toBe('expert');
    expect(corpus.research_brief.source_digest_ids).toHaveLength(1);
    const content = corpus.source_items[0].content;
    if (content === undefined) throw new Error('expected source item content');
    expect(content.key_points).toEqual(['weight sharing', 'adaptive depth']);
  });
});
