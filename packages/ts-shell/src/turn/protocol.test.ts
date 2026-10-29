import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { BUILTIN_PROVIDERS, mergeProviders } from '../core/models/catalog.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../core/auth/account/target.js';
import { createStepFunction } from './step.js';

let workspaceRoot: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  workspaceRoot = fs.mkdtempSync('/tmp/cheers-test/request-protocol-');
  vi.stubEnv('CHEERS_TEST_ROOT', workspaceRoot); vi.stubEnv('USERPROFILE', workspaceRoot);
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(workspaceRoot, { recursive: true, force: true }); });

it.each([undefined, null] as const)('sends admitted native summaries with effort %s left automatic', async thinkingEffort => {
  const target = { provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'o4-mini' };
  const endpoint = providerCredentialEndpoint(BUILTIN_PROVIDERS, target);
  let url: string | undefined, body: Record<string, unknown> | undefined;
  const step = createStepFunction({ workspaceRoot, sessionId: 'native-protocol', systemPrompt: 'instructions', tools: [],
    thinkingEffort, catalog: BUILTIN_PROVIDERS, provider: { ...target, endpoint },
    fetchImpl: async (input, init) => {
      url = String(input); body = JSON.parse(String(init?.body));
      return Response.json({ status: 'completed', output: [
        { type: 'reasoning', id: 'rs_1', summary: [{ type: 'summary_text', text: 'Visible summary' }] },
        { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'answer' }] },
      ] });
    }, maxOutputTokens: 100,
  });
  const result = await step([], undefined, {}, { allowTools: false });
  expect(url).toBe('https://api.openai.com/v1/responses');
  expect(body?.reasoning).toEqual({ summary: 'auto' }); expect(body?.max_output_tokens).toBe(100);
  expect(result.text).toBe('answer'); expect(result.reasoning?.text).toBe('Visible summary');
});

it('preserves custom relay protocol and automatic effort without new summary controls', async () => {
  const target = { provider: 'openai', baseUrl: 'https://relay.invalid/v1', model: 'o4-mini' };
  let url: string | undefined, body: Record<string, unknown> | undefined;
  const step = createStepFunction({ workspaceRoot, sessionId: 'relay-protocol', systemPrompt: '', tools: [], thinkingEffort: null,
    catalog: BUILTIN_PROVIDERS, provider: { ...target, endpoint: providerCredentialEndpoint(BUILTIN_PROVIDERS, target) },
    fetchImpl: async (input, init) => {
      url = String(input); body = JSON.parse(String(init?.body));
      return Response.json({ choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }] });
    },
  });
  expect((await step([], undefined, {}, { allowTools: false })).text).toBe('answer');
  expect(url).toBe('https://relay.invalid/v1/chat/completions');
  expect(body).not.toHaveProperty('reasoning'); expect(body).not.toHaveProperty('reasoning_effort');
});

it('carries a known summary refusal through the actual Responses turn', async () => {
  const catalog = mergeProviders(BUILTIN_PROVIDERS, [{ id: 'openai', models: [{ id: 'o4-mini', compat: { reasoningSummary: false } }] }]);
  let body: Record<string, unknown> | undefined;
  const step = createStepFunction({ workspaceRoot, sessionId: 'refused-summary', systemPrompt: '', tools: [], thinkingEffort: 'high', catalog,
    provider: { provider: 'openai', model: 'o4-mini', baseUrl: 'https://api.openai.com/v1', endpoint: 'openai-responses' },
    fetchImpl: async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ status: 'completed', output: [{ type: 'message', id: 'msg_1', role: 'assistant', content: [{ type: 'output_text', text: 'answer' }] }] });
    },
  });
  expect((await step([], undefined, {}, { allowTools: false })).text).toBe('answer');
  expect(body?.reasoning).toEqual({ effort: 'high' });
});

it('does not request native summaries for an anonymous Responses relay using unique model fallback', async () => {
  let body: Record<string, unknown> | undefined;
  const step = createStepFunction({ workspaceRoot, sessionId: 'anonymous-relay', systemPrompt: '', tools: [], thinkingEffort: null,
    catalog: BUILTIN_PROVIDERS, provider: { model: 'o4-mini', baseUrl: 'https://relay.invalid/v1', endpoint: 'openai-responses' },
    fetchImpl: async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ status: 'completed', output: [{ type: 'message', id: 'msg_1', role: 'assistant',
        content: [{ type: 'output_text', text: 'answer' }] }] });
    },
  });
  expect((await step([], undefined, {}, { allowTools: false })).text).toBe('answer');
  expect(body).not.toHaveProperty('reasoning');
});

