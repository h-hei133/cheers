import { afterEach, expect, it, vi } from 'vitest';
import { runTurn, type TurnOptions } from './session.js';
import { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import { registerCatalogContribution } from '../core/catalog/contributions.js';
import type { AgentLifecycleEvent } from '../core/agent/events.js';
import type { QueryEvent } from '../core/query/runtime/events.js';
import type { SessionMessage } from '../session/schema/sessionMessage.js';
import { createTurnEvents } from './events.js';
import { runEventHandlers } from '../extensions/events/dispatch.js';

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.restoreAllMocks(); });
function fixture(overrides: Partial<TurnOptions> = {}) {
  const messages: SessionMessage[] = [];
  const events: Array<{ name: string; payload: unknown }> = [];
  const sessionId = 'native-events-fixture'; const workspaceRoot = process.cwd();
  const handlers = new Map(['agent_start', 'agent_end', 'agent_settled', 'turn_start', 'turn_end', 'message_start',
    'message_update', 'message_end', 'tool_execution_start', 'tool_execution_update', 'tool_execution_end',
    'retry_scheduled', 'retry_attempt_start'].map(name => [name, [async (payload: unknown) => { events.push({ name, payload }); }]]));
  cleanups.push(registerCatalogContribution({ root: workspaceRoot, sessionId, tools: [], commands: [], skills: () => [],
    onEvent: async (event, payload, aliases, signal) => runEventHandlers({ handlers, event, payload, aliases, signal }) }));
  const options: TurnOptions = { sessionId, workspaceRoot, prompt: 'Inspect', history: [], onMessage: message => messages.push(message),
    maxSteps: 5, signal: new AbortController().signal, hooks: new HookDispatcher(), tools: new Map(), permissionScope: 'allow-all',
    step: async (_messages, _signal, listener) => { listener.onText?.('Done'); return { text: 'Done', toolCalls: [], stopReason: 'stop' }; }, ...overrides };
  return { options, messages, events };
}
async function drain(run: ReturnType<typeof runTurn>) { const out: QueryEvent[] = []; for await (const event of run.events) out.push(event); return out; }

it('dispatches the actual kernel lifecycle and one settled notification for a successful turn', async () => {
  const setup = fixture();
  const kernel: AgentLifecycleEvent[] = [];
  const query = await drain(runTurn({ ...setup.options, observe: event => { kernel.push(event); } }));
  const native = setup.events.filter(row => !['agent_settled'].includes(row.name));
  expect(native.map(row => row.name)).toEqual(kernel.map(event => event.type));
  expect(native.map(row => row.payload)).toEqual(kernel);
  expect(setup.events.filter(row => row.name === 'agent_end')).toHaveLength(1);
  expect(setup.events.at(-1)).toMatchObject({ name: 'agent_settled', payload: { type: 'agent_settled', aborted: false } });
  expect(query.some(event => event.type === 'query.completed')).toBe(true);
});

it('does not duplicate a failed kernel end through the old StopFailure hook alias', async () => {
  const setup = fixture({ step: async () => ({ text: '', toolCalls: [], stopReason: 'error', retriesExhausted: true,
    failureClass: 'provider_auth', errorMessage: 'Synthetic authentication refusal' }) });
  const query = await drain(runTurn(setup.options));
  const ended = setup.events.filter(row => row.name === 'agent_end');
  expect(ended).toHaveLength(1);
  expect(ended[0]!.payload).toMatchObject({ type: 'agent_end', messages: expect.any(Array) });
  expect(setup.events.filter(row => row.name === 'agent_settled')).toHaveLength(1);
  expect(query.some(event => event.type === 'query.failed')).toBe(true);
});

it('joins the failed run settlement after its terminal query record is observed', async () => {
  let release!: () => void; let reached!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; }); const ready = new Promise<void>(resolve => { reached = resolve; });
  const setup = fixture({ step: async () => ({ text: '', toolCalls: [], stopReason: 'error', retriesExhausted: true, errorMessage: 'Failed step' }) });
  cleanups.push(registerCatalogContribution({ root: setup.options.workspaceRoot, sessionId: setup.options.sessionId, commands: [], tools: [], skills: () => [],
    onEvent: async name => { if (name === 'agent_settled') { reached(); await hold; } } }));
  const run = runTurn(setup.options); const iterator = run.events[Symbol.asyncIterator]();
  let next = await iterator.next(); while (!next.done && next.value.type !== 'query.failed') next = await iterator.next();
  expect(next.done).toBe(false); await ready;
  let returned = false;
  const cleanup = iterator.return!().then(() => { returned = true; });
  await new Promise(resolve => setImmediate(resolve)); expect(returned).toBe(false);
  release(); await cleanup;
});

