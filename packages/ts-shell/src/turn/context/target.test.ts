import { afterEach, expect, it, vi } from 'vitest';
import { createStepFunction, type StepRequest } from '../step.js';
import { createTurnContextPreparer } from './prepare.js';
import { VirtualModelRegistry } from '../../core/models/virtualModels.js';
import { requestReplayBinding } from '../../provider/request/replay.js';
import { resetSessionUsage } from '../../observability/usageTelemetry.js';

const sessionId = 'captured-route-target';
afterEach(() => resetSessionUsage(sessionId));
const response = () => new Response(JSON.stringify({ choices: [{ message: { content: 'accepted' }, finish_reason: 'stop' }] }),
  { headers: { 'content-type': 'application/json' } });
function fixture() {
  const registry = new VirtualModelRegistry();
  const route = vi.fn(() => ({ provider: 'physical', modelId: 'small' }));
  registry.register({ provider: 'selection', id: 'automatic', name: 'Automatic', route });
  const original = vi.fn(async () => response());
  const send = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
  const dispatch = vi.fn(); const reserve = vi.fn((_request: unknown) => ({ id: 'attempt', dispatch, confirmUnsent() {}, settle() {} }));
  const target = {
    provider: { provider: 'physical', model: 'small', baseUrl: 'https://physical.test/v2', endpoint: 'openai-compatible',
      headers: { authorization: 'Bearer synthetic-target' }, credentialId: 'physical:target', credentialGeneration: 'target-generation' },
    contextWindow: 5_000, maxOutputTokens: 20, fetchImpl: send,
    modelTransport: vi.fn(async (input: RequestInfo | URL, init: RequestInit, beforeDispatch: () => void) => {
      beforeDispatch(); return send(input, init);
    }),
    isCurrent: vi.fn(() => true),
  };
  const resolveTarget = vi.fn(async () => target);
  const request = { provider: { provider: 'selection', model: 'automatic', baseUrl: 'https://original.test/v1',
    headers: { authorization: 'Bearer synthetic-original' }, credentialId: 'selection:original', credentialGeneration: 'original-generation' },
    workspaceRoot: process.cwd(), sessionId, systemPrompt: '', tools: [], contextWindow: 50_000, maxOutputTokens: 10,
    catalog: [{ id: 'physical', endpoint: 'openai-compatible', baseUrl: target.provider.baseUrl,
      models: [{ id: 'small', contextWindow: 5_000, maxTokens: 20 }, { id: 'large', contextWindow: 8_000, maxTokens: 20 }] }],
    virtualModels: registry, resolveTarget, fetchImpl: original,
    modelTransport: vi.fn(async () => response()), requestPolicy: { reserve },
  } satisfies StepRequest & { resolveTarget: typeof resolveTarget };
  return { request, target, route, resolveTarget, original, send, dispatch, reserve };
}

it('sends the complete routed target and records its credential identity at the dispatch boundary', async () => {
  const test = fixture(); let replay: string | undefined;
  const result = await createStepFunction(test.request)([{ role: 'user', content: 'Proceed.' }], undefined, {}, {
    allowTools: false, onPreparedContext: prepared => { replay = prepared.replayBinding; },
  });
  expect(test.resolveTarget).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ text: 'accepted', origin: { provider: 'physical', model: 'small' } });
  expect(test.original).not.toHaveBeenCalled(); expect(test.request.modelTransport).not.toHaveBeenCalled();
  expect(test.target.modelTransport).toHaveBeenCalledOnce(); expect(test.send).toHaveBeenCalledOnce();
  const [url, init] = test.send.mock.calls[0]!;
  expect(url).toBe('https://physical.test/v2/chat/completions');
  expect(new Headers(init!.headers).get('authorization')).toBe('Bearer synthetic-target');
  expect(JSON.parse(String(init!.body)).max_tokens).toBe(20);
  expect(test.reserve).toHaveBeenCalledWith(expect.objectContaining({ provider: 'physical', model: 'small',
    credentialId: 'physical:target', credentialGeneration: 'target-generation' }));
  expect(test.dispatch).toHaveBeenCalledOnce();
  expect(replay).toBe(requestReplayBinding(test.target.provider));
});

