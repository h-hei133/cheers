import { describe, expect, it } from 'vitest';
import { requestCacheWindow } from './window.js';
import { createStepFunction } from '../../turn/step.js';
import type { SentRequest } from '../request/sentRequest.js';
import type { StepRequest } from '../../turn/context/contract.js';
import { createTurnContextPreparer } from '../../turn/context/prepare.js';

describe('captured request cache window', () => {
  it('uses only the serialized tier and leaves missing and disabled windows unknown', () => {
    const model = { id: 'm', promptCache: { short: 300, long: 3600 } };
    expect(requestCacheWindow({ endpoint: 'anthropic-messages', retention: 'long', model,
      payload: { system: [{ cache_control: { type: 'ephemeral' } }] } })).toEqual({ retention: 'short', ttlMs: 300_000 });
    expect(requestCacheWindow({ endpoint: 'anthropic-messages', retention: 'long', model,
      payload: { messages: [{ content: [{ cache_control: { type: 'ephemeral', ttl: '1h' } }] }] } }))
      .toEqual({ retention: 'long', ttlMs: 3_600_000 });
    expect(requestCacheWindow({ endpoint: 'anthropic-messages', model, payload: {} })).toEqual({ retention: 'none' });
    expect(requestCacheWindow({ endpoint: 'openai-compatible', retention: 'none', model, payload: {} })).toEqual({ retention: 'none' });
    expect(requestCacheWindow({ endpoint: 'openai-compatible', retention: 'long',
      model: { id: 'm', promptCache: { short: 300 } }, payload: { prompt_cache_retention: '24h' } }))
      .toEqual({ retention: 'long' });
  });

  it('caps a declared long window at the serialized protocol duration without short fallback', () => {
    const model = { id: 'm', promptCache: { short: 300, long: 86_400 } };
    expect(requestCacheWindow({ endpoint: 'openai-responses', model,
      payload: { prompt_cache_options: { ttl: '30m' } } })).toEqual({ retention: 'long', ttlMs: 1_800_000 });
    expect(requestCacheWindow({ endpoint: 'openai-compatible', model,
      payload: { prompt_cache_retention: '24h' } })).toEqual({ retention: 'long', ttlMs: 86_400_000 });
    expect(requestCacheWindow({ endpoint: 'openai-account-responses', model,
      payload: { prompt_cache_retention: '24h' } })).toEqual({ retention: 'short', ttlMs: 300_000 });
  });

  it('caps an Anthropic short window at its serialized five-minute duration', () => {
    for (const ttl of [undefined, '5m']) {
      expect(requestCacheWindow({ endpoint: 'anthropic-messages', retention: 'short', model: { id: 'm', promptCache: { short: 600 } },
        payload: { system: [{ cache_control: { type: 'ephemeral', ...(ttl ? { ttl } : {}) } }] } }))
        .toEqual({ retention: 'short', ttlMs: 300_000 });
    }
  });

  it('captures native message cache markers through the shared gateway codec', () => {
    expect(requestCacheWindow({ endpoint: 'copilot-messages', retention: 'long',
      model: { id: 'm', promptCache: { short: 300, long: 3600 } },
      payload: { system: [{ cache_control: { type: 'ephemeral', ttl: '1h' } }] } }))
      .toEqual({ retention: 'long', ttlMs: 3_600_000 });
  });

  it.each([NaN, Infinity, -1, 0, Number.MAX_SAFE_INTEGER])('rejects invalid declared window %s', long => {
    expect(requestCacheWindow({ endpoint: 'openai-responses', model: { id: 'm', promptCache: { short: 300, long } },
      payload: { prompt_cache_retention: '24h' } })).toEqual({ retention: 'long' });
  });

  it.each([
    { endpoint: 'openai-compatible', supported: false, extension: false, retention: 'long' as const, effective: 'short', ttl: 300_000 },
    { endpoint: 'openai-compatible', supported: true, extension: false, retention: 'long' as const, effective: 'long', ttl: 86_400_000 },
    { endpoint: 'openai-responses', supported: true, extension: true, retention: 'long' as const, effective: 'long', ttl: 1_800_000 },
    { endpoint: 'anthropic-messages', supported: true, extension: false, retention: 'long' as const, effective: 'long', ttl: 3_600_000 },
    { endpoint: 'anthropic-messages', supported: false, extension: false, retention: 'long' as const, effective: 'short', ttl: 300_000 },
    { endpoint: 'openai-compatible', supported: true, extension: false, retention: 'none' as const, effective: 'none', ttl: undefined },
  ])('captures $endpoint effective=$effective with actual dispatch time and immutable metadata', async scenario => {
    const model = { id: 'm', promptCache: { short: 300, long: 86_400 }, compat: { promptCacheKey: true,
      supportsLongCacheRetention: scenario.supported, supportsExplicitPromptCacheMode: scenario.extension } };
    const baseUrl = 'https://captured-cache.fixture/v1';
    const sent: SentRequest[] = []; const bodies: string[] = [];
    let dispatchAt = 0;
    const step = createStepFunction({ provider: { headers: {}, baseUrl, provider: 'fixture', model: 'm', endpoint: scenario.endpoint },
      workspaceRoot: process.cwd(), sessionId: `window-${scenario.endpoint}-${scenario.retention}-${scenario.supported}`,
      catalog: [{ id: 'fixture', baseUrl, models: [model] }], cacheRetention: scenario.retention, systemPrompt: 'Stable', tools: [],
      fetchImpl: async (_url, init) => {
        dispatchAt = Date.now(); bodies.push(String(init?.body)); model.promptCache.long = 1;
        return Response.json(scenario.endpoint === 'anthropic-messages'
          ? { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }
          : scenario.endpoint === 'openai-responses' ? { status: 'completed', output: [{ id: 'message_1', type: 'message', role: 'assistant',
            content: [{ type: 'output_text', text: 'ok' }] }] }
            : { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] });
      },
    });
    expect(await step([{ role: 'user', content: 'Stable prefix' }], undefined, {}, { allowTools: false,
      onRequestSent: captured => { sent.push(captured); } })).toMatchObject({ stopReason: 'stop' });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toBe(bodies[0]);
    expect(sent[0]!.cache).toEqual({ retention: scenario.effective, ...(scenario.ttl ? { ttlMs: scenario.ttl } : {}) });
    expect(Object.isFrozen(sent[0]!.cache)).toBe(true);
    expect(sent[0]!.sentAt).toBeLessThanOrEqual(dispatchAt);
    expect(dispatchAt - sent[0]!.sentAt!).toBeLessThan(100);
  });

  it('leaves cache duration unknown at an undeclared address instead of borrowing a canonical model window', async () => {
    const request: StepRequest = { provider: { headers: {}, baseUrl: 'https://other-cache.fixture/v1', provider: 'fixture', model: 'm' },
      workspaceRoot: process.cwd(), sessionId: 'unknown-cache-address', systemPrompt: 'Stable', tools: [], cacheRetention: 'long',
      catalog: [{ id: 'fixture', baseUrl: 'https://canonical-cache.fixture/v1', models: [{ id: 'm',
        promptCache: { short: 300, long: 86_400 }, compat: { promptCacheKey: true, supportsLongCacheRetention: true } }] }] };
    const prepare = createTurnContextPreparer(request, { allowTools: false }, { replayBinding: 'a'.repeat(64), streamAttempts: () => 0,
      effortAccepted: () => false, explicitEffort: false });
    const capture = await prepare([{ role: 'user', content: 'Stable' }]);
    expect(capture.cacheRetention).toBe('long');
    expect(capture.cache).toEqual({ retention: 'short' });
    expect(capture.payload).not.toHaveProperty('prompt_cache_key');
    expect(capture.payload).not.toHaveProperty('prompt_cache_retention');
  });
});
