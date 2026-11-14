import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentCore } from '../core/agent/agent.js';
import type { AgentMessage } from '../core/agent/state.js';
import type { ProviderMessage } from '../model-adapters/message.js';
import type { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import { SessionManager } from '../session/SessionManager.js';
import type { SessionMessage } from '../session/schema/sessionMessage.js';
import { createStepFunction } from './step.js';
import { runTurn, type TurnOptions } from './session.js';

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-history-')); roots.push(root);
  const home = path.join(root, 'home'); const workspace = path.join(root, 'work');
  fs.mkdirSync(home); fs.mkdirSync(workspace);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', home);
  const manager = new SessionManager(); const session = manager.createNew(workspace);
  return { manager, session, workspace };
}

const custom = { role: 'custom', customType: 'artifact', content: 'Artifact status', display: false,
  data: { path: 'result.json', verified: false } };
const hooks = { dispatch: async () => ({ decision: 'allow', stopChecks: [] }) } as unknown as HookDispatcher;
const response = () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'recorded' }], stop_reason: 'end_turn' }),
  { headers: { 'content-type': 'application/json' } });

function setup(history: readonly SessionMessage[], step: TurnOptions['step'], extra: Record<string, unknown> = {}): TurnOptions {
  return { sessionId: 'history', prompt: 'continue', workspaceRoot: process.cwd(), history, step,
    tools: new Map(), hooks, maxSteps: 3, signal: new AbortController().signal, onMessage: () => {}, ...extra } as TurnOptions;
}
async function drain(run: ReturnType<typeof runTurn>) { const events = []; for await (const event of run.events) events.push(event); return events; }

it('keeps custom app messages in the active agent history while converting only the provider input', async () => {
  const history = [custom as unknown as AgentMessage];
  const convertToLlm = vi.fn(async (messages: readonly AgentMessage[]) => messages.map(message => message.role === 'custom'
    ? { role: 'user', content: 'Artifact result.json is unverified.' } : message));
  let sent: readonly AgentMessage[] = [];
  const core = new AgentCore({ initialState: { messages: history }, convertToLlm,
    streamStep: async messages => { sent = messages; return { text: 'done', toolCalls: [], stopReason: 'stop' }; },
  } as unknown as ConstructorParameters<typeof AgentCore>[0]);
  await core.prompt({ role: 'user', content: 'continue' });
  expect(convertToLlm).toHaveBeenCalledOnce();
  expect(sent).toEqual([{ role: 'user', content: 'Artifact result.json is unverified.' }, { role: 'user', content: 'continue' }]);
  expect(core.state.messages[0]).toEqual(custom);
});

it.each(['reject', 'invalid-role'] as const)('blocks converter %s before any provider dispatch', async kind => {
  let sends = 0;
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'm', baseUrl: 'https://fixture.invalid', headers: {} },
    workspaceRoot: process.cwd(), sessionId: 'conversion-failure', systemPrompt: '', tools: [],
    fetchImpl: async () => { sends++; return response(); } });
  const convertToLlm = async () => {
    if (kind === 'reject') throw new Error('conversion refused');
    return [{ role: 'artifact', content: 'must not be sent' }];
  };
  const events = await drain(runTurn(setup([custom as unknown as SessionMessage], step, { convertToLlm })));
  expect(sends).toBe(0);
  expect(events.some(event => event.type === 'query.failed')).toBe(true);
});

