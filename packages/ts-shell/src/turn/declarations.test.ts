import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import { SessionManager } from '../session/SessionManager.js';
import type { SessionMessage } from '../session/schema/sessionMessage.js';
import { createStepFunction } from './step.js';
import { runTurn, type TurnOptions } from './session.js';
import { openingMessage } from './opening.js';
import type { ToolSchema } from './tools.js';
import type { StepRequest, PreparedTurnContext } from './step.js';
import type { AgentMessage } from '../core/agent/state.js';
import { VirtualModelRegistry } from '../core/models/virtualModels.js';
import { AgentCore } from '../core/agent/agent.js';
import { createTurnRequest } from './request.js';
import { EventChannel } from './stream.js';
import { createTurnContextPreparer } from './context/prepare.js';

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/declaration-history-')); roots.push(root);
  const home = path.join(root, 'home'); const workspace = path.join(root, 'work');
  fs.mkdirSync(home); fs.mkdirSync(workspace);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', home);
  const manager = new SessionManager(); const session = manager.createNew(workspace);
  return { manager, session, workspace };
}

const hooks = { dispatch: async () => ({ decision: 'allow', stopChecks: [] }) } as unknown as HookDispatcher;
const tool = (name: string): ToolSchema => ({ type: 'function', function: { name, description: name, parameters: { type: 'object' } } });
const response = () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'recorded' }], stop_reason: 'end_turn' }),
  { headers: { 'content-type': 'application/json' } });

function setup(history: readonly SessionMessage[], step: TurnOptions['step'], extra: Record<string, unknown> = {}): TurnOptions {
  return { sessionId: 'history', prompt: 'continue', workspaceRoot: process.cwd(), history, step,
    tools: new Map(), hooks, maxSteps: 3, signal: new AbortController().signal, onMessage: () => {}, ...extra } as TurnOptions;
}
async function drain(run: ReturnType<typeof runTurn>) { const events = []; for await (const event of run.events) events.push(event); return events; }

function nativeRequest(extra: Partial<StepRequest> = {}): StepRequest {
  return { provider: { provider: 'fixture', model: 'm', endpoint: 'anthropic-messages', baseUrl: 'https://fixture.invalid',
    headers: {}, replayBinding: 'a'.repeat(64) }, workspaceRoot: process.cwd(), sessionId: 'native-declaration',
    systemPrompt: '', tools: [tool('read')], thinkingEffort: 'low', thinkingEffortExplicit: false,
    catalog: [{ id: 'fixture', endpoint: 'anthropic-messages', models: [{ id: 'm', reasoning: true, toolCalling: true,
      compat: { supportsMidConvoToolChanges: true, supportsMidConvoEffort: true } }] }],
    fetchImpl: async () => response(), ...extra };
}

