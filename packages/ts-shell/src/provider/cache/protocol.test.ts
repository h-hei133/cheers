import { describe, expect, it } from 'vitest';
import { endpointBody, endpointTurnBody } from '../endpoints/index.js';
import { resolveRequestShape } from '../../core/models/requestShape.js';
import type { TurnRequest } from '../endpoints/kinds.js';

const request = { model: 'model', provider: 'fixture', sessionId: 'cache-session', baseUrl: 'https://cache.fixture/v1',
  systemPrompt: 'Stable instructions', messages: [{ role: 'user' as const, content: 'Stable history' }],
  tools: [{ type: 'function' as const, function: { name: 'read', parameters: { type: 'object' } } }],
  allowTools: true, vision: false, temperature: 0.2, reasoningEffort: false,
  systemRole: 'system' as const, maxTokensField: 'max_tokens' as const, assistantAfterToolResult: false };

it.each(['false', 0, {}, null])('does not enable paid extended retention from malformed capability %j', capability => {
  const body = endpointTurnBody('openai-compatible', { ...request, cacheRetention: 'long', supportsLongCacheRetention: capability } as TurnRequest);
  expect(body).not.toHaveProperty('prompt_cache_retention');
});

describe('independent cache protocol capabilities', () => {
  it.each(['openai-compatible', 'openai-responses'])('keeps %s affinity without assuming a long window', endpoint => {
    for (const supportsLongCacheRetention of [undefined, false]) {
      const body = endpointTurnBody(endpoint, { ...request, cacheRetention: 'long', supportsPromptCacheKey: true,
        supportsLongCacheRetention } as typeof request);
      expect(body.prompt_cache_key).toBe(request.sessionId);
      expect(body).not.toHaveProperty('prompt_cache_retention');
    }
  });

  it.each(['openai-compatible', 'openai-responses'])('sends %s long retention independently of affinity', endpoint => {
    const body = endpointTurnBody(endpoint, { ...request, cacheRetention: 'long', supportsPromptCacheKey: false,
      supportsLongCacheRetention: true, sessionId: undefined } as typeof request);
    expect(body.prompt_cache_retention).toBe('24h');
    expect(body).not.toHaveProperty('prompt_cache_key');
  });

  it('uses the declared Responses extension vocabulary for long and disabled caching', () => {
    const controls = { ...request, supportsPromptCacheKey: true, supportsLongCacheRetention: true,
      supportsExplicitPromptCacheMode: true };
    const long = endpointTurnBody('openai-responses', { ...controls, cacheRetention: 'long' } as typeof request);
    expect(long.prompt_cache_options).toEqual({ ttl: '30m' });
    expect(long).not.toHaveProperty('prompt_cache_retention');
    const disabled = endpointBody('openai-responses', { ...controls, cacheRetention: 'none' } as typeof request);
    expect(disabled.prompt_cache_options).toEqual({ mode: 'explicit' });
    expect(disabled).not.toHaveProperty('prompt_cache_key');
    expect(disabled).not.toHaveProperty('prompt_cache_retention');
  });

  it('keeps unsupported Responses extensions absent while preserving enabled affinity', () => {
    const body = endpointTurnBody('openai-responses', { ...request, cacheRetention: 'long', supportsPromptCacheKey: true,
      supportsLongCacheRetention: false, supportsExplicitPromptCacheMode: true } as typeof request);
    expect(body.prompt_cache_key).toBe(request.sessionId);
    expect(body).not.toHaveProperty('prompt_cache_options');
    expect(body).not.toHaveProperty('prompt_cache_retention');
  });

  it.each(['http://api.openai.com/v1', 'https://untrusted.api.openai.com/v1', 'https://api.openai.com:8443/v1',
    'https://user:password@api.openai.com/v1', 'https://api.openai.com/v1?redirect=other'])
    ('requires the admitted official address before automatic cache controls at %s', baseUrl => {
      const body = endpointTurnBody('openai-compatible', { ...request, baseUrl, cacheRetention: 'long' });
      expect(body).not.toHaveProperty('prompt_cache_key');
      expect(body).not.toHaveProperty('prompt_cache_retention');
    });

  it('falls back to short Anthropic markers when the exact endpoint refuses a long window', () => {
    const body = endpointTurnBody('anthropic-messages', { ...request, cacheRetention: 'long',
      supportsLongCacheRetention: false } as typeof request);
    expect(body.system).toEqual([{ type: 'text', text: request.systemPrompt, cache_control: { type: 'ephemeral' } }]);
    expect((body.tools as Record<string, unknown>[]).at(-1)?.cache_control).toEqual({ type: 'ephemeral' });
    expect((body.messages as { content: Record<string, unknown>[] }[]).at(-1)?.content.at(-1)?.cache_control)
      .toEqual({ type: 'ephemeral' });
  });

  it('keeps canonical cache declarations from opting an unrelated address into native controls', () => {
    const catalog = [{ id: 'fixture', baseUrl: 'https://original.fixture/v1', models: [{ id: 'model', compat: {
      promptCacheKey: true, supportsLongCacheRetention: true, supportsExplicitPromptCacheMode: true,
    } }] }];
    const shape = resolveRequestShape(catalog, 'fixture', 'model', undefined, request.baseUrl, 'openai-responses');
    expect(shape).toMatchObject({ promptCacheKey: false, supportsLongCacheRetention: false, supportsExplicitPromptCacheMode: false });
    expect(resolveRequestShape(catalog, 'fixture', 'model', undefined, catalog[0]!.baseUrl, 'openai-responses'))
      .toMatchObject({ promptCacheKey: true, supportsLongCacheRetention: true, supportsExplicitPromptCacheMode: true });
  });
});