it('uses the custom converter in the shipped turn provider path without rewriting durable source messages', async () => {
  const { manager, session, workspace } = fixture();
  manager.addTurn(session.id, custom as unknown as SessionMessage);
  const reopened = new SessionManager(); const loaded = reopened.getSession(session.id)!;
  expect(loaded.turns[0]).toMatchObject(custom);
  const convertToLlm = vi.fn(async (messages: readonly SessionMessage[]) => messages.flatMap(message => message.role === 'custom'
    ? [{ role: 'user', content: `Retrieved artifact ${(message as unknown as typeof custom).data.path}; verification remains missing.` }] : [message]));
  let body: any;
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'm', endpoint: 'anthropic-messages', baseUrl: 'https://fixture.invalid', headers: {} },
    workspaceRoot: workspace, sessionId: session.id, systemPrompt: '', tools: [],
    fetchImpl: async (_url, init) => { body = JSON.parse(String(init?.body)); return response(); } });
  await drain(runTurn(setup(loaded.turns, step, { sessionId: session.id, workspaceRoot: workspace, convertToLlm,
    onMessage: (message: SessionMessage) => reopened.addTurn(session.id, message) })));
  expect(convertToLlm).toHaveBeenCalled();
  expect(body.messages[0].content).toEqual([{ type: 'text', text: 'Retrieved artifact result.json; verification remains missing.' }]);
  expect(new SessionManager().getSession(session.id)!.turns[0]).toMatchObject(custom);
  const fork = reopened.fork(session.id, workspace, { activate: false });
  expect(new SessionManager().getSession(fork.id)!.turns[0]).toMatchObject(custom);
});

it('releases a cancelled conversion without sending and observes its late rejection', async () => {
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let reject!: (error: Error) => void;
  const pending = new Promise<readonly ProviderMessage[]>((_resolve, fail) => { reject = fail; });
  let sends = 0;
  const core = new AgentCore({ convertToLlm: async () => { entered(); return pending; },
    streamStep: async () => { sends++; return { text: 'done', toolCalls: [], stopReason: 'stop' }; },
  });
  const run = core.prompt({ role: 'user', content: 'Continue.' });
  await started;
  core.abort();
  await run;
  reject(new Error('late provider-like private failure'));
  await new Promise(resolve => setImmediate(resolve));
  expect(sends).toBe(0);
  expect(core.state.messages.at(-1)).toMatchObject({ role: 'assistant', stopReason: 'aborted' });
});

it('does not enter a converter or provider when the caller is already cancelled', async () => {
  const controller = new AbortController(); controller.abort();
  const converter = vi.fn(() => [{ role: 'user' as const, content: 'late' }]);
  const step = vi.fn(async () => ({ text: 'late', toolCalls: [], stopReason: 'stop' as const }));
  const events = await drain(runTurn(setup([custom], step, { signal: controller.signal, convertToLlm: converter })));
  expect(converter).not.toHaveBeenCalled();
  expect(step).not.toHaveBeenCalled();
  expect(events.some(event => event.type === 'lifecycle.record' && event.kind === 'stop_state'
    && event.state === 'stopped' && event.reasonCode === 'cancelled' && event.terminal)).toBe(true);
});

it.each(['openai-compatible', 'anthropic-messages'] as const)('preserves converter system text in the actual %s request', async endpoint => {
  let body: any;
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'm', endpoint, baseUrl: 'https://fixture.invalid', headers: {} },
    workspaceRoot: process.cwd(), sessionId: `conversion-system-${endpoint}`, systemPrompt: 'Runtime instruction.', tools: [],
    fetchImpl: async (_url, init) => { body = JSON.parse(String(init?.body)); return response(); } });
  await drain(runTurn(setup([custom], step, { convertToLlm: () => [
    { role: 'system', content: [{ type: 'text', text: 'Use artifact X.' }] }, { role: 'user', content: 'Continue.' },
  ] })));
  const system = endpoint === 'anthropic-messages' ? body.system : body.messages.filter((message: any) => message.role === 'system');
  expect(JSON.stringify(system)).toContain('Runtime instruction.');
  expect(JSON.stringify(system)).toContain('Use artifact X.');
});

it.each(['index-getter', 'proxy'] as const)('rejects a prepared %s history array before invoking application hooks', async kind => {
  const hook = vi.fn(() => ({ role: 'user', content: 'Unsafe.' }));
  const input = kind === 'index-getter' ? Object.defineProperty([{ role: 'user', content: 'Unsafe.' }], '0', { get: hook })
    : new Proxy([{ role: 'user', content: 'Unsafe.' }], { get: hook });
  const converter = vi.fn(() => [{ role: 'user' as const, content: 'Unsafe.' }]);
  const step = vi.fn(async () => ({ text: 'done', toolCalls: [], stopReason: 'stop' as const }));
  const core = new AgentCore({ convertToLlm: converter, prepareRequest: async () => ({ messages: input as readonly AgentMessage[] }), streamStep: step });
  await core.prompt({ role: 'user', content: 'Continue.' });
  expect(hook.mock.calls.length).toBe(0);
  expect(converter).not.toHaveBeenCalled();
  expect(step).not.toHaveBeenCalled();
  expect(core.state.messages.at(-1)?.errorMessage).toBe('Message conversion requires bounded inert history.');
});