it('delivers terminal notifications after cancellation and settles the original run only once', async () => {
  const controller = new AbortController(); let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const setup = fixture({ signal: controller.signal, step: async (_messages, signal) => {
    started(); await new Promise<void>(resolve => signal!.addEventListener('abort', () => resolve(), { once: true }));
    return { text: '', toolCalls: [], stopReason: 'aborted' };
  } });
  const pending = drain(runTurn(setup.options)); await ready; controller.abort(); await pending;
  expect(setup.events.filter(row => row.name === 'agent_end')).toHaveLength(1);
  expect(setup.events.filter(row => row.name === 'agent_settled')).toEqual([{ name: 'agent_settled',
    payload: expect.objectContaining({ type: 'agent_settled', aborted: true }) }]);
});

it('keeps native notifications scoped and prevents handler mutation from changing persisted messages', async () => {
  const setup = fixture(); const sibling = vi.fn(); const attempted: unknown[] = [];
  cleanups.push(registerCatalogContribution({ root: setup.options.workspaceRoot, sessionId: 'sibling', tools: [], commands: [], skills: () => [], onEvent: sibling }));
  cleanups.push(registerCatalogContribution({ root: setup.options.workspaceRoot, sessionId: setup.options.sessionId, tools: [], commands: [], skills: () => [],
    onEvent: async (name, payload) => { if (name === 'message_end') {
      attempted.push(payload); try { (payload as { message: { content: string } }).message.content = 'Changed by notification'; } catch { /* immutable notification */ }
    } } }));
  await drain(runTurn(setup.options));
  expect(sibling).not.toHaveBeenCalled(); expect(attempted.length).toBeGreaterThan(0);
  expect(setup.messages.at(-1)?.content).toBe('Done');
  expect(Object.isFrozen((attempted.at(-1) as { message: object }).message)).toBe(true);
});

it('awaits settlement handlers before closing the event stream and isolates observer errors', async () => {
  const setup = fixture(); let release!: () => void; let reached!: () => void;
  const ready = new Promise<void>(resolve => { reached = resolve; }); const hold = new Promise<void>(resolve => { release = resolve; });
  const next = vi.fn();
  cleanups.push(registerCatalogContribution({ root: setup.options.workspaceRoot, sessionId: setup.options.sessionId, tools: [], commands: [], skills: () => [],
    onEvent: async name => { if (name === 'agent_settled') { reached(); await hold; throw new Error('Notification failed'); } } }));
  cleanups.push(registerCatalogContribution({ root: setup.options.workspaceRoot, sessionId: setup.options.sessionId, tools: [], commands: [], skills: () => [],
    onEvent: async name => { if (name === 'agent_settled') next(); } }));
  let closed = false;
  const pending = drain(runTurn(setup.options)).then(events => { closed = true; return events; });
  await ready; expect(closed).toBe(false); release();
  const query = await pending; expect(next).toHaveBeenCalledOnce();
  expect(query.some(event => event.type === 'query.completed')).toBe(true);
});

