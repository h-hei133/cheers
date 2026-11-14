import { describe, expect, it, vi } from 'vitest';
import { createStepFunction } from '../step.js';
import type { PreparedTurnContext, StepOptions, StepRequest } from './contract.js';
import { createTurnContextPreparer } from './prepare.js';
import type { AgentMessage } from '../../core/agent/state.js';
import type { MessageConverter } from '../../core/agent/messages.js';
import { VirtualModelRegistry } from '../../core/models/virtualModels.js';
import { FINAL_STEP_MESSAGE } from '../messages.js';
import { estimateRequestTokens } from '../../session/context.js';
import { getSessionUsage, resetSessionUsage } from '../../observability/usageTelemetry.js';

function request(overrides: Partial<StepRequest> = {}): StepRequest {
  return { provider: { headers: {}, baseUrl: 'https://prepare.test/v1', provider: 'fixture', model: 'ordinary' },
    workspaceRoot: process.cwd(), sessionId: 'prepared-context-fixture', systemPrompt: 'Base instruction', tools: [],
    maxOutputTokens: 1, contextWindow: 10_000,
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
      { headers: { 'content-type': 'application/json' } }), ...overrides };
}

function tool(name: string) {
  return { type: 'function' as const, function: { name, description: name, parameters: { type: 'object' } } };
}