it.each(['then-getter', 'proxy'] as const)('rejects synchronous converter %s output before Promise assimilation', async kind => {
  const hook = vi.fn(() => undefined);
  const output = kind === 'then-getter' ? Object.defineProperty([{ role: 'user', content: 'Unsafe.' }], 'then', { get: hook })
    : new Proxy([{ role: 'user', content: 'Unsafe.' }], { get: hook });
  const step = vi.fn(async () => ({ text: 'done', toolCalls: [], stopReason: 'stop' as const }));
  const core = new AgentCore({ convertToLlm: () => output as readonly ProviderMessage[], streamStep: step });
  await core.prompt({ role: 'user', content: 'Continue.' });
  expect(hook.mock.calls.length).toBe(0);
  expect(step).not.toHaveBeenCalled();
  expect(core.state.messages.at(-1)?.errorMessage).toBe('Message conversion returned invalid provider messages.');
});

it.each(['initial', 'prompt'] as const)('rejects an %s history array accessor before reading an element', async ingress => {
  const hook = vi.fn(() => custom);
  const input = Object.defineProperty([custom], '0', { get: hook }) as readonly AgentMessage[];
  const step = vi.fn(async () => ({ text: 'done', toolCalls: [], stopReason: 'stop' as const }));
  if (ingress === 'initial') expect(() => new AgentCore({ initialState: { messages: input }, streamStep: step })).toThrow();
  else await expect(new AgentCore({ streamStep: step }).prompt(input)).rejects.toThrow();
  expect(hook).not.toHaveBeenCalled();
  expect(step).not.toHaveBeenCalled();
});

it.each(['constructor-getter', 'species'] as const)('rejects a converter Promise with %s hooks without executing them', async kind => {
  const hook = vi.fn(() => Promise);
  const content: ProviderMessage[] = [{ role: 'user', content: 'Unsafe Promise.' }];
  class UnsafePromise extends Promise<readonly ProviderMessage[]> {
    static get [Symbol.species]() { hook(); return Promise; }
  }
  const output = kind === 'constructor-getter' ? Object.defineProperty(Promise.resolve(content), 'constructor', { get: hook })
    : new UnsafePromise(resolve => resolve(content));
  const step = vi.fn(async () => ({ text: 'done', toolCalls: [], stopReason: 'stop' as const }));
  const core = new AgentCore({ convertToLlm: () => output, streamStep: step });
  await core.prompt({ role: 'user', content: 'Continue.' });
  expect(hook.mock.calls.length).toBe(0);
  expect(step).not.toHaveBeenCalled();
  expect(core.state.messages.at(-1)?.errorMessage).toBe('Message conversion returned invalid provider messages.');
});

it('accepts native converter Promises carrying async context metadata', async () => {
  const local = new AsyncLocalStorage<string>();
  const step = vi.fn(async () => ({ text: 'done', toolCalls: [], stopReason: 'stop' as const }));
  const core = new AgentCore({ convertToLlm: () => {
    const result = Promise.resolve([{ role: 'user' as const, content: 'Scoped.' }]);
    Object.defineProperty(result, Symbol('async-context'), { value: local.getStore() });
    return result;
  }, streamStep: step });
  await local.run('request', () => core.prompt({ role: 'user', content: 'Continue.' }));
  expect(step).toHaveBeenCalledOnce();
  expect(step.mock.calls[0]![0][0]?.content).toBe('Scoped.');
});