it.each([
  { provider: 'google-ai', endpoint: 'google-generative-ai', baseUrl: 'https://generativelanguage.googleapis.com' },
  { provider: 'vertex', endpoint: 'google-vertex', baseUrl: 'https://aiplatform.googleapis.com/v1/projects/synthetic/locations/global/publishers/google/models' },
])('keeps automatic native Google summaries separate from an effort for $provider', async target => {
  for (const model of ['gemini-2.5-pro', 'gemini-2.5-flash']) for (const thinkingEffort of [undefined, null] as const) {
    let body: Record<string, unknown> | undefined;
    const thought = 'Public thought summary';
    const frame = { candidates: [{ content: { parts: [{ text: thought, thought: true }, { text: 'answer' }] }, finishReason: 'STOP' }] };
    const step = createStepFunction({ workspaceRoot, sessionId: 'google-summary', systemPrompt: '', tools: [],
      catalog: BUILTIN_PROVIDERS, thinkingEffort, provider: { ...target, model },
      fetchImpl: async (url, init) => {
        expect(String(url)).toContain(':streamGenerateContent?alt=sse');
        body = JSON.parse(String(init?.body));
        return new Response(`data: ${JSON.stringify(frame)}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
      },
    });
    const visible: string[] = [];
    const result = await step([], undefined, { onReasoning: text => { visible.push(text); } }, { allowTools: false });
    expect(body?.generationConfig).toEqual({ temperature: 0.7, thinkingConfig: { includeThoughts: true } });
    expect(result.text).toBe('answer'); expect(result.reasoning?.text).toBe(thought);
    expect(visible.join('')).toBe(thought);
  }
});

it.each([
  { provider: 'google-ai', model: 'gemini-2.5-pro', baseUrl: 'https://relay.invalid', endpoint: 'google-generative-ai' },
  { provider: undefined, model: 'gemini-2.5-pro', baseUrl: 'https://relay.invalid', endpoint: 'google-generative-ai' },
  { provider: 'google-ai', model: 'unlisted', baseUrl: 'https://generativelanguage.googleapis.com', endpoint: 'google-generative-ai' },
  { provider: 'vertex', model: 'gemini-2.5-pro', baseUrl: 'https://relay.invalid/v1/projects/p/locations/global/publishers/google/models', endpoint: 'google-vertex' },
])('does not grant native Google summaries to an unproven turn target %j', async target => {
  let body: Record<string, unknown> | undefined;
  const step = createStepFunction({ workspaceRoot, sessionId: 'unproven-google-summary', systemPrompt: '', tools: [],
    catalog: BUILTIN_PROVIDERS, thinkingEffort: null, provider: target,
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ candidates: [{ content: { parts: [{ text: 'answer' }] }, finishReason: 'STOP' }] });
    },
  });
  expect((await step([], undefined, {}, { allowTools: false })).text).toBe('answer');
  expect(body?.generationConfig).not.toHaveProperty('thinkingConfig');
});

it('accepts a native Google answer when an admitted summary is unavailable', async () => {
  const step = createStepFunction({ workspaceRoot, sessionId: 'empty-google-summary', systemPrompt: '', tools: [],
    catalog: BUILTIN_PROVIDERS, thinkingEffort: null, provider: { provider: 'google-ai', model: 'gemini-2.5-flash',
      baseUrl: 'https://generativelanguage.googleapis.com', endpoint: 'google-generative-ai' },
    fetchImpl: async () => Response.json({ candidates: [{ content: { parts: [{ text: 'answer' }] }, finishReason: 'STOP' }] }),
  });
  const result = await step([], undefined, {}, { allowTools: false });
  expect(result.text).toBe('answer'); expect(result.stopReason).not.toBe('error');
  expect(result.reasoning).toBeUndefined();
});

it('requests summary-only reasoning through the captured ChatGPT issuer route', async () => {
  const target = { provider: 'openai', model: 'o4-mini', credential: { provider: 'openai' as const,
    source: 'config' as const, envVarName: 'OPENAI_API_KEY', authMode: 'account-auth' as const,
    accountAuth: { type: 'openai-chatgpt-account' as const, accessToken: 'synthetic', refreshToken: 'synthetic', expiresAt: 1,
      accountId: 'synthetic-account' } } };
  const baseUrl = providerCredentialBaseUrl(BUILTIN_PROVIDERS, target)!;
  const endpoint = providerCredentialEndpoint(BUILTIN_PROVIDERS, target);
  let url: string | undefined, body: Record<string, unknown> | undefined;
  const output = [{ type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'answer' }] }];
  const step = createStepFunction({ workspaceRoot, sessionId: 'account-summary', systemPrompt: 'instructions',
    tools: [], thinkingEffort: null, catalog: BUILTIN_PROVIDERS, provider: { provider: 'openai', model: target.model,
      baseUrl, endpoint },
    fetchImpl: async (input, init) => {
      url = String(input); body = JSON.parse(String(init?.body));
      const events = [
        { type: 'response.output_item.added', output_index: 0, item: output[0] },
        { type: 'response.output_item.done', output_index: 0, item: output[0] },
        { type: 'response.done', response: { id: 'r', status: 'completed', output } },
      ];
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
        { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  const result = await step([], undefined, {}, { allowTools: false });
  expect(endpoint).toBe('openai-account-responses'); expect(body?.reasoning).toEqual({ summary: 'auto' });
  expect(url).toBe('https://chatgpt.com/backend-api/codex/responses');
  expect(body).not.toHaveProperty('max_output_tokens');
  expect(result.text).toBe('answer');
});