it('keeps tool updates, queued continuations and Stop repair inside one final settlement', async () => {
  let steps = 0; let stopCalls = 0;
  const hooks = { dispatch: async (payload: { eventName: string }) => payload.eventName === 'Stop' && ++stopCalls === 1
    ? { decision: 'block', reason: 'One repair requested' } : payload.eventName === 'Stop' ? { decision: 'allow' }
      : { decision: 'allow', stopChecks: [] } } as unknown as HookDispatcher;
  const setup = fixture({ hooks, step: async (_messages, _signal, listener) => {
    steps++; listener.onText?.(steps === 1 ? 'Reading' : 'Done');
    return steps === 1 ? { text: 'Reading', toolCalls: [{ id: 'read-call', name: 'read-event', args: {} }], stopReason: 'stop' }
      : { text: 'Done', toolCalls: [], stopReason: 'stop' };
  }, tools: new Map([['read-event', { name: 'read-event', description: 'Read stream', argsSchema: { type: 'object' },
    execute: async (_args, context) => { context.onOutput?.('Tool update'); return { success: true, output: 'Read complete' }; } }]]) });
  const query = await drain(runTurn(setup.options));
  expect(setup.events.some(row => row.name === 'tool_execution_start')).toBe(true);
  expect(setup.events.some(row => row.name === 'tool_execution_update')).toBe(true);
  expect(setup.events.some(row => row.name === 'tool_execution_end')).toBe(true);
  expect(setup.events.filter(row => row.name === 'agent_start')).toHaveLength(2);
  expect(setup.events.filter(row => row.name === 'agent_end')).toHaveLength(2);
  expect(setup.events.filter(row => row.name === 'agent_settled')).toHaveLength(1);
  expect(query.some(row => row.type === 'query.completed')).toBe(true);
});

it('joins a pending tool update before publishing its final settlement', async () => {
  const setup = fixture({ step: (() => { let called = false; return async () => {
    if (!called) { called = true; return { text: 'Reading', toolCalls: [{ id: 'stream', name: 'stream', args: {} }], stopReason: 'stop' as const }; }
    return { text: 'Done', toolCalls: [], stopReason: 'stop' as const };
  }; })(), tools: new Map([['stream', { name: 'stream', description: 'Stream', argsSchema: { type: 'object' },
    execute: async (_args, context) => { context.onOutput?.('Partial'); return { success: true, output: 'Final' }; } }]]) });
  let release!: () => void; let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; }); const hold = new Promise<void>(resolve => { release = resolve; });
  const observed: string[] = [];
  cleanups.push(registerCatalogContribution({ root: setup.options.workspaceRoot, sessionId: setup.options.sessionId, commands: [], tools: [], skills: () => [],
    onEvent: async name => { if (name === 'tool_execution_update') { started(); await hold; } observed.push(name); } }));
  let finished = false;
  const pending = drain(runTurn(setup.options)).then(value => { finished = true; return value; });
  await ready;
  await new Promise(resolve => setImmediate(resolve));
  expect(setup.events.some(row => row.name === 'agent_end')).toBe(false);
  expect(finished).toBe(false);
  expect(observed).not.toContain('agent_settled');
  release(); await pending;
  expect(observed.indexOf('tool_execution_update')).toBeLessThan(observed.indexOf('agent_settled'));
});

it('does not deliver queued old notifications to a newly registered generation', async () => {
  let release!: () => void; let reached!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; }); const ready = new Promise<void>(resolve => { reached = resolve; });
  const sessionId = 'queued-old-generation'; const root = process.cwd();
  const retire = registerCatalogContribution({ root, sessionId, commands: [], tools: [], skills: () => [],
    onEvent: async name => { if (name === 'tool_execution_update') { reached(); await hold; } } });
  cleanups.push(retire);
  const events = createTurnEvents({ workspaceRoot: root, sessionId });
  const first = events.observe({ type: 'tool_execution_update', toolCallId: 'old', toolName: 'read', args: {}, partialResult: 'partial' }, new AbortController().signal);
  const terminal = events.observe({ type: 'agent_end', messages: [] }, new AbortController().signal);
  await ready; retire(); const replacement = vi.fn();
  cleanups.push(registerCatalogContribution({ root, sessionId, commands: [], tools: [], skills: () => [], onEvent: replacement }));
  release(); await Promise.all([first, terminal]);
  expect(replacement).not.toHaveBeenCalled();
});

it('keeps unsupported observer payloads from changing the product outcome', async () => {
  const root = process.cwd(); const sessionId = 'non-inert-event'; const handler = vi.fn();
  cleanups.push(registerCatalogContribution({ root, sessionId, commands: [], tools: [], skills: () => [], onEvent: handler }));
  const events = createTurnEvents({ workspaceRoot: root, sessionId });
  const unsafe = { type: 'tool_execution_update' as const, toolCallId: 'call', toolName: 'read', args: {}, partialResult: { secret: () => 'not-json' } };
  await expect(events.observe(unsafe, new AbortController().signal)).resolves.toBeUndefined();
  expect(handler).not.toHaveBeenCalled();
});
