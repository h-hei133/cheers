import { afterEach, expect, it, vi } from 'vitest';
import { prepareRequestAttempt } from './attempt.js';
import { requestSimpleCompletion } from './completion.js';
import { sendSentRequest } from './sentRequest.js';
import { requestCompactionSummary } from '../../core/query/compaction/summarize.js';
import { createStepFunction } from '../../turn/step.js';
import { resolveRequestShape } from '../../core/models/requestShape.js';
import { historyDigest } from '../../context/request/identity.js';
import { readMedia } from '../../runtime/execution/media/index.js';
import { MediaReadError } from '../../runtime/execution/media/model.js';
import type { ImageContent } from '../../model-adapters/multimodal.js';
import type { CatalogProvider } from '../../core/models/catalog.js';
import type { PreparedRequest, RequestPolicy } from '../../core/agent/request/model.js';
import type { SentRequest } from './sentRequest.js';
import { inspectImage } from '../../model-adapters/image/input.js';
import { createHash } from 'node:crypto';
import { requestReplayBinding } from './replay.js';

afterEach(() => { vi.restoreAllMocks(); });

const pixel: ImageContent = { type: 'image', mimeType: 'image/png',
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' };
const resize = { maxWidth: 1, maxHeight: 1, maxBytes: 1000, jpegQuality: 80 };
const provider = { providerId: 'fixture', headers: {}, baseUrl: 'https://provider.invalid', model: 'm', endpoint: 'openai-compatible' };
const fixtureProvider: Pick<CatalogProvider, 'id' | 'label' | 'runtime' | 'auth'> = {
  id: 'fixture', label: 'Fixture', runtime: 'openai-compatible', auth: 'api-key',
};
function shape(endpoint = 'openai-compatible', limits = { images: { resize } }) {
  const catalogue: CatalogProvider[] = [{ ...fixtureProvider, endpoint, models: [{ id: 'm', vision: true, inputLimits: limits }] }];
  return resolveRequestShape(catalogue, 'fixture', 'm', undefined, provider.baseUrl, endpoint);
}
function policy() {
  const reserve = vi.fn((_request: PreparedRequest) => ({ id: 'fixture', dispatch: vi.fn(), confirmUnsent: vi.fn(), settle: vi.fn() }));
  return { reserve } satisfies RequestPolicy;
}
function answer(endpoint: string): Response {
  if (endpoint === 'anthropic-messages') return Response.json({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' });
  if (endpoint === 'google-generative-ai' || endpoint === 'google-vertex') return Response.json({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] });
  if (endpoint === 'openai-responses') return Response.json({ status: 'completed', output: [{ type: 'message', id: 'msg_1', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] }] });
  if (endpoint === 'bedrock-converse-stream') return Response.json({ output: { message: { role: 'assistant', content: [{ text: 'ok' }] } }, stopReason: 'end_turn' });
  return Response.json({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] });
}

it('refuses final UTF-8 bytes before reserving or dispatching, including text-only requests', async () => {
  const requestPolicy = policy();
  const body = JSON.stringify({ messages: [{ role: 'user', content: '😀Ω' }] });
  expect(Buffer.byteLength(body)).toBeGreaterThan(body.length);
  await expect(prepareRequestAttempt({ body, provider: 'fixture', model: 'm', endpoint: 'openai-compatible', purpose: 'turn',
    policy: requestPolicy, inputLimits: { maxRequestBytes: body.length } })).rejects.toThrow(/byte limit/);
  expect(requestPolicy.reserve).not.toHaveBeenCalled();
});

it.each([{ maxRequestBytes: 0 }, { images: { maxPerRequest: -1 } }, { images: { resize: { jpegQuality: 101 } } }])(
  'rejects invalid configured input limits before reservation', async inputLimits => {
    const requestPolicy = policy();
    await expect(prepareRequestAttempt({ body: '{}', provider: 'fixture', model: 'm', endpoint: 'openai-compatible', purpose: 'turn',
      policy: requestPolicy, inputLimits })).rejects.toThrow(/invalid input limits/);
    expect(requestPolicy.reserve).not.toHaveBeenCalled();
  });