it('refuses cross-provider routing without a physical target resolver before reserving or sending', async () => {
  const test = fixture();
  const request = { ...test.request, resolveTarget: undefined, maxOutputTokens: 10 };
  const result = await createStepFunction(request)([{ role: 'user', content: 'Proceed.' }], undefined, {}, { allowTools: false });
  expect(result.stopReason).toBe('error');
  expect(test.original).not.toHaveBeenCalled(); expect(test.request.modelTransport).not.toHaveBeenCalled();
  expect(test.reserve).not.toHaveBeenCalled();
});

it('retains one physical route through candidate history, declaration refresh and closing reframe', async () => {
  const test = fixture();
  const prepare = createTurnContextPreparer(test.request, { allowTools: true }, {
    explicitEffort: false, effortAccepted: () => true, streamAttempts: () => 0, replayBinding: 'original',
  });
  const first = await prepare([{ role: 'user', content: 'Original.' }]);
  test.route.mockReturnValue({ provider: 'physical', modelId: 'large' });
  const pending = first.prepare([{ role: 'user', content: 'Summary.' }]);
  await expect(pending).resolves.toMatchObject({ activeModel: 'small' });
  const candidate = await pending;
  const closing = await (await candidate.refresh()).reframe({ allowTools: false });
  expect(test.route).toHaveBeenCalledOnce(); expect(test.resolveTarget).toHaveBeenCalledOnce();
  expect(closing.activeModel).toBe('small'); expect(closing.url).toBe(first.url);
  expect(closing.headers).toEqual(first.headers); expect(closing.replayBinding).toBe(first.replayBinding);
  expect(closing.contextWindow).toBe(5_000);
  expect(JSON.parse(closing.body).model).toBe('small');
});

it('rejects a target changed while conversion was pending', async () => {
  const test = fixture();
  const result = await createStepFunction(test.request)([{ role: 'user', content: 'Proceed.' }], undefined, {}, {
    allowTools: false, convertToLlm: async messages => {
      test.target.provider.headers.authorization = 'Bearer synthetic-successor'; return messages;
    },
  });
  expect(result.stopReason).toBe('error');
  expect(test.send).not.toHaveBeenCalled(); expect(test.original).not.toHaveBeenCalled();
  expect(test.request.modelTransport).not.toHaveBeenCalled(); expect(test.reserve).not.toHaveBeenCalled();
});

it('rechecks routed admission at the actual transport handoff', async () => {
  const test = fixture();
  test.target.modelTransport.mockImplementation(async (_input, _init, beforeDispatch) => {
    test.target.isCurrent.mockReturnValue(false); beforeDispatch(); return response();
  });
  const result = await createStepFunction(test.request)([{ role: 'user', content: 'Proceed.' }], undefined, {}, { allowTools: false });
  expect(result.stopReason).toBe('error');
  expect(test.dispatch).not.toHaveBeenCalled(); expect(test.send).not.toHaveBeenCalled();
  expect(test.request.modelTransport).not.toHaveBeenCalled();
});

it('keeps HTTP transient retries on the same captured transport, body and credential', async () => {
  const test = fixture();
  test.send.mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }));
  const result = await createStepFunction({ ...test.request,
    retry: { enabled: true, maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 },
  })([{ role: 'user', content: 'Proceed.' }], undefined, {}, { allowTools: false });
  expect(result.stopReason).toBe('stop');
  expect(test.route).toHaveBeenCalledOnce(); expect(test.resolveTarget).toHaveBeenCalledOnce();
  expect(test.send).toHaveBeenCalledTimes(2); expect(test.target.modelTransport).toHaveBeenCalledTimes(2);
  expect(test.send.mock.calls.map(([url, init]) => [String(url), init!.body, new Headers(init!.headers).get('authorization')]))
    .toEqual(Array.from({ length: 2 }, () => ['https://physical.test/v2/chat/completions', test.send.mock.calls[0]![1]!.body,
      'Bearer synthetic-target']));
  expect(test.reserve.mock.calls.map(([request]) => request)).toEqual(Array.from({ length: 2 }, () => expect.objectContaining({
    credentialId: 'physical:target', credentialGeneration: 'target-generation',
  })));
  expect(test.original).not.toHaveBeenCalled(); expect(test.request.modelTransport).not.toHaveBeenCalled();
});

