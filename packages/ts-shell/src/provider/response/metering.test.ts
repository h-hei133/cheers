import { describe, expect, it } from 'vitest';
import { modelUsage } from './metering.js';
import { endpointShape } from '../endpoints/index.js';

describe('inclusive model usage', () => {
  it('counts compatible cache reads and reasoning once, preserving protocol totals as evidence', () => {
    expect(modelUsage({ prompt_tokens: 100, completion_tokens: 30, total_tokens: 130,
      prompt_tokens_details: { cached_tokens: 80 } }, 'openai-compatible')).toEqual({ version: 1, inputTokens: 100,
      outputTokens: 30, cacheReadTokens: 80, reportedTotalTokens: 130, complete: true });
    expect(modelUsage({ prompt_tokens: 10, completion_tokens: 10, total_tokens: 1000 }, 'openai-compatible'))
      .toMatchObject({ inputTokens: 10, outputTokens: 10, reportedTotalTokens: 1000, complete: false, inconsistent: true });
  });

  it('adds disjoint native cache categories and keeps missing categories as partial known values', () => {
    for (const endpoint of ['anthropic-messages', 'bedrock-converse-stream']) {
      expect(modelUsage({ prompt_tokens: 10, completion_tokens: 5, cache_read_input_tokens: 30, cache_creation_input_tokens: 20, total_tokens: 15 }, endpoint))
        .toMatchObject({ inputTokens: 60, outputTokens: 5, complete: true });
      expect(modelUsage({ prompt_tokens: 10, completion_tokens: 5, cache_read_input_tokens: 30 }, endpoint))
        .toMatchObject({ inputTokens: 40, outputTokens: 5, complete: false });
    }
    expect(modelUsage({ prompt_tokens: 3 }, 'openai-compatible')).toMatchObject({ inputTokens: 3, complete: false });
    expect(modelUsage({ prompt_tokens: -1, completion_tokens: 2 }, 'openai-compatible')).toEqual({ version: 1, outputTokens: 2, complete: false });
  });

  it('includes separately reported Google thinking while omitted output categories stay unknown', () => {
    const read = (usageMetadata: Record<string, number>) => endpointShape('google-generative-ai').readBody({
      candidates: [{ content: { parts: [{ text: 'answer' }] }, finishReason: 'STOP' }], usageMetadata,
    }).usage;
    expect(modelUsage(read({ promptTokenCount: 10, candidatesTokenCount: 3, thoughtsTokenCount: 4, totalTokenCount: 17 }), 'google-generative-ai'))
      .toMatchObject({ inputTokens: 10, outputTokens: 7, complete: true });
    expect(modelUsage(read({ promptTokenCount: 10, candidatesTokenCount: 3 }), 'google-generative-ai'))
      .toMatchObject({ inputTokens: 10, outputTokens: 3, complete: false });
  });
});