it.each(['openai-compatible', 'openai-responses', 'anthropic-messages', 'google-generative-ai', 'google-vertex', 'bedrock-converse-stream'])(
  'passes compliant inline images through the simple %s codec without native processing', async endpoint => {
    const native = vi.spyOn(readMedia, 'resize').mockRejectedValue(new MediaReadError('unavailable'));
    let body = '';
    const fetchImpl: typeof fetch = async (_url, init) => { body = String(init?.body); return answer(endpoint); };
    const result = await requestSimpleCompletion({ provider: { ...provider, endpoint, fetchImpl }, shape: shape(endpoint),
      messages: [{ role: 'user', content: [pixel] }] });
    expect(result).toBe('ok'); expect(body).toContain(pixel.data); expect(native).not.toHaveBeenCalled();
    expect(body).not.toContain('non-vision fallback');
  });

it.each(['simple', 'turn'] as const)('preserves the existing JPEG MIME alias through %s input admission without native resizing', async mode => {
  const data = Buffer.from([255, 216, 255, 192, 0, 17, 8, 3, 0, 4, 0, 3, 1, 34, 0, 2, 17, 1, 3, 17, 1, 255, 217]).toString('base64');
  const source: ImageContent = { type: 'image', mimeType: 'image/jpg', data };
  const messages = [{ role: 'user' as const, content: [source] }];
  const inputLimits = { images: { resize: { maxWidth: 1024, maxHeight: 768, maxBytes: 1000, jpegQuality: 80 } } };
  const native = vi.spyOn(readMedia, 'resize').mockRejectedValue(new MediaReadError('unavailable'));
  const endpoint = 'bedrock-converse-stream';
  let wire: { messages: { content: { image: { format: string; source: { bytes: string } } }[] }[] } | undefined;
  const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    wire = JSON.parse(String(init?.body)); return answer(endpoint);
  }) as typeof fetch;
  if (mode === 'simple') {
    await expect(requestSimpleCompletion({ provider: { ...provider, endpoint, fetchImpl },
      shape: shape(endpoint, inputLimits), messages })).resolves.toBe('ok');
  } else {
    const step = createStepFunction({ provider: { ...provider, provider: provider.providerId, endpoint },
      workspaceRoot: process.cwd(), sessionId: 'jpeg-alias', systemPrompt: '', tools: [], fetchImpl,
      catalog: [{ ...fixtureProvider, endpoint, models: [{ id: 'm', vision: true, inputLimits }] }] });
    expect((await step(messages, undefined, {}, { allowTools: false })).text).toBe('ok');
  }
  expect(wire?.messages[0]?.content[0]?.image).toEqual({ format: 'jpeg', source: { bytes: data } });
  expect(fetchImpl).toHaveBeenCalledOnce(); expect(native).not.toHaveBeenCalled();
  expect(messages[0].content[0]).toBe(source); expect(source.mimeType).toBe('image/jpg');
});

it('normalizes the main projection once and binds its wire digest while leaving the raw history unchanged', async () => {
  const sourceBytes = Buffer.from(pixel.data, 'base64'); sourceBytes.writeUInt32BE(2, 16);
  const source = { ...pixel, data: sourceBytes.toString('base64') };
  const messages = [{ role: 'user' as const, content: [source] }];
  const original = structuredClone(messages);
  const native = vi.spyOn(readMedia, 'resize').mockResolvedValue(pixel);
  const requestPolicy = policy();
  let captured: SentRequest | undefined;
  const step = createStepFunction({ provider: { ...provider, provider: provider.providerId }, workspaceRoot: process.cwd(),
    sessionId: 'input-limits-projection', systemPrompt: '', tools: [], requestPolicy,
    catalog: [{ ...fixtureProvider, models: [{ id: 'm', vision: true, inputLimits: { images: { resize } } }] }],
    fetchImpl: async () => answer('openai-compatible') });
  const result = await step(messages, undefined, {}, { allowTools: false, onRequestSent: sent => { captured = sent; } });
  expect(result.text).toBe('ok'); expect(messages).toEqual(original); expect(native).toHaveBeenCalledOnce();
  expect(captured?.body).toContain(pixel.data); expect(captured?.body).not.toContain(source.data);
  expect(captured?.promptIdentity?.historyDigest).toBe(historyDigest(messages));
  expect(captured?.promptIdentity?.wireHistoryDigest).toBe(historyDigest([{ role: 'user', content: [pixel] }]));
  expect(captured?.inputLimits?.images?.resize).toEqual(resize);
  expect(requestPolicy.reserve).toHaveBeenCalledOnce();
  expect(requestPolicy.reserve.mock.calls[0]?.[0]).toMatchObject({
    bodyDigest: createHash('sha256').update(captured!.body).digest('hex'),
  });
});

