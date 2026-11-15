import { expect, it, vi } from 'vitest';
import { AgentCore } from '../core/agent/agent.js';
import { convertMessages } from '../core/agent/messages.js';
import type { AgentMessage, StandardAgentMessage } from '../core/agent/state.js';
import type { QueryEvent } from '../core/query/runtime/events.js';
import type { SessionMessage } from '../session/schema/sessionMessage.js';
import { createStepFunction, type PreparedTurnContext, type StepFunction } from './step.js';
import { createTurnRequest } from './request.js';
import { EventChannel } from './stream.js';
import { VirtualModelRegistry, type ModelRouteRequest } from '../core/models/virtualModels.js';

const marker: StandardAgentMessage = { id: 'declaration', role: 'system', content: '', requestDeclaration: { version: 1,
  target: { provider: 'fixture', model: 'model', endpoint: 'anthropic', replayBinding: 'a'.repeat(64) }, tools: [] } };

it('retains native preparation through both wrappers and publishes before live state', async () => {
  const converter = vi.fn((messages: readonly AgentMessage[]) => messages.map(message => ({ ...message, role: message.role === 'custom' ? 'user' as const : message.role })));
  const persisted: SessionMessage[] = [];
  const step: StepFunction = Object.assign(async (messages: readonly AgentMessage[], signal: AbortSignal | undefined,
    _listener: Parameters<StepFunction>[2], options: Parameters<StepFunction>[3]) => {
    expect(messages[0]!.content).toBe('Original history');
    expect(converter).not.toHaveBeenCalled();
    expect(options.sourceMessages).toEqual(messages);
    expect(options.onDeclaration).toBeTypeOf('function');
    const prospective = [...options.sourceMessages!, marker];
    const converted = await convertMessages(prospective, options.convertToLlm, signal);
    options.onDeclaration!(marker, { ...converted, sourceMessages: prospective });
    expect(core.state.messages.filter(message => message.requestDeclaration)).toEqual([marker]);
    return { text: 'done', toolCalls: [], stopReason: 'stop' as const };
  }, { preparesContext: true });
  const request = createTurnRequest({ step, sessionId: 'publication', maxSteps: 3, convertToLlm: converter,
    onMessage: message => {
      expect(core.state.messages.some(entry => entry.requestDeclaration)).toBe(false);
      persisted.push(message);
    } }, { stepCount: 0 }, new EventChannel<QueryEvent>());
  expect(request.preparesContext).toBe(true);
  const core = new AgentCore({ streamStep: request, convertToLlm: converter });
  const ends: AgentMessage[] = [];
  core.subscribe(event => { if (event.type === 'message_end') ends.push(event.message); });
  await core.prompt({ role: 'user', content: 'Original history' });
  expect(converter).toHaveBeenCalledTimes(1);
  expect(persisted).toEqual([marker]);
  expect(ends.some(message => message.requestDeclaration)).toBe(false);
});

it('preserves the exact opening identity against a detached source for preparation accounting', async () => {
  const opening: SessionMessage = { role: 'user', content: 'Framed prompt' };
  const stored: SessionMessage = { role: 'user', content: 'Accepted prompt' };
  const step: StepFunction = Object.assign(async (messages: readonly AgentMessage[], _signal: AbortSignal | undefined,
    _listener: Parameters<StepFunction>[2], options: Parameters<StepFunction>[3]) => {
    expect(messages[0]).toBe(opening);
    expect(options.sourceMessages![0]).not.toBe(opening);
    expect(options.promptSource?.opening).toBe(options.sourceMessages![0]);
    expect(options.promptSource?.stored).toBe(stored);
    return { text: 'done', toolCalls: [], stopReason: 'stop' as const };
  }, { preparesContext: true });
  const request = createTurnRequest({ step, sessionId: 'opening', maxSteps: 3 }, { stepCount: 0 },
    new EventChannel<QueryEvent>(), { opening, stored });
  const source: readonly AgentMessage[] = [{ ...opening }];
  await request([opening], undefined, { requestId: 'opening', sourceMessages: source });
});

