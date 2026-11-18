import { describe, expect, it } from 'vitest';
import { endpointShape } from '../endpoints/index.js';
import { inputUsage, modelUsage } from './metering.js';
import { usageFromProvider } from './usage.js';
import type { ProviderUsage } from '../../turn/completion.js';
import { createRequestLedger, initializeRequestScope, reserveRequest, dispatchRequest, settleRequest } from '../../core/agent/request/ledger.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import { prepareRequestAttempt } from '../request/attempt.js';

describe('input qualification for request prices', () => {
  it('keeps the existing request ledger incomplete when a codec has rejected input evidence', () => {
    const usage = endpointShape('openai-responses').readBody({ status: 'completed', output: [], usage: {
      input_tokens: 200, output_tokens: 10, total_tokens: 210, input_tokens_details: { cached_tokens: -1 },
    } }).usage!;
    expect(modelUsage(usage, 'openai-responses')).toMatchObject({ inputTokens: 200, outputTokens: 10, complete: false });
  });

  it('uses exclusive input for the aliased message protocol without dropping cached tokens', () => {
    expect(modelUsage({ prompt_tokens: 20, completion_tokens: 1, cache_read_input_tokens: 70, cache_creation_input_tokens: 10 }, 'copilot-messages'))
      .toMatchObject({ inputTokens: 100, outputTokens: 1, complete: true });
  });

  it('preserves rejected input as an unsettled reservation through the original attempt and persisted ledger', async () => {
    const scope = { id: 'price-test', workspacePath: '/synthetic', workspaceIdentity: '1:2' };
    let ledger = initializeRequestScope(createRequestLedger({ sessionId: 'price-test', sessionCreatedAt: '2026-11-18', directoryIdentity: '1:2' }), scope, false);
    const policy = { reserve(request: Parameters<typeof reserveRequest>[2]) {
      const reserved = reserveRequest(ledger, scope.id, request); ledger = reserved.ledger;
      return { id: 'original', dispatch() { ledger = dispatchRequest(ledger, scope.id, reserved.value); },
        confirmUnsent() { throw new Error('A dispatched request cannot be confirmed unsent.'); },
        settle(usage: Parameters<typeof settleRequest>[3]) { ledger = settleRequest(ledger, scope.id, reserved.value, usage); } };
    } };
    const attempt = await prepareRequestAttempt({ body: '{}', provider: 'fixture', model: 'meter', endpoint: 'openai-responses', purpose: 'turn', policy });
    await attempt.send('https://synthetic.invalid', { method: 'POST', body: '{}' }, async () => Response.json({}));
    const usage = endpointShape('openai-responses').readBody({ status: 'completed', output: [], usage: {
      input_tokens: 200, output_tokens: 10, total_tokens: 210, input_tokens_details: { cached_tokens: -1 },
    } }).usage;
    attempt.settle(usage);
    const reopened = decodeRequestLedger(JSON.parse(JSON.stringify(ledger)))!;
    expect(reopened.scopes[scope.id]).toMatchObject({ finalized: [], inputTokens: 0, outputTokens: 0,
      pending: { '1': { dispatched: true, usage: { inputTokens: 200, outputTokens: 10, complete: false } } } });
  });

  it('keeps captured unknown protocol input unqualified when the original declaration later changes', async () => {
    const protocol = { ...endpointShape('openai-compatible'), usageInput: undefined as 'inclusive' | 'exclusive' | undefined };
    const { declareEndpoint } = await import('../endpoints/index.js');
    declareEndpoint('unknown-price-metering', protocol);
    let settled: unknown;
    const attempt = await prepareRequestAttempt({ body: '{}', provider: 'fixture', model: 'meter', endpoint: 'unknown-price-metering', purpose: 'turn',
      policy: { reserve: () => ({ id: 'captured', dispatch() {}, confirmUnsent() {}, settle(usage) { settled = usage; } }) } });
    protocol.usageInput = 'inclusive';
    attempt.settle({ prompt_tokens: 200, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 0 } });
    expect(settled).toMatchObject({ inputTokens: 200, outputTokens: 10, complete: false });
  });
  it('counts inclusive and exclusive cached input once and excludes output from selection', () => {
    expect(inputUsage({ prompt_tokens: 100, completion_tokens: 1_000_000, prompt_tokens_details: { cached_tokens: 80 } }, 'inclusive'))
      .toEqual({ inputTokens: 100, inputComplete: true });
    expect(inputUsage({ prompt_tokens: 20, cache_read_input_tokens: 70, cache_creation_input_tokens: 10 }, 'exclusive'))
      .toEqual({ inputTokens: 100, inputComplete: true });
    expect(inputUsage({ prompt_tokens: 100 }, undefined)).toMatchObject({ inputComplete: false });
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '80', null])('rejects explicit invalid input %s', invalid => {
    expect(inputUsage({ prompt_tokens: invalid } as ProviderUsage, 'inclusive').inputComplete).toBe(false);
    expect(inputUsage({ prompt_tokens: 100, prompt_tokens_details: { cached_tokens: invalid } } as ProviderUsage, 'inclusive').inputComplete).toBe(false);
    expect(inputUsage({ prompt_tokens: 20, cache_read_input_tokens: invalid, cache_creation_input_tokens: 0 } as ProviderUsage, 'exclusive').inputComplete).toBe(false);
  });

  it('does not certify unknown native cache categories, unsafe sums or impossible cache overlaps', () => {
    for (const usage of [{ prompt_tokens: 20 }, { prompt_tokens: 20, cache_read_input_tokens: 0 },
      { prompt_tokens: 20, cache_creation_input_tokens: 0 },
      { prompt_tokens: Number.MAX_SAFE_INTEGER, cache_read_input_tokens: 1, cache_creation_input_tokens: 0 }]) {
      expect(inputUsage(usage, 'exclusive').inputComplete).toBe(false);
    }
    expect(inputUsage({ prompt_tokens: 20, prompt_tokens_details: { cached_tokens: 21 } }, 'inclusive').inputComplete).toBe(false);
    expect(inputUsage({ prompt_tokens: 20, metering_input_complete: false }, 'inclusive').inputComplete).toBe(false);
  });

  it.each(['openai-compatible', 'copilot-chat-completions', 'mistral-chat-completions', 'mistral-conversations',
    'openai-responses', 'openai-account-responses', 'azure-openai-responses',
    'google-generative-ai', 'google-vertex', 'google-account-generative-ai'])('declares inclusive input for %s', endpoint => {
    expect(endpointShape(endpoint).usageInput).toBe('inclusive');
  });

  it.each(['anthropic-messages', 'copilot-messages', 'bedrock-converse-stream'])('declares exclusive input for %s', endpoint => {
    expect(endpointShape(endpoint).usageInput).toBe('exclusive');
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '80', null])('keeps invalid Responses cached input %s unqualified after projection', invalid => {
    const usage = endpointShape('openai-responses').readBody({ status: 'completed', output: [],
      usage: { input_tokens: 100, output_tokens: 2, input_tokens_details: { cached_tokens: invalid } } }).usage!;
    expect(usageFromProvider(usage, 'inclusive')).toMatchObject({ inputTokens: 100, inputComplete: false });
  });

  it('rejects malformed Responses details and overlaps while omitted cache details preserve total input', () => {
    for (const details of [null, 'invalid', [], { cached_tokens: 101 }]) {
      const usage = endpointShape('openai-responses').readBody({ status: 'completed', output: [],
        usage: { input_tokens: 100, output_tokens: 2, input_tokens_details: details } }).usage!;
      expect(usageFromProvider(usage, 'inclusive').inputComplete).toBe(false);
    }
    const usage = endpointShape('openai-responses').readBody({ status: 'completed', output: [], usage: { input_tokens: 100 } }).usage!;
    expect(usageFromProvider(usage, 'inclusive')).toMatchObject({ inputTokens: 100, inputComplete: true });
  });

  it.each(['google-generative-ai', 'google-vertex', 'google-account-generative-ai'])('keeps %s input independent of missing output and validates raw cache', endpoint => {
    const read = (metadata: Record<string, unknown>) => endpointShape(endpoint).readBody({
      candidates: [{ content: { parts: [{ text: 'answer' }] }, finishReason: 'STOP' }], usageMetadata: metadata,
    }).usage!;
    expect(usageFromProvider(read({ promptTokenCount: 100, candidatesTokenCount: 2 }), 'inclusive')).toMatchObject({
      inputTokens: 100, inputComplete: true, completionTokens: 2,
    });
    for (const cached of [-1, 0.5, '80', null, 101]) expect(usageFromProvider(read({
      promptTokenCount: 100, candidatesTokenCount: 2, thoughtsTokenCount: 1, cachedContentTokenCount: cached,
    }), 'inclusive').inputComplete).toBe(false);
  });

  it('preserves a rejected Google input category through later stream frames', async () => {
    const frames = [
      { candidates: [{ content: { parts: [{ text: 'answer' }] } }], usageMetadata: {
        promptTokenCount: 100, candidatesTokenCount: 2, thoughtsTokenCount: 0, cachedContentTokenCount: -1,
      } },
      { candidates: [{ finishReason: 'STOP' }], usageMetadata: {
        promptTokenCount: 100, candidatesTokenCount: 2, thoughtsTokenCount: 0, cachedContentTokenCount: 0,
      } },
    ];
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('')));
      controller.close();
    } });
    const reader = endpointShape('google-generative-ai').readStream(stream);
    let next = await reader.next(); while (!next.done) next = await reader.next();
    expect(usageFromProvider(next.value.usage!, 'inclusive')).toMatchObject({ inputTokens: 100, inputComplete: false });
  });
});