it('records dynamic tool and effort declarations before sending and replays their original positions after reopening', async () => {
  const { manager, session, workspace } = fixture();
  manager.addTurn(session.id, { role: 'user', content: 'first' });
  const opening = openingMessage({ workspaceRoot: workspace, prompt: 'continue' });
  const base = [tool('read')]; const expanded = [...base, tool('search')];
  const bodies: any[] = [];
  const declaredBeforeSend: boolean[] = [];
  const create = (active: readonly ToolSchema[], effort: 'low' | 'high') => createStepFunction({
    provider: { provider: 'fixture', model: 'm', endpoint: 'anthropic-messages', baseUrl: 'https://fixture.invalid', headers: {}, replayBinding: 'a'.repeat(64) },
    workspaceRoot: workspace, sessionId: session.id, systemPrompt: 'stable', tools: base, initialTools: base,
    toolSnapshot: () => active, thinkingEffort: effort, cacheRetention: 'none', retry: { enabled: false }, catalog: [{ id: 'fixture', endpoint: 'anthropic-messages', models: [{ id: 'm', reasoning: true,
      toolCalling: true, compat: { supportsMidConvoToolChanges: true, supportsMidConvoEffort: true } }] }],
    fetchImpl: async (_url, init) => {
      // Record this observation without throwing through the transport: a failed
      // assertion there is classified as a network failure and the turn retries it.
      declaredBeforeSend.push(new SessionManager().getSession(session.id)!.turns.some(message => message.role === 'system' && 'requestDeclaration' in message));
      bodies.push(JSON.parse(String(init?.body))); return response();
    },
  });
  const send = async (store: SessionManager, active: readonly ToolSchema[], effort: 'low' | 'high') => {
    const loaded = store.getSession(session.id)!;
    const history = [...loaded.turns];
    store.addTurn(session.id, opening);
    const events = await drain(runTurn(setup(history, create(active, effort), { sessionId: session.id, workspaceRoot: workspace, retry: { enabled: false },
      onMessage: (message: SessionMessage) => store.addTurn(session.id, message) })));
    expect(events.some(event => event.type === 'query.failed')).toBe(false);
  };
  await send(manager, base, 'low');
  manager.addTurn(session.id, { role: 'user', content: 'second' });
  await send(manager, expanded, 'high');
  const reopened = new SessionManager(); reopened.addTurn(session.id, { role: 'user', content: 'third' });
  await send(reopened, expanded, 'high');
  expect(bodies).toHaveLength(3);
  expect(declaredBeforeSend).toEqual([true, true, true]);
  expect(bodies[2].tools).toEqual(bodies[0].tools);
  const updates = bodies[1].messages.filter((message: any) => message.role === 'system');
  expect(updates).toHaveLength(2);
  expect(updates[0].output_config.effort).toBe('low');
  expect(updates[1]).toMatchObject({ output_config: { effort: 'high' }, content: [{ type: 'tool_addition', tool: { type: 'tool_definition', definition: { name: 'search' } } }] });
  expect(bodies[2].messages.slice(0, bodies[1].messages.length)).toEqual(bodies[1].messages);
  expect(bodies[2].messages.filter((message: any) => message.role === 'system')).toEqual(updates);
});

it('refuses an unpersisted request declaration before dispatch', async () => {
  let sends = 0;
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'm', endpoint: 'anthropic-messages', baseUrl: 'https://fixture.invalid', headers: {} },
    workspaceRoot: process.cwd(), sessionId: 'declaration-storage-failure', systemPrompt: '', tools: [tool('read')],
    thinkingEffort: 'low', catalog: [{ id: 'fixture', models: [{ id: 'm', reasoning: true, toolCalling: true,
      compat: { supportsMidConvoToolChanges: true, supportsMidConvoEffort: true } }] }],
    fetchImpl: async () => { sends++; return response(); } });
  const events = await drain(runTurn(setup([], step, { onMessage: (message: SessionMessage) => {
    if (message.role === 'system') throw new Error('declaration persistence refused');
  } })));
  expect(sends).toBe(0);
  expect(events.some(event => event.type === 'query.failed')).toBe(true);
});