it.each(['throws', 'promise', 'getter'] as const)('refuses %s declaration persistence without dispatch or application getters', async failure => {
  let dispatched = false;
  const getter = vi.fn(() => { throw new Error('must not run'); });
  const persist = vi.fn(() => {
    if (failure === 'throws') throw new Error('secret provider response');
    if (failure === 'promise') return Promise.reject(new Error('late persistence failure'));
    return Object.defineProperty({}, 'then', { get: getter });
  });
  const step: StepFunction = Object.assign(async (messages: readonly AgentMessage[], signal: AbortSignal | undefined,
    _listener: Parameters<StepFunction>[2], options: Parameters<StepFunction>[3]) => {
    const prospective = [...(options.sourceMessages ?? messages), marker];
    options.onDeclaration!(marker, { ...await convertMessages(prospective, undefined, signal), sourceMessages: prospective });
    dispatched = true;
    return { text: 'done', toolCalls: [], stopReason: 'stop' as const };
  }, { preparesContext: true });
  const core = new AgentCore({ streamStep: createTurnRequest({ step, sessionId: 'publication-failure', maxSteps: 3,
    onMessage: persist }, { stepCount: 0 }, new EventChannel<QueryEvent>()) });
  await core.prompt({ role: 'user', content: 'Original history' });
  expect(dispatched).toBe(false);
  expect(core.state.messages.some(message => message.requestDeclaration)).toBe(false);
  expect(core.state.errorMessage).toBe('Request declaration persistence failed. No request was sent.');
  expect(persist).toHaveBeenCalledTimes(1);
  expect(getter).not.toHaveBeenCalled();
});

it('does not grant declaration publication to an alternate prepared step', async () => {
  const persist = vi.fn();
  const step: StepFunction = Object.assign(async (_messages: readonly AgentMessage[], _signal: AbortSignal | undefined,
    _listener: Parameters<StepFunction>[2], options: Parameters<StepFunction>[3]) => {
    expect(options.onDeclaration).toBeUndefined();
    expect(options.contextOwner).toBeUndefined();
    return { text: 'done', toolCalls: [], stopReason: 'stop' as const };
  }, { preparesContext: true });
  const replacement = createTurnRequest({ step, onMessage: persist, sessionId: 'alternate', maxSteps: 3 },
    { stepCount: 0 }, new EventChannel<QueryEvent>());
  const core = new AgentCore({ streamStep: async () => ({ text: 'unused', toolCalls: [], stopReason: 'stop' }),
    prepareRequest: () => ({ streamStep: replacement }) });
  await core.prompt({ role: 'user', content: 'Original history' });
  expect(persist).not.toHaveBeenCalled();
});

it('reuses captured conversion for an outer retry of an unchanged native request', async () => {
  const converter = vi.fn((messages: readonly AgentMessage[]) => messages.map(message => ({ ...message, role: message.role === 'custom' ? 'user' as const : message.role })));
  let sends = 0;
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'model', endpoint: 'openai-compatible',
    baseUrl: 'https://fixture.invalid/v1', headers: {} }, sessionId: 'native-retry', workspaceRoot: process.cwd(), tools: [],
    systemPrompt: '', fetchImpl: async () => {
      if (++sends === 1) return new Response('transient failure', { status: 503 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] }),
        { headers: { 'content-type': 'application/json' } });
    } });
  const request = createTurnRequest({ step, sessionId: 'native-retry', maxSteps: 3, convertToLlm: converter,
    onMessage: () => {} }, { stepCount: 0 }, new EventChannel<QueryEvent>());
  const core = new AgentCore({ streamStep: request, convertToLlm: converter,
    retry: { enabled: true, maxRetries: 1, baseDelayMs: 0 } });
  await core.prompt({ role: 'user', content: 'Original history' });
  expect(sends).toBe(2);
  expect(converter).toHaveBeenCalledTimes(1);
  expect(core.state.messages.at(-1)?.content).toBe('done');
});