it('reuses one captured conversion across retries while preparing each attempt', async () => {
  const converter = vi.fn(() => [{ role: 'user' as const, content: `Captured ${converter.mock.calls.length}.` }]);
  const prepareRequest = vi.fn(async () => undefined);
  const ids: string[] = [];
  const sent: readonly AgentMessage[][] = [];
  const core = new AgentCore({ convertToLlm: converter, prepareRequest,
    retry: { enabled: true, maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 },
    streamStep: async (messages, _signal, options) => {
      ids.push(options.requestId!); (sent as AgentMessage[][]).push([...messages]);
      return ids.length === 1 ? { text: '', toolCalls: [], stopReason: 'error', retryable: true }
        : { text: 'done', toolCalls: [], stopReason: 'stop' };
    },
  });
  await core.prompt({ role: 'user', content: 'Continue.' });
  expect(prepareRequest).toHaveBeenCalledTimes(2);
  expect(converter).toHaveBeenCalledOnce();
  expect(ids[0]).toBe(ids[1]);
  expect(sent[0]).toEqual(sent[1]);
});

it('gives a prepared replacement new conversion and request identity', async () => {
  const replacement: AgentMessage[] = [{ role: 'user', content: 'First.' }];
  const converter = vi.fn((messages: readonly AgentMessage[]) => messages as readonly ProviderMessage[]);
  const ids: string[] = [];
  const core = new AgentCore({ convertToLlm: converter,
    prepareRequest: async ({ attempt }) => { if (attempt) replacement[0]!.content = 'Replacement.'; return { messages: replacement }; },
    retry: { enabled: true, maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 },
    streamStep: async (_messages, _signal, options) => {
      ids.push(options.requestId!);
      return ids.length === 1 ? { text: '', toolCalls: [], stopReason: 'error', retryable: true }
        : { text: 'done', toolCalls: [], stopReason: 'stop' };
    },
  });
  await core.prompt({ role: 'user', content: 'Continue.' });
  expect(converter).toHaveBeenCalledTimes(2);
  expect(ids[0]).not.toBe(ids[1]);
  expect(converter.mock.calls[0]![0][0]!.content).toBe('First.');
  expect(converter.mock.calls[1]![0][0]!.content).toBe('Replacement.');
});

it.each(['getter', 'toJSON', 'proxy'] as const)('rejects converter %s output without invoking application hooks', async kind => {
  const hook = vi.fn(() => 'user');
  const value = kind === 'getter' ? Object.defineProperty({ content: 'unsafe' }, 'role', { enumerable: true, get: hook })
    : kind === 'toJSON' ? { role: 'user', content: 'unsafe', toJSON: hook }
    : new Proxy({ role: 'user', content: 'unsafe' }, { get: hook });
  let sends = 0;
  const core = new AgentCore({ convertToLlm: async () => [value] as unknown as readonly ProviderMessage[],
    streamStep: async () => { sends++; return { text: 'done', toolCalls: [], stopReason: 'stop' }; },
  });
  await core.prompt({ role: 'user', content: 'Continue.' });
  expect(sends).toBe(0);
  expect(hook).not.toHaveBeenCalled();
  expect(core.state.messages.at(-1)?.errorMessage).toBe('Message conversion returned invalid provider messages.');
});

it('freezes detached source and result snapshots without letting application mutation rewrite history', async () => {
  const history: AgentMessage[] = [{ ...custom, role: 'custom' }];
  const output: ProviderMessage[] = [{ role: 'user', content: 'captured artifact' }];
  let captured: readonly AgentMessage[] = [];
  let sent: readonly AgentMessage[] = [];
  const core = new AgentCore({ initialState: { messages: history }, convertToLlm: messages => { captured = messages; return output; },
    streamStep: async messages => {
      sent = messages;
      (output[0] as { content: string }).content = 'changed after capture';
      return { text: 'done', toolCalls: [], stopReason: 'stop' };
    },
  });
  await core.prompt({ role: 'user', content: 'Continue.' });
  expect(Object.isFrozen(captured)).toBe(true);
  expect(Object.isFrozen(captured[0])).toBe(true);
  expect(sent[0]?.content).toBe('captured artifact');
  expect(core.state.messages[0]).toMatchObject(custom);
});