it('normalizes simple request images through the same owner before final admission', async () => {
  const bytes = Buffer.from(pixel.data, 'base64'); bytes.writeUInt32BE(2, 20);
  const source = { ...pixel, data: bytes.toString('base64') };
  const messages = [{ role: 'user' as const, content: [source] }];
  const native = vi.spyOn(readMedia, 'resize').mockResolvedValue(pixel);
  const requestPolicy = policy(); let body = '';
  const fetchImpl: typeof fetch = async (_url, init) => { body = String(init?.body); return answer('anthropic-messages'); };
  await expect(requestSimpleCompletion({ provider: { ...provider, endpoint: 'anthropic-messages', fetchImpl },
    shape: shape('anthropic-messages'), messages, requestPolicy })).resolves.toBe('ok');
  expect(native).toHaveBeenCalledOnce(); expect(body).toContain(pixel.data); expect(body).not.toContain(source.data);
  expect(messages[0]!.content[0]).toBe(source); expect(requestPolicy.reserve).toHaveBeenCalledOnce();
});

it('refuses required but unavailable native resizing in both foreground and simple requests without retries or reservations', async () => {
  const bytes = Buffer.from(pixel.data, 'base64'); bytes.writeUInt32BE(2, 16);
  const source = { ...pixel, data: bytes.toString('base64') };
  vi.spyOn(readMedia, 'resize').mockRejectedValue(new MediaReadError('unavailable'));
  const fetchImpl = vi.fn(async () => answer('openai-compatible')) as unknown as typeof fetch;
  const requestPolicy = policy();
  await expect(requestSimpleCompletion({ provider: { ...provider, fetchImpl }, shape: shape(), requestPolicy,
    messages: [{ role: 'user', content: [source] }] })).rejects.toThrow(/unavailable/);
  const step = createStepFunction({ provider: { ...provider, provider: provider.providerId }, workspaceRoot: process.cwd(),
    sessionId: 'input-limits-unavailable', systemPrompt: '', tools: [], requestPolicy, retry: { maxRetries: 3 }, fetchImpl,
    catalog: [{ ...fixtureProvider, models: [{ id: 'm', vision: true, inputLimits: { images: { resize } } }] }] });
  const result = await step([{ role: 'user', content: [source] }], undefined, {}, { allowTools: false });
  expect(result).toMatchObject({ stopReason: 'error', retriesExhausted: true });
  expect(result.errorMessage).toContain('unavailable'); expect(fetchImpl).not.toHaveBeenCalled(); expect(requestPolicy.reserve).not.toHaveBeenCalled();
});

it('checks protocol message grouping after parallel tool images become one user message', async () => {
  const tool = (id: string) => ({ role: 'tool' as const, tool_call_id: id, content: [pixel] });
  const requestPolicy = policy();
  const fetchImpl = vi.fn(async () => answer('openai-compatible')) as unknown as typeof fetch;
  await expect(requestSimpleCompletion({ provider: { ...provider, fetchImpl },
    shape: { ...shape(), inputLimits: { images: { maxPerMessage: 1, maxPerRequest: 3, resize } } }, requestPolicy,
    messages: [tool('one'), tool('two')] })).rejects.toThrow(/message.*count limit/);
  expect(fetchImpl).not.toHaveBeenCalled(); expect(requestPolicy.reserve).not.toHaveBeenCalled();
});

it('refuses an aggregate image count even when each protocol message fits', async () => {
  const requestPolicy = policy();
  const fetchImpl = vi.fn(async () => answer('openai-compatible')) as unknown as typeof fetch;
  await expect(requestSimpleCompletion({ provider: { ...provider, fetchImpl },
    shape: { ...shape(), inputLimits: { images: { maxPerMessage: 1, maxPerRequest: 1, resize } } }, requestPolicy,
    messages: [{ role: 'user', content: [pixel] }, { role: 'assistant', content: 'compare another' }, { role: 'user', content: [pixel] }] })).rejects.toThrow(/request.*count limit/);
  expect(fetchImpl).not.toHaveBeenCalled(); expect(requestPolicy.reserve).not.toHaveBeenCalled();
});