it('prepares a goal closing request from committed history when a declaration remains pending', async () => {
  const converter = vi.fn((messages: readonly AgentMessage[]) => messages.map(message => ({ ...message, role: message.role === 'custom' ? 'user' as const : message.role })));
  const committed: StandardAgentMessage[] = [{ role: 'user', content: 'Original history' }];
  const persist = vi.fn();
  let calls = 0;
  const step: StepFunction = Object.assign(async (messages: readonly AgentMessage[], signal: AbortSignal | undefined,
    _listener: Parameters<StepFunction>[2], options: Parameters<StepFunction>[3]) => {
    if (++calls === 1) {
      const prospective = [...options.sourceMessages!, marker];
      const projection = await convertMessages(prospective, options.convertToLlm, signal);
      options.onPreparedContext!({ sourceMessages: options.sourceMessages!, prospectiveMessages: prospective,
        pendingDeclaration: marker, messageProjection: projection } as PreparedTurnContext);
      return { text: '', toolCalls: [], stopReason: 'error' as const, admissionFailure: 'exhausted' as const, retriesExhausted: true };
    }
    expect(messages.some(message => message.requestDeclaration)).toBe(false);
    expect(options.sourceMessages).toEqual([...committed, expect.objectContaining({ content: expect.stringContaining('Summarize progress') })]);
    expect(options.providerMessages).toBeUndefined();
    expect(options.onDeclaration).toBeUndefined();
    expect(options.contextOwner).toBeUndefined();
    expect(options.convertToLlm).toBe(converter);
    await convertMessages(options.sourceMessages!, options.convertToLlm, signal);
    return { text: 'progress', toolCalls: [], stopReason: 'stop' as const };
  }, { preparesContext: true });
  const core = new AgentCore({ streamStep: createTurnRequest({ step, sessionId: 'pending-closing', maxSteps: 3,
    onMessage: persist, convertToLlm: converter, claimBudgetSummary: () => true }, { stepCount: 0 }, new EventChannel<QueryEvent>()),
    convertToLlm: converter });
  await core.prompt(committed);
  expect(calls).toBe(2);
  expect(converter).toHaveBeenCalledTimes(2);
  expect(persist).not.toHaveBeenCalled();
  expect(core.state.messages.some(message => message.requestDeclaration)).toBe(false);
});

it('routes outer retries with the actual failed physical target and latest successful response', async () => {
  const seen: ModelRouteRequest[] = []; let sends = 0;
  const virtualModels = new VirtualModelRegistry();
  virtualModels.register({ provider: 'fixture', id: 'automatic', name: 'Automatic', route: request => {
    seen.push(request); return { provider: 'fixture', modelId: request.reason === 'retry' ? 'recovery' : 'physical' };
  } });
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'automatic', headers: {}, baseUrl: 'https://route.invalid/v1' },
    virtualModels, catalog: [{ id: 'fixture', models: [{ id: 'physical' }, { id: 'recovery' }] }], tools: [], systemPrompt: '',
    sessionId: 'route-retry', workspaceRoot: process.cwd(), fetchImpl: async () => ++sends === 1
      ? new Response('private body must not reach routing context', { status: 503 })
      : new Response(JSON.stringify({ choices: [{ message: { content: 'Recovered' }, finish_reason: 'stop' }] }),
        { headers: { 'content-type': 'application/json' } }) });
  const core = new AgentCore({ streamStep: createTurnRequest({ step, sessionId: 'route-retry', maxSteps: 3 },
    { stepCount: 0 }, new EventChannel<QueryEvent>()), retry: { enabled: true, maxRetries: 1, baseDelayMs: 0 },
    initialState: { messages: [{ role: 'assistant', content: 'Previous success', stopReason: 'stop', origin: { provider: 'fixture', model: 'physical' } }] } });
  await core.prompt([{ role: 'user', content: 'Retry if needed' }, { role: 'system', content: 'Trailing instruction' }]);
  expect(core.state.messages.at(-1)?.content).toBe('Recovered'); expect(sends).toBe(2);
  expect(seen.map(request => request.reason)).toEqual(['user', 'retry']);
  expect(seen[0]).toMatchObject({ previous: { provider: 'fixture', modelId: 'physical' } });
  expect(seen[1]).toMatchObject({ failed: { provider: 'fixture', modelId: 'physical', stopReason: 'error' } });
  expect(JSON.stringify(seen[1])).not.toContain('private body must not reach routing context');
});