it('routes committed history before converting a pending declaration and recaptures a changed tool snapshot', async () => {
  const order: string[] = [];
  const routed = vi.fn((context: { messages: readonly AgentMessage[] }) => {
    expect(context.messages.some(message => message.requestDeclaration)).toBe(false);
    order.push('route'); return { provider: 'fixture', modelId: 'm', thinkingLevel: 'high' as const };
  });
  const registry = new VirtualModelRegistry(); registry.register({ provider: 'fixture', id: 'm', name: 'Selection', route: routed });
  let active = [tool('read')];
  const converter = vi.fn((messages: readonly AgentMessage[]) => {
    const pending = messages.at(-1)!;
    order.push(`convert:${pending.requestDeclaration!.tools.length}`);
    expect(pending.requestDeclaration?.effort).toBe('high');
    return messages.map(message => ({ ...message, role: message.role === 'custom' ? 'user' as const : message.role }));
  });
  const captures: PreparedTurnContext[] = []; const persisted: SessionMessage[] = [];
  const sends = vi.fn(async (_url: unknown, init?: RequestInit) => {
    order.push('send');
    expect(persisted.filter(message => message.requestDeclaration)).toHaveLength(1);
    expect(persisted.find(message => message.requestDeclaration)?.requestDeclaration?.tools).toEqual(active);
    expect(JSON.parse(String(init?.body)).tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'write' })]));
    return response();
  });
  const step = createStepFunction(nativeRequest({ toolSnapshot: () => active, virtualModels: registry, fetchImpl: sends }));
  const stream = createTurnRequest({ step, sessionId: 'native-declaration', maxSteps: 3, convertToLlm: converter,
    onMessage: message => persisted.push(message), onPreparedContext: prepared => {
      captures.push(prepared);
      if (captures.length === 1) active = [tool('read'), tool('write')];
    } }, { stepCount: 1 }, new EventChannel());
  const core = new AgentCore({ streamStep: stream, convertToLlm: converter });
  await core.prompt({ role: 'user', content: 'committed' });
  expect(core.state.errorMessage).toBeUndefined();
  expect(order).toEqual(['route', 'convert:1', 'convert:2', 'send']);
  expect(routed).toHaveBeenCalledOnce(); expect(converter).toHaveBeenCalledTimes(2);
  expect(captures).toHaveLength(3);
  expect(captures[0]!.sourceMessages.some(message => message.requestDeclaration)).toBe(false);
  expect(captures[1]!.pendingDeclaration).toBeDefined();
  expect(captures[2]!.pendingDeclaration).toBeUndefined();
  expect(captures[2]!.sourceMessages.at(-1)?.requestDeclaration?.tools).toEqual(active);
});

it.each(['persist-fails', 'cancel-after-persist', 'schema-after-persist'] as const)('releases the original unsent reservation for %s', async failure => {
  const controller = new AbortController(); let active = [tool('read')];
  const dispatched = vi.fn(); const unsent = vi.fn(); const sends = vi.fn(async () => response());
  const persisted: SessionMessage[] = [];
  const step = createStepFunction(nativeRequest({ toolSnapshot: () => active, fetchImpl: sends,
    requestPolicy: { reserve: () => ({ id: 'attempt', dispatch: dispatched, confirmUnsent: unsent, settle: () => {} }) } }));
  const events = await drain(runTurn(setup([], step, { signal: controller.signal, onMessage: (message: SessionMessage) => {
    if (!message.requestDeclaration) return;
    if (failure === 'persist-fails') throw new Error('private persistence response');
    persisted.push(message);
    if (failure === 'cancel-after-persist') controller.abort();
    else active = [tool('write')];
  } })));
  expect(sends).not.toHaveBeenCalled(); expect(dispatched).not.toHaveBeenCalled(); expect(unsent).toHaveBeenCalledOnce();
  expect(persisted).toHaveLength(failure === 'persist-fails' ? 0 : 1);
  expect(JSON.stringify(events)).not.toContain('private persistence response');
  expect(JSON.stringify(events)).not.toContain('provider_network');
});