it('uses exact relay catalogue limits for the main request without borrowing another provider row', async () => {
  const requestPolicy = policy();
  const fetchImpl = vi.fn(async () => answer('openai-compatible')) as unknown as typeof fetch;
  const step = createStepFunction({ provider: { headers: {}, baseUrl: 'https://relay.invalid/v1', model: 'm', provider: 'openai-compatible' },
    workspaceRoot: process.cwd(), sessionId: 'input-limits-exact-relay', systemPrompt: '', tools: [], fetchImpl, requestPolicy,
    catalog: [{ id: 'other', label: 'Other', runtime: 'openai-compatible', auth: 'api-key', models: [{ id: 'm', vision: true, inputLimits: { maxRequestBytes: 10000 } }] },
      { id: 'relay', label: 'Relay', runtime: 'openai-compatible', auth: 'api-key', baseUrl: 'https://relay.invalid/v1', models: [{ id: 'm', vision: true, inputLimits: { maxRequestBytes: 1 } }] }] });
  const result = await step([{ role: 'user', content: 'hello' }], undefined, {}, { allowTools: false });
  expect(result.errorMessage).toContain('byte limit'); expect(fetchImpl).not.toHaveBeenCalled(); expect(requestPolicy.reserve).not.toHaveBeenCalled();
});

it('preserves accepted bytes across cache refresh without repeating image normalization', async () => {
  const bytes = Buffer.from(pixel.data, 'base64'); bytes.writeUInt32BE(2, 16);
  const native = vi.spyOn(readMedia, 'resize').mockResolvedValue(pixel);
  let captured: SentRequest | undefined; let refreshed = '';
  const step = createStepFunction({ provider: { ...provider, provider: provider.providerId }, workspaceRoot: process.cwd(),
    sessionId: 'input-limits-refresh', systemPrompt: '', tools: [], maxOutputTokens: 2,
    catalog: [{ ...fixtureProvider, models: [{ id: 'm', vision: true, inputLimits: { images: { resize } } }] }],
    fetchImpl: async () => answer('openai-compatible') });
  await step([{ role: 'user', content: [{ ...pixel, data: bytes.toString('base64') }] }], undefined, {},
    { allowTools: false, onRequestSent: sent => { captured = sent; } });
  await sendSentRequest(captured!, undefined, async (_url, init) => { refreshed = String(init?.body); return answer('openai-compatible'); });
  expect(JSON.parse(refreshed).messages).toEqual(JSON.parse(captured!.body).messages);
  expect(native).toHaveBeenCalledOnce();
});

it('budgets converted protocol images independently from their base64 length before final dispatch', async () => {
  const requestPolicy = policy();
  const fetchImpl = vi.fn(async () => answer('openai-compatible')) as unknown as typeof fetch;
  const step = createStepFunction({ provider: { ...provider, provider: provider.providerId }, workspaceRoot: process.cwd(),
    sessionId: 'input-limits-wire-budget', systemPrompt: '', tools: [], fetchImpl, requestPolicy, maxOutputTokens: 1,
    catalog: [{ ...fixtureProvider, models: [{ id: 'm', vision: true, contextWindow: 2060, inputLimits: { images: { resize } } }] }] });
  const result = await step([{ role: 'user', content: [pixel] }], undefined, {}, { allowTools: false });
  expect(result.errorMessage).toContain('Context overflow'); expect(fetchImpl).not.toHaveBeenCalled(); expect(requestPolicy.reserve).not.toHaveBeenCalled();
});

it('retains signed replay when local token counting is unavailable while still admitting image bytes', async () => {
  let serialized = '';
  const target = { ...provider, provider: provider.providerId, endpoint: 'anthropic-messages' };
  const step = createStepFunction({ provider: target,
    workspaceRoot: process.cwd(), sessionId: 'input-limits-signed', systemPrompt: '', tools: [],
    catalog: [{ ...fixtureProvider, models: [{ id: 'm', vision: true, inputLimits: { images: { resize } } }] }],
    fetchImpl: async (_url, init) => { serialized = String(init?.body); return answer('anthropic-messages'); } });
  const result = await step([{ role: 'assistant', content: 'prior answer', reasoning: { text: 'prior thought', signature: 'signed' },
    origin: { provider: 'fixture', model: 'm', replayBinding: requestReplayBinding(target) } },
    { role: 'user', content: [pixel] }], undefined, {}, { allowTools: false });
  expect(result.text).toBe('ok'); expect(serialized).toContain('signed'); expect(serialized).toContain(pixel.data);
});