it('prices converted content before the actual provider dispatch', async () => {
  let sends = 0;
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'm', baseUrl: 'https://fixture.invalid', headers: {} },
    workspaceRoot: process.cwd(), sessionId: 'conversion-budget', systemPrompt: '', tools: [], contextWindow: 4096, maxOutputTokens: 128, reserveTokens: 128,
    fetchImpl: async () => { sends++; return response(); } });
  const events = await drain(runTurn(setup([custom], step, { retry: { enabled: false },
    convertToLlm: () => [{ role: 'user', content: 'x'.repeat(100_000) }] })));
  expect(sends).toBe(0);
  expect(events.some(event => event.type === 'query.failed')).toBe(true);
});

it('prices converted system text and rejects unsupported system images before dispatch', async () => {
  for (const content of ['x'.repeat(100_000), [{ type: 'image', data: 'YWJj', mimeType: 'image/png' }]] as const) {
    const fetchImpl = vi.fn(async () => response());
    const step = createStepFunction({ provider: { provider: 'fixture', model: 'm', baseUrl: 'https://fixture.invalid', headers: {} },
      workspaceRoot: process.cwd(), sessionId: 'conversion-system-budget', systemPrompt: '', tools: [], contextWindow: 4096,
      maxOutputTokens: 128, reserveTokens: 128, fetchImpl });
    const events = await drain(runTurn(setup([custom], step, { retry: { enabled: false },
      convertToLlm: () => [{ role: 'system', content }, { role: 'user', content: 'Continue.' }] })));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(events.some(event => event.type === 'query.failed')).toBe(true);
  }
});

it('prepares images introduced by conversion and leaves durable custom content unchanged', async () => {
  const pixel = { type: 'image' as const, mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Z1cAAAAASUVORK5CYII=' };
  let body: any;
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'm', baseUrl: 'https://fixture.invalid', headers: {} },
    catalog: [{ id: 'fixture', models: [{ id: 'm', vision: true }] }], workspaceRoot: process.cwd(),
    sessionId: 'conversion-image', systemPrompt: '', tools: [],
    fetchImpl: async (_url, init) => { body = JSON.parse(String(init?.body)); return response(); } });
  const source = [{ ...custom, role: 'custom' as const }];
  await drain(runTurn(setup(source, step, { convertToLlm: () => [{ role: 'user', content: [pixel] }] })));
  expect(JSON.stringify(body)).toContain(pixel.data);
  expect(source[0]).toMatchObject(custom);
});

it('checks tool history introduced by conversion before dispatch to a text-only model', async () => {
  const fetchImpl = vi.fn(async () => response());
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'm', baseUrl: 'https://fixture.invalid', headers: {} },
    catalog: [{ id: 'fixture', models: [{ id: 'm', toolCalling: false }] }], workspaceRoot: process.cwd(),
    sessionId: 'conversion-tool-history', systemPrompt: '', tools: [], fetchImpl });
  const events = await drain(runTurn(setup([custom], step, { convertToLlm: () => [
    { role: 'assistant', content: null, tool_calls: [{ id: 'call', type: 'function', function: { name: 'read', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'call', content: 'Recorded.' },
  ] })));
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(events.some(event => event.type === 'query.failed' && event.error.includes('tool history'))).toBe(true);
});

it('retains the closing instruction after the captured custom projection', async () => {
  const calls: { messages: readonly AgentMessage[]; options: import('./step.js').StepOptions }[] = [];
  const step: TurnOptions['step'] = async (messages, _signal, _listener, options) => {
    calls.push({ messages, options });
    return calls.length === 1 ? { text: '', toolCalls: [], stopReason: 'error', admissionFailure: 'exhausted' }
      : { text: 'Remaining work.', toolCalls: [], stopReason: 'stop' };
  };
  const converter = vi.fn(() => [{ role: 'user' as const, content: 'converted artifact' }]);
  await drain(runTurn(setup([custom], step, { convertToLlm: converter, claimBudgetSummary: () => true })));
  expect(converter).toHaveBeenCalledOnce();
  expect(calls).toHaveLength(2);
  expect(calls[1]!.options.providerMessages?.[0]?.content).toBe('converted artifact');
  expect(calls[1]!.options.providerMessages?.at(-1)?.content).toContain('Do not call tools');
  expect(calls[1]!.options.sourceMessages?.[0]).toMatchObject(custom);
});