it('publishes each effective declaration once across HTTP retry and automatic effort fallback', async () => {
  const { manager, session, workspace } = fixture();
  const bodies: any[] = []; const published: SessionMessage[] = [];
  const converter = vi.fn((messages: readonly AgentMessage[]) => messages.map(message => ({ ...message,
    role: message.role === 'custom' ? 'user' as const : message.role })));
  const step = createStepFunction(nativeRequest({ sessionId: session.id, workspaceRoot: workspace,
    retry: { enabled: true, maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 },
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      expect(manager.getSession(session.id)!.turns.filter(message => message.requestDeclaration)).toHaveLength(bodies.length < 3 ? 1 : 2);
      if (bodies.length === 1) return new Response('unavailable', { status: 503 });
      if (bodies.length === 2) return new Response('unsupported thinking effort', { status: 400 });
      return response();
    } }));
  const events = await drain(runTurn(setup([], step, { sessionId: session.id, workspaceRoot: workspace, convertToLlm: converter,
    onMessage: (message: SessionMessage) => { manager.addTurn(session.id, message); if (message.requestDeclaration) published.push(message); } })));
  expect(events.some(event => event.type === 'query.failed')).toBe(false);
  expect(bodies).toHaveLength(3); expect(bodies[0]).toEqual(bodies[1]);
  expect(published).toHaveLength(2); expect(published[0]?.requestDeclaration?.effort).toBe('low');
  expect(published[1]?.requestDeclaration?.effort).toBeUndefined();
  expect(converter).toHaveBeenCalledTimes(2);
  expect(bodies[2].thinking).toBeUndefined(); expect(bodies[2].output_config).toBeUndefined();
});

it('keeps prospective declarations out of compaction source and reuses unchanged conversion during closing', async () => {
  const raw: AgentMessage[] = [{ role: 'user', content: 'Committed work' }];
  const converter = vi.fn((messages: readonly AgentMessage[]) => messages.map(message => ({ ...message,
    role: message.role === 'custom' ? 'user' as const : message.role })));
  const publish = vi.fn();
  const prepare = createTurnContextPreparer(nativeRequest(), { allowTools: true, allowedTools: ['read'], agentMode: 'plan', requestPurpose: 'original',
    onDeclaration: publish, convertToLlm: converter }, {
    thinkingEffort: 'low', explicitEffort: false, effortAccepted: () => true, streamAttempts: () => 0, replayBinding: 'a'.repeat(64),
  });
  const original = await prepare(raw);
  expect(original.sourceMessages).toEqual(raw); expect(original.prospectiveMessages).toHaveLength(2);
  const refreshed = await original.refresh(); const closing = await refreshed.reframe({ allowTools: false, allowedTools: [] });
  expect(closing.pendingDeclaration).toBe(original.pendingDeclaration); expect(converter).toHaveBeenCalledOnce();
  expect(closing.pendingDeclaration?.requestDeclaration?.tools).toEqual([tool('read')]);
  expect(closing.payload.tools).toBeUndefined();
  expect(JSON.stringify(closing.payload.messages)).not.toContain('tool_addition');
  const published = original.published();
  const publishedClosing = await published.reframe({ allowTools: false });
  expect(publishedClosing.agentMode).toBeUndefined(); expect(publishedClosing.allowedTools).toBeUndefined();
  expect(publishedClosing.requestPurpose).toBe('turn'); expect(publishedClosing.pendingDeclaration).toBeUndefined();
  expect(converter).toHaveBeenCalledOnce();
  const candidateRaw: AgentMessage[] = [{ role: 'user', content: 'Short summary' }];
  const candidate = await original.prepare(candidateRaw);
  expect(candidate.sourceMessages).toEqual(candidateRaw); expect(candidate.prospectiveMessages).toHaveLength(2);
  expect(converter).toHaveBeenCalledTimes(2); expect(publish).not.toHaveBeenCalled();
});

it('refuses a converter that drops the prospective declaration before persistence or dispatch', async () => {
  const sends = vi.fn(async () => response()); const persisted: SessionMessage[] = [];
  const converter = vi.fn((messages: readonly AgentMessage[]) => messages.filter(message => !message.requestDeclaration)
    .map(message => ({ ...message, role: message.role === 'custom' ? 'user' as const : message.role })));
  const events = await drain(runTurn(setup([], createStepFunction(nativeRequest({ fetchImpl: sends })), {
    convertToLlm: converter, onMessage: (message: SessionMessage) => persisted.push(message),
  })));
  expect(converter).toHaveBeenCalledOnce(); expect(sends).not.toHaveBeenCalled();
  expect(persisted.some(message => message.requestDeclaration)).toBe(false);
  expect(events.some(event => event.type === 'query.failed')).toBe(true);
});