it.each([false, true])('routes an implicit-effort retry with its latest dispatched failure over outer context %s', async olderFailure => {
  const seen: ModelRouteRequest[] = [], sent: Record<string, unknown>[] = [];
  const virtualModels = new VirtualModelRegistry();
  virtualModels.register({ provider: 'fixture', id: 'automatic', name: 'Automatic', route: request => {
    seen.push(request);
    return { provider: 'fixture', modelId: request.reason === 'retry' && request.failed?.modelId === 'physical' ? 'recovery' : 'physical' };
  } });
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'automatic', headers: {}, baseUrl: 'https://route.invalid/v1' },
    virtualModels, catalog: [{ id: 'fixture', models: [{ id: 'physical' }, { id: 'recovery' }, { id: 'older' }] }], tools: [], systemPrompt: '',
    thinkingEffort: 'low', thinkingEffortExplicit: false, sessionId: 'route-effort-retry', workspaceRoot: process.cwd(),
    fetchImpl: async (_input, init) => {
      sent.push(JSON.parse(String(init?.body)));
      return sent.length === 1 ? new Response('reasoning_effort PRIVATE_RESPONSE_BODY', { status: 400 })
        : new Response(JSON.stringify({ choices: [{ message: { content: 'Recovered' }, finish_reason: 'stop' }] }),
          { headers: { 'content-type': 'application/json' } });
    } });
  const result = await step([{ role: 'user', content: 'Recover from unsupported implicit effort.' }], undefined, {}, {
    allowTools: false,
    ...(olderFailure ? { routeReason: 'retry', failedRoute: { provider: 'fixture', modelId: 'older', stopReason: 'error' } } : {}),
  });
  expect(seen).toHaveLength(2);
  expect(seen[1]).toMatchObject({ reason: 'retry', failed: { provider: 'fixture', modelId: 'physical', thinkingLevel: 'low', stopReason: 'error' } });
  expect(JSON.stringify(seen)).not.toContain('PRIVATE_RESPONSE_BODY');
  expect(sent.map(body => body.model)).toEqual(['physical', 'recovery']);
  expect(sent[1]?.reasoning_effort).toBeUndefined();
  expect(result).toMatchObject({ stopReason: 'stop', origin: { provider: 'fixture', model: 'recovery' } });
});

it('does not reuse the previous dispatch marker when routing the effort retry itself fails', async () => {
  let sends = 0;
  const virtualModels = new VirtualModelRegistry();
  virtualModels.register({ provider: 'fixture', id: 'automatic', name: 'Automatic', route: request => {
    if (request.reason === 'retry') throw new Error('The route is unavailable.');
    return { provider: 'fixture', modelId: 'physical' };
  } });
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'automatic', headers: {}, baseUrl: 'https://route.invalid/v1' },
    virtualModels, catalog: [{ id: 'fixture', models: [{ id: 'physical' }] }], tools: [], systemPrompt: '',
    thinkingEffort: 'low', thinkingEffortExplicit: false, sessionId: 'route-effort-refusal', workspaceRoot: process.cwd(),
    fetchImpl: async () => { sends++; return new Response('reasoning_effort unsupported', { status: 400 }); } });
  const result = await step([{ role: 'user', content: 'The retry route will fail.' }], undefined, {}, { allowTools: false });
  expect(sends).toBe(1); expect(result.stopReason).toBe('error'); expect(result.routeAttempt).toBeUndefined();
});