it('does not inherit virtual output limits when the physical target has no override', async () => {
  const test = fixture();
  Object.assign(test.target, { contextWindow: undefined, maxOutputTokens: undefined });
  let capturedWindow: number | undefined;
  const result = await createStepFunction({ ...test.request, maxOutputTokens: 40 })([{ role: 'user', content: 'Proceed.' }],
    undefined, {}, { allowTools: false, onPreparedContext: prepared => { capturedWindow = prepared.contextWindow; } });
  expect(result.stopReason).toBe('stop'); expect(capturedWindow).toBe(5_000);
  expect(JSON.parse(String(test.send.mock.calls[0]![1]!.body)).max_tokens).toBe(20);
});

it('cancels a pending physical target resolution without dispatching either target', async () => {
  const test = fixture(); const controller = new AbortController();
  test.resolveTarget.mockImplementation(async () => { controller.abort(); return test.target; });
  const result = await createStepFunction(test.request)([{ role: 'user', content: 'Proceed.' }], controller.signal, {}, { allowTools: false });
  expect(result.stopReason).toBe('aborted');
  expect(test.reserve).not.toHaveBeenCalled(); expect(test.send).not.toHaveBeenCalled();
  expect(test.original).not.toHaveBeenCalled(); expect(test.request.modelTransport).not.toHaveBeenCalled();
});

it('binds returned reasoning to the actual target so the next request can replay it', async () => {
  const test = fixture();
  test.send.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: {
    content: 'accepted', reasoning_content: 'Preserved reasoning.',
  }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } }));
  const step = createStepFunction({ ...test.request, catalog: test.request.catalog.map(provider => ({ ...provider,
    models: provider.models.map(model => ({ ...model, reasoning: true,
      compat: { reasoningReplayField: 'reasoning_content' as const } })),
  })) });
  const messages = [{ role: 'user' as const, content: 'Proceed.' }];
  const first = await step(messages, undefined, {}, { allowTools: false });
  expect(first.reasoning).toEqual({ text: 'Preserved reasoning.' });
  expect(first.origin).toMatchObject({ provider: 'physical', model: 'small', replayBinding: requestReplayBinding(test.target.provider) });
  const next = await step([...messages, { role: 'assistant', content: first.text, reasoning: first.reasoning, origin: first.origin },
    { role: 'user', content: 'Continue.' }], undefined, {}, { allowTools: false });
  expect(next.stopReason).toBe('stop');
  expect(JSON.parse(String(test.send.mock.calls[1]![1]!.body)).messages).toContainEqual(expect.objectContaining({
    role: 'assistant', reasoning_content: 'Preserved reasoning.',
  }));
});

it('rejects a withdrawn same-provider transport while conversion was pending', async () => {
  const test = fixture();
  test.route.mockReturnValue({ provider: 'selection', modelId: 'ordinary' });
  const request = { ...test.request, resolveTarget: undefined, maxOutputTokens: 10 };
  const original = request.modelTransport;
  const replacement = vi.fn(async () => response());
  const result = await createStepFunction(request)([{ role: 'user', content: 'Proceed.' }], undefined, {}, {
    allowTools: false, convertToLlm: async messages => { request.modelTransport = replacement; return messages; },
  });
  expect(result.stopReason).toBe('error');
  expect(test.reserve).not.toHaveBeenCalled(); expect(original).not.toHaveBeenCalled();
  expect(replacement).not.toHaveBeenCalled(); expect(test.original).not.toHaveBeenCalled();
});

it('does not acquire a replacement transport changed by the router itself', async () => {
  const test = fixture();
  const request = { ...test.request, resolveTarget: undefined, maxOutputTokens: 10 };
  const original = request.modelTransport;
  const replacement = vi.fn(async () => response());
  test.route.mockImplementation(() => {
    request.modelTransport = replacement;
    return { provider: 'selection', modelId: 'ordinary' };
  });
  const result = await createStepFunction(request)([{ role: 'user', content: 'Proceed.' }], undefined, {}, { allowTools: false });
  expect(result.stopReason).toBe('error');
  expect(test.reserve).not.toHaveBeenCalled(); expect(original).not.toHaveBeenCalled();
  expect(replacement).not.toHaveBeenCalled(); expect(test.original).not.toHaveBeenCalled();
});