it('keeps tool argument/result JSON outside the image traversal and counts nested protocol image outputs', async () => {
  const literal = { image: { format: 'png', source: { bytes: pixel.data } }, type: 'input_image', image_url: `data:image/png;base64,${pixel.data}` };
  const harmless = JSON.stringify({ messages: [{ role: 'assistant', content: [{ type: 'tool_use', input: literal }] },
    { role: 'user', content: [{ type: 'tool_result', content: JSON.stringify(literal) }] }] });
  await expect(prepareRequestAttempt({ body: harmless, provider: 'fixture', model: 'm', endpoint: 'anthropic-messages', purpose: 'turn',
    inputLimits: { images: { maxPerRequest: 0 } } })).resolves.toBeDefined();
  const requestPolicy = policy();
  const body = JSON.stringify({ input: [{ type: 'function_call_output', call_id: 'one', output: [literal] }] });
  await expect(prepareRequestAttempt({ body, provider: 'fixture', model: 'm', endpoint: 'openai-responses', purpose: 'turn',
    policy: requestPolicy, inputLimits: { images: { maxPerRequest: 0 } } })).rejects.toThrow(/count limit/);
  expect(requestPolicy.reserve).not.toHaveBeenCalled();
});

it('applies final byte admission to compaction and captured cache refresh bodies', async () => {
  const requestPolicy = policy();
  const fetchImpl = vi.fn(async () => answer('openai-compatible')) as unknown as typeof fetch;
  await expect(requestCompactionSummary({ provider: { ...provider, shape: { ...shape(), inputLimits: { maxRequestBytes: 1 } } },
    messages: [{ role: 'user', content: 'summarize' }], fetchImpl, requestPolicy })).rejects.toThrow(/byte limit/);
  await expect(sendSentRequest({ url: provider.baseUrl, headers: {}, endpoint: provider.endpoint,
    body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'cached' }], max_tokens: 2 }), inputLimits: { maxRequestBytes: 1 } },
  undefined, fetchImpl, { provider: 'fixture', model: 'm', policy: requestPolicy })).rejects.toThrow(/byte limit/);
  expect(fetchImpl).not.toHaveBeenCalled(); expect(requestPolicy.reserve).not.toHaveBeenCalled();
});

it('rejects malformed encoding and excessive image bytes without decoding unbounded input', () => {
  expect(() => inspectImage({ ...pixel, data: 'AA==\n' })).toThrow(/base64/);
  expect(() => inspectImage({ ...pixel, mimeType: 'image/jpeg' })).toThrow(/format/);
  const truncated = Buffer.from(pixel.data, 'base64').subarray(0, 24).toString('base64');
  expect(() => inspectImage({ ...pixel, data: truncated })).toThrow(/PNG header/);
  expect(() => inspectImage({ ...pixel, data: 'A'.repeat(Math.ceil(16 * 1024 * 1024 / 3) * 4 + 4) })).toThrow(/source limit/);
});

it.each([
  ['anthropic-messages', { messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'https://image.invalid' } }] }] }],
  ['openai-compatible', { messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://image.invalid' } }] }] }],
  ['openai-responses', { input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'https://image.invalid' }] }] }],
  ['google-generative-ai', { contents: [{ role: 'user', parts: [{ inlineData: { data: pixel.data } }] }] }],
  ['bedrock-converse-stream', { messages: [{ role: 'user', content: [{ image: { format: 'png' } }] }] }],
] as const)('rejects unverifiable %s images rather than treating them as compliant', async (endpoint, payload) => {
  const requestPolicy = policy();
  await expect(prepareRequestAttempt({ body: JSON.stringify(payload), provider: 'fixture', model: 'm', endpoint, purpose: 'turn',
    policy: requestPolicy, inputLimits: { images: { resize } } })).rejects.toThrow(/verifiable encoding/);
  expect(requestPolicy.reserve).not.toHaveBeenCalled();
});