describe('prepared turn context', () => {
  it('offers an overflowing full request before refusal and sends its once-converted candidate capture', async () => {
    const order: string[] = []; const sent: string[] = [];
    const raw: AgentMessage[] = [{ role: 'custom', customType: 'note', content: 'Original source', display: false, data: 'raw' }];
    const candidate: AgentMessage[] = [{ role: 'custom', customType: 'note', content: 'Candidate source', display: false, data: 'candidate' }];
    const virtualModels = new VirtualModelRegistry();
    virtualModels.register({ provider: 'fixture', id: 'ordinary', name: 'Virtual', route: context => {
      const label = context.messages[0]?.content === 'Original source' ? 'original' : 'candidate'; order.push(`route:${label}`);
      return { provider: 'fixture', modelId: label === 'original' ? 'large' : 'small' };
    } });
    const convertToLlm = vi.fn((messages: readonly AgentMessage[]) => {
      const label = messages[0]?.content === 'Original source' ? 'original' : 'candidate'; order.push(`convert:${label}`);
      return [{ role: 'system' as const, content: `Converted ${label}` },
        { role: 'user' as const, content: label === 'original' ? 'x'.repeat(2000) : 'Candidate wire' }];
    });
    let accepted!: PreparedTurnContext;
    const prepareContext = vi.fn(async (prepared: PreparedTurnContext) => {
      expect(prepared.budget.ok).toBe(false); expect(prepared.refusal?.detail).toContain('Context overflow:');
      accepted = await prepared.prepare(candidate);
      expect(accepted.systemPrompt).toBe('Base instruction\n\nConverted candidate');
      return accepted;
    });
    const step = createStepFunction(request({ virtualModels, contextWindow: 200,
      catalog: [{ id: 'fixture', baseUrl: 'https://prepare.test/v1', models: [{ id: 'large' }, { id: 'small' }] }],
      fetchImpl: async (_url, init) => { sent.push(String(init?.body)); return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } }); } }));
    const result = await step(raw, undefined, {}, { allowTools: false, convertToLlm, prepareContext });
    expect(result).toMatchObject({ text: 'ok', stopReason: 'stop', origin: { model: 'small' } });
    expect(order).toEqual(['route:original', 'convert:original', 'route:candidate', 'convert:candidate']);
    expect(prepareContext).toHaveBeenCalledTimes(1); expect(convertToLlm).toHaveBeenCalledTimes(2);
    expect(sent).toEqual([accepted.body]);
    expect(JSON.parse(sent[0]!).messages).toEqual([{ role: 'system', content: accepted.systemPrompt }, { role: 'user', content: 'Candidate wire' }]);
  });

  it('reuses initial loop conversion and prices the final closing message with withdrawn schemas', async () => {
    const convertToLlm = vi.fn(() => { throw new Error('Initial conversion must be reused'); });
    const original: AgentMessage[] = [{ role: 'custom', customType: 'note', content: 'Durable source', display: false }];
    const providerMessages = [{ role: 'system' as const, content: 'Injected instruction' }, { role: 'user' as const, content: 'Projected content' }];
    let captured!: PreparedTurnContext;
    const step = createStepFunction(request({ tools: [tool('read')] }));
    const result = await step([], undefined, {}, { allowTools: false, sourceMessages: original, providerMessages, convertToLlm,
      prepareContext: async prepared => { captured = prepared; return undefined; } });
    expect(result.stopReason).toBe('stop'); expect(convertToLlm).not.toHaveBeenCalled();
    expect(captured.overhead.tools).toEqual([]);
    expect(captured.budgetMessages.at(-1)?.content).toBe(FINAL_STEP_MESSAGE);
    expect(captured.prompt.tokens).toBeGreaterThan(0);
    expect(captured.sourceMessages).toEqual(original);
    expect(JSON.parse(captured.body).tools).toBeUndefined();
  });

  it('returns candidate byte preflight refusal without sending any request', async () => {
    const send = vi.fn(async () => new Response('{}'));
    const step = createStepFunction(request({ catalog: [{ id: 'fixture', baseUrl: 'https://prepare.test/v1', models: [{ id: 'ordinary',
      inputLimits: { maxRequestBytes: 400 } }] }], fetchImpl: send }));
    const result = await step([{ role: 'user', content: 'short' }], undefined, {}, { allowTools: false,
      prepareContext: prepared => prepared.prepare([{ role: 'user', content: 'x'.repeat(3000) }]) });
    expect(result).toMatchObject({ stopReason: 'error', retriesExhausted: true });
    expect(result.errorMessage).toContain('byte limit'); expect(send).not.toHaveBeenCalled();
  });

  it('reframes closing permissions without rerouting or reconverting and passes them to later candidates', async () => {
    const routed = vi.fn(() => ({ provider: 'fixture', modelId: 'ordinary' }));
    const registry = new VirtualModelRegistry(); registry.register({ provider: 'fixture', id: 'ordinary', name: 'Virtual', route: routed });
    const converted = vi.fn((messages: readonly AgentMessage[]) => [{ role: 'user' as const, content: messages[0]?.content }]);
    const sent: string[] = [];
    const stepRequest = request({ virtualModels: registry, tools: [tool('read'), tool('write')],
      provider: { headers: {}, baseUrl: 'https://prepare.test/v1', provider: 'fixture', model: 'ordinary', replayBinding: 'fixture-replay' },
      fetchImpl: async (_url, init) => { sent.push(String(init?.body)); return new Response(JSON.stringify({ choices: [{
        message: { content: 'ok' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } }); },
    });
    const prepare = createTurnContextPreparer(stepRequest, {
      allowTools: true, allowedTools: ['read'], agentMode: 'plan', requestPurpose: 'original', convertToLlm: converted,
    }, { explicitEffort: false, effortAccepted: () => true, streamAttempts: () => 0, replayBinding: 'fixture-replay' });
    const prepared = await prepare([{ role: 'user', content: 'Original source' }]);
    expect(JSON.parse(prepared.body).tools.map((entry: ReturnType<typeof tool>) => entry.function.name)).toEqual(['read']);
    expect(prepared.budgetMessages.at(-1)?.content).toBe('Original source');
    const allowedTools = ['read'];
    const closed = await prepared.reframe({ allowTools: false, allowedTools });
    allowedTools.push('write');
    expect(closed).toMatchObject({ allowTools: false, allowedTools: ['read'], requestPurpose: 'turn' });
    expect(closed.agentMode).toBeUndefined(); expect(Object.isFrozen(closed.allowedTools)).toBe(true);
    expect(closed.sourceMessages).toEqual(prepared.sourceMessages);
    expect(closed.messageProjection).toEqual(prepared.messageProjection);
    expect(closed.isCurrent()).toBe(true); expect(closed.overhead.tools).toEqual([]);
    expect(closed.budgetMessages.at(-1)?.content).toBe(FINAL_STEP_MESSAGE);
    expect(JSON.parse(closed.body).tools).toBeUndefined();
    expect(routed).toHaveBeenCalledTimes(1); expect(converted).toHaveBeenCalledTimes(1);
    let accepted = await closed.prepare([{ role: 'user', content: 'Candidate source' }]);
    expect(accepted).toMatchObject({ allowTools: false, allowedTools: ['read'], requestPurpose: 'turn' });
    expect(accepted.agentMode).toBeUndefined(); expect(accepted.budgetMessages.at(-1)?.content).toBe(FINAL_STEP_MESSAGE);
    expect(JSON.parse(accepted.body).tools).toBeUndefined();
    expect(routed).toHaveBeenCalledTimes(2); expect(converted).toHaveBeenCalledTimes(2);
    const reopened = await accepted.reframe({ allowTools: true, allowedTools: ['write'], agentMode: 'build', requestPurpose: 'next-call' });
    expect(reopened).toMatchObject({ allowTools: true, allowedTools: ['write'], agentMode: 'build', requestPurpose: 'next-call' });
    expect(reopened.budgetMessages.at(-1)?.content).toBe('Candidate source');
    expect(JSON.parse(reopened.body).tools.map((entry: ReturnType<typeof tool>) => entry.function.name)).toEqual(['write']);
    accepted = await accepted.refresh();
    expect(accepted.allowTools).toBe(false); expect(accepted.budgetMessages.at(-1)?.content).toBe(FINAL_STEP_MESSAGE);
    expect(routed).toHaveBeenCalledTimes(2); expect(converted).toHaveBeenCalledTimes(2);
    const result = await createStepFunction(stepRequest)(accepted.sourceMessages, undefined, {}, {
      allowTools: false, allowedTools: ['read'], preparedContext: accepted, convertToLlm: converted,
    });
    expect(result).toMatchObject({ text: 'ok', stopReason: 'stop', toolsAllowed: false });
    expect(sent).toEqual([accepted.body]);
    expect(routed).toHaveBeenCalledTimes(2); expect(converted).toHaveBeenCalledTimes(2);
  });

  it('refreshes changed declarations once using the same route and conversion', async () => {
    let tools = [tool('read')]; const sent: string[] = []; const routed = vi.fn(() => ({ provider: 'fixture', modelId: 'ordinary' }));
    const registry = new VirtualModelRegistry(); registry.register({ provider: 'fixture', id: 'ordinary', name: 'Virtual', route: routed });
    const converted = vi.fn((messages: readonly AgentMessage[]) => messages.map(message => ({ role: 'user' as const, content: message.content })));
    const callback = vi.fn(async () => { tools = [tool('write')]; return undefined; });
    const step = createStepFunction(request({ virtualModels: registry, toolSnapshot: () => tools,
      fetchImpl: async (_url, init) => { sent.push(String(init?.body)); return new Response(JSON.stringify({ choices: [{
        message: { content: 'ok' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } }); } }));
    expect((await step([{ role: 'user', content: 'Go' }], undefined, {}, { allowTools: true, convertToLlm: converted,
      prepareContext: callback })).stopReason).toBe('stop');
    expect(routed).toHaveBeenCalledTimes(1); expect(converted).toHaveBeenCalledTimes(1); expect(callback).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sent[0]!).tools[0].function.name).toBe('write');
  });

  it('refuses repeated dynamic system drift before any transport or reservation', async () => {
    let generation = 0;
    const send = vi.fn(async () => new Response('{}'));
    const reserve = vi.fn(() => ({ id: 'held', dispatch: vi.fn(), confirmUnsent: vi.fn(), settle: vi.fn() }));
    const step = createStepFunction(request({ systemPromptFor: () => `Generation ${generation++}`,
      requestPolicy: { reserve }, fetchImpl: send }));
    const result = await step([{ role: 'user', content: 'Go' }], undefined, {}, { allowTools: false, agentMode: 'build' });
    expect(result).toMatchObject({ stopReason: 'error', retriesExhausted: true });
    expect(result.errorMessage).toContain('changed repeatedly');
    expect(send).not.toHaveBeenCalled(); expect(reserve).not.toHaveBeenCalled();
  });


  it('releases an unsent reservation when declarations drift inside transport acquisition', async () => {
    let tools = [tool('read')];
    const confirmUnsent = vi.fn(); const dispatch = vi.fn(); const send = vi.fn(async () => new Response('{}'));
    const step = createStepFunction(request({ toolSnapshot: () => tools, fetchImpl: send,
      requestPolicy: { reserve: () => ({ id: 'held', dispatch, confirmUnsent, settle: vi.fn() }) },
      modelTransport: async (_input, _init, beforeDispatch) => {
        tools = [tool('write')]; beforeDispatch(); return new Response('{}');
      } }));
    const result = await step([{ role: 'user', content: 'Go' }], undefined, {}, { allowTools: true });
    expect(result).toMatchObject({ stopReason: 'error', retriesExhausted: true });
    expect(result.errorMessage).toContain('before dispatch');
    expect(confirmUnsent).toHaveBeenCalledTimes(1); expect(dispatch).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });

  it('refuses a changed request purpose instead of attributing the old capture to the new purpose', async () => {
    const send = vi.fn(async () => new Response('{}'));
    const reserve = vi.fn(() => ({ id: 'held', dispatch: vi.fn(), confirmUnsent: vi.fn(), settle: vi.fn() }));
    const options: { allowTools: boolean; requestPurpose: string; prepareContext?: StepOptions['prepareContext'] } = {
      allowTools: false, requestPurpose: 'turn',
    };
    options.prepareContext = async prepared => {
      expect(prepared.isCurrent()).toBe(true);
      options.requestPurpose = 'refresh';
      expect(prepared.isCurrent()).toBe(false);
      return undefined;
    };
    const step = createStepFunction(request({ fetchImpl: send, requestPolicy: { reserve } }));
    const result = await step([{ role: 'user', content: 'Go' }], undefined, {}, options);
    expect(result).toMatchObject({ stopReason: 'error', retriesExhausted: true });
    expect(result.errorMessage).toContain('Request purpose changed');
    expect(send).not.toHaveBeenCalled(); expect(reserve).not.toHaveBeenCalled();
  });

  it('refuses a changed converter reference without refreshing an old converted capture', async () => {
    const first = vi.fn(() => [{ role: 'user' as const, content: 'First projection' }]);
    const second = vi.fn(() => [{ role: 'user' as const, content: 'Second projection' }]);
    const send = vi.fn(async () => new Response('{}'));
    const options: { allowTools: boolean; convertToLlm: MessageConverter; prepareContext?: StepOptions['prepareContext'] } = {
      allowTools: false, convertToLlm: first,
    };
    options.prepareContext = async prepared => {
      expect(prepared.isCurrent()).toBe(true);
      options.convertToLlm = second;
      expect(prepared.isCurrent()).toBe(false);
      return undefined;
    };
    const step = createStepFunction(request({ fetchImpl: send }));
    const result = await step([{ role: 'user', content: 'Go' }], undefined, {}, options);
    expect(result).toMatchObject({ stopReason: 'error', retriesExhausted: true });
    expect(result.errorMessage).toContain('Message converter changed');
    expect(first).toHaveBeenCalledTimes(1); expect(second).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });

  it('clears coarse overflow refusal when the actual tokenized wire request fits', async () => {
    const messages: AgentMessage[] = [{ role: 'user', content: 'x'.repeat(30_000) }];
    const contextWindow = 5000;
    expect(estimateRequestTokens(messages, { systemPrompt: 'Base instruction', tools: [] })).toBeGreaterThan(contextWindow);
    let captured!: PreparedTurnContext;
    const send = vi.fn(async () => new Response(JSON.stringify({ choices: [{
      message: { content: 'ok' }, finish_reason: 'stop',
    }] }), { headers: { 'content-type': 'application/json' } }));
    const step = createStepFunction(request({ contextWindow, fetchImpl: send,
      catalog: [{ id: 'fixture', baseUrl: 'https://prepare.test/v1', models: [{ id: 'ordinary',
        tokenizer: 'cl100k_base', compat: { reasoningReplayField: 'reasoning_content' },
      }] }],
    }));
    const result = await step(messages, undefined, {}, { allowTools: false,
      prepareContext: async prepared => { captured = prepared; return undefined; },
    });
    expect(captured.prompt.tokens).toBeLessThan(contextWindow);
    expect(captured.budget.ok).toBe(true); expect(captured.refusal).toBeUndefined();
    expect(result).toMatchObject({ text: 'ok', stopReason: 'stop' }); expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(['sent', 'stream'] as const)('retains main request accounting after the %s callback changes mutable invocation fields', async callback => {
    const sessionId = `captured-accounting-${callback}`;
    resetSessionUsage(sessionId);
    const provider = { headers: {}, baseUrl: 'https://prepare.test/v1', provider: 'fixture', model: 'ordinary' };
    const auxiliary = vi.fn();
    const options: { allowTools: boolean; requestPurpose: string; agentMode?: 'plan' | 'build'; onRequestSent?: StepOptions['onRequestSent'] } = {
      allowTools: false, requestPurpose: 'original-turn',
    };
    const mutate = () => {
      options.requestPurpose = 'replacement-summary'; options.agentMode = 'build';
      provider.provider = 'replacement'; provider.model = 'replacement-model';
    };
    if (callback === 'sent') options.onRequestSent = mutate;
    const response = callback === 'stream'
      ? new Response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n\n'
        + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\n'
        + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
      : new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 2 } }), { headers: { 'content-type': 'application/json' } });
    const step = createStepFunction(request({ provider, sessionId, recordAuxiliaryUsage: auxiliary, fetchImpl: async () => response }));
    try {
      const result = await step([{ role: 'user', content: 'Go' }], undefined, callback === 'stream' ? { onText: mutate } : {}, options);
      expect(result).toMatchObject({ stopReason: 'stop', origin: { provider: 'fixture', model: 'ordinary' },
        promptMeasurement: { tokens: 10 } });
      const usage = getSessionUsage(sessionId);
      expect(usage.lastPromptIdentity).toMatchObject({ provider: 'fixture', model: 'ordinary' });
      expect(usage.recentRequests.at(-1)?.purpose).toBe('original-turn');
      expect(Object.values(usage.byModel)[0]?.attribution).toMatchObject({ provider: 'fixture', model: 'ordinary' });
      expect(auxiliary).not.toHaveBeenCalled();
    } finally { resetSessionUsage(sessionId); }
  });

  it('keeps delegated usage with its captured auxiliary owner after the sent callback changes mode and provider', async () => {
    const sessionId = 'captured-delegated-accounting'; resetSessionUsage(sessionId);
    const provider = { headers: {}, baseUrl: 'https://prepare.test/v1', provider: 'fixture', model: 'ordinary' };
    const auxiliary = vi.fn(); const replacementAuxiliary = vi.fn();
    const stepRequest = { ...request(), provider, sessionId, recordAuxiliaryUsage: auxiliary,
      fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 2 } }), { headers: { 'content-type': 'application/json' } }),
    };
    const options: { allowTools: boolean; requestPurpose: string; agentMode?: 'plan' | 'build'; onRequestSent?: StepOptions['onRequestSent'] } = {
      allowTools: false, requestPurpose: 'original-summary', agentMode: 'build',
    };
    options.onRequestSent = () => {
      options.requestPurpose = 'replacement-turn'; options.agentMode = undefined;
      provider.provider = 'replacement'; provider.model = 'replacement-model';
      stepRequest.recordAuxiliaryUsage = replacementAuxiliary;
    };
    const step = createStepFunction(stepRequest);
    try {
      const result = await step([{ role: 'user', content: 'Go' }], undefined, {}, options);
      expect(result).toMatchObject({ stopReason: 'stop', origin: { provider: 'fixture', model: 'ordinary' } });
      expect(result.promptMeasurement).toBeUndefined();
      expect(auxiliary).toHaveBeenCalledTimes(1);
      expect(auxiliary.mock.calls[0]?.[0]).toMatchObject({ provider: 'fixture', model: 'ordinary', purpose: 'original-summary',
        promptTokens: 10, completionTokens: 2 });
      expect(replacementAuxiliary).not.toHaveBeenCalled();
      expect(getSessionUsage(sessionId).recentRequests).toEqual([]);
    } finally { resetSessionUsage(sessionId); }
  });

});
