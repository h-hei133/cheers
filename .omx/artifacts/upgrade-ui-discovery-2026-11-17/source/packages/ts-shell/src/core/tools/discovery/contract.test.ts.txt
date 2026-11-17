import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ToolDefinition } from '../../../tools/types.js';
import type { HookDispatcher } from '../../hooks/hookDispatcher.js';
import type { QueryEvent } from '../../query/runtime/events.js';
import { createAgentSession, type AgentSession } from '../../../sdk/agentSession.js';
import { DefaultResourceLoader } from '../../../sdk/resourceLoader.js';
import { getRuntimeConfig } from '../../../config/runtimeConfig.js';
import { preparePromptRequest } from '../../prompts/request.js';
import { requestIdentity } from '../../../context/request/identity.js';
import { createStepFunction } from '../../../turn/step.js';
import { runTurn } from '../../../turn/session.js';
import { adaptTools, createToolHooks, toolSchemas, type ToolGateOptions } from '../../../turn/tools.js';
import { executeToolBatch } from '../../agent/tools.js';
import { validateToolArguments } from '../arguments.js';
import { resetSessionUsage } from '../../../observability/usageTelemetry.js';
import type { PromptIdentitySnapshot } from '../../../observability/usage/model.js';
import { createToolDiscovery, type ToolDiscovery } from './state.js';

let root: string;
let sessionId: string;
const sessions: AgentSession[] = [];

beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  root = fs.mkdtempSync('/tmp/cheers-test/discovery-contract-');
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  fs.mkdirSync(path.join(root, '.git'));
  sessionId = path.basename(root);
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('CHEERS_TEST_ROOT', root);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
  vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic');
});

afterEach(async () => {
  try {
    for (const session of sessions.splice(0)) await session.dispose();
  } finally {
    resetSessionUsage(sessionId);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function probe(name = 'archive_lookup'): ToolDefinition {
  return {
    name,
    description: 'Look up an isolated record.',
    argsSchema: {
      type: 'object',
      properties: { selector: { type: 'string', description: 'chrysoprase' } },
      required: ['selector'],
      additionalProperties: false,
    },
    execute: async () => ({ success: true, output: 'record-found' }),
  };
}

function selector(definition: ToolDefinition): Record<string, unknown> {
  return (definition.argsSchema.properties as Record<string, Record<string, unknown>>).selector!;
}

function config() {
  return {
    ...getRuntimeConfig(root),
    toolDiscovery: 'dynamic' as const,
    disabledTools: [],
    hiddenToolPrefixes: [],
    enableMcpTools: false,
    offline: true,
  };
}

function gate(overrides: Partial<ToolGateOptions> = {}): ToolGateOptions & { events: QueryEvent[] } {
  const events: QueryEvent[] = [];
  return {
    sessionId,
    workspaceRoot: root,
    permissionScope: 'allow-all',
    hooks: { dispatch: async () => ({ decision: 'allow' }) } as unknown as HookDispatcher,
    emit: event => { events.push(event); },
    events,
    ...overrides,
  };
}

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function sdkRequest(definition: ToolDefinition) {
  const loader = new DefaultResourceLoader({ cwd: root, noExtensions: true, noSkills: true, noThemes: true, noContextFiles: true });
  await loader.reload();
  const { session } = await createAgentSession({
    cwd: root,
    resourceLoader: loader,
    customTools: [definition],
    runtimeConfig: config(),
    offline: true,
  });
  sessions.push(session);
  return preparePromptRequest({
    workspaceRoot: root,
    sessionId: session.runtimeContext.session.id,
    sdkSkills: new Map(),
    runtimeConfig: session.runtimeContext.runtimeConfig,
  }, () => new Map());
}

function request(definition: ToolDefinition, settings = config()) {
  return preparePromptRequest({
    workspaceRoot: root,
    sessionId,
    runtimeConfig: settings,
    catalogContent: { skills: new Map(), tools: [definition] },
  }, () => new Map());
}

function batch(discovery: ToolDiscovery, options: ToolGateOptions, name: string, args: Record<string, unknown>, pool = discovery.snapshot()) {
  return executeToolBatch(adaptTools(pool, options), { role: 'assistant', content: '' },
    [{ id: 'owned-call', name, args }], createToolHooks(options, () => discovery.snapshot()),
    'sequential', undefined, () => {});
}

it('revokes the retained SDK schema generation when the next declaration changes', async () => {
  const definition = probe();
  const prepared = await sdkRequest(definition);
  const discovery = prepared.discovery!;
  discovery.load([definition.name]);
  const before = discovery.generation;
  const beforeIdentity = requestIdentity(prepared.currentOverhead());

  // The caller changes only an ordinary nested data property through the retained public SDK input.
  selector(definition).description = 'cinnabar';

  const next = prepared.currentOverhead();
  expect(next.tools.find(tool => tool.function.name === definition.name)?.function.parameters)
    .toMatchObject({ properties: { selector: { description: 'cinnabar' } } });
  expect(requestIdentity(next).schemaDigest).not.toBe(beforeIdentity.schemaDigest);
  expect(requestIdentity(next).systemDigest).toBe(beforeIdentity.systemDigest);
  expect(discovery.generation).not.toBe(before);
});

it('refuses a retained SDK schema snapshot after nested type mutation through the ordinary gate', async () => {
  const definition = probe();
  const effects = vi.spyOn(definition, 'execute');
  const prepared = await sdkRequest(definition);
  const discovery = prepared.discovery!;
  discovery.load([definition.name]);
  const stale = prepared.currentTools();
  validateToolArguments(definition.argsSchema, { selector: 'first' });

  selector(definition).type = 'number';
  expect(() => validateToolArguments(definition.argsSchema, { selector: 'first' })).toThrow('constraint failed');
  expect(() => validateToolArguments(definition.argsSchema, { selector: 7 })).not.toThrow();
  const result = await batch(discovery, gate(), definition.name, { selector: 7 }, stale);

  expect(effects).not.toHaveBeenCalled();
  expect(result.messages[0]!.content).toContain('older discovery generation');
});

it('refuses the retained SDK schema prepared effect after an awaited ordinary approval', async () => {
  const held = barrier();
  const started = barrier();
  const effects = vi.fn(async () => ({ success: true, output: 'prepared-record-found' }));
  const definition: ToolDefinition = {
    ...probe(),
    prepare: async () => ({
      targets: [],
      permissionToolName: 'task',
      permissionArgs: { prompt: 'Inspect this isolated record.' },
      preview: 'Record lookup',
      execute: effects,
    }),
  };
  const prepared = await sdkRequest(definition);
  const discovery = prepared.discovery!;
  discovery.load([definition.name]);
  const setup = gate({ permissionScope: 'ask', escalationPromptHandler: async prompt => {
    started.release();
    await held.promise;
    return { promptId: prompt.id, decision: 'allow-once', respondedAt: 1 };
  } });
  const pending = batch(discovery, setup, definition.name, { selector: 'first' });
  await started.promise;
  selector(definition).description = 'cinnabar';
  held.release();
  const result = await pending;

  expect(setup.events).toContainEqual(expect.objectContaining({ type: 'approval.resolved', outcome: 'approved' }));
  expect(effects).not.toHaveBeenCalled();
  expect(result.messages[0]!.content).toContain('older discovery generation');
});

it('keeps an immutable SDK definition callable with stable declaration and catalogue identities', async () => {
  const schema = Object.freeze({
    type: 'object',
    properties: Object.freeze({ selector: Object.freeze({ type: 'string', description: 'chrysoprase' }) }),
    required: Object.freeze(['selector']),
    additionalProperties: false,
  });
  const effects = vi.fn(async () => ({ success: true, output: 'immutable-record-found' }));
  const definition = Object.freeze({ ...probe(), argsSchema: schema, execute: effects });
  const prepared = await sdkRequest(definition);
  const discovery = prepared.discovery!;
  discovery.load([definition.name]);
  const before = discovery.generation;
  const identity = requestIdentity(prepared.currentOverhead());
  const result = await batch(discovery, gate(), definition.name, { selector: 'first' });

  expect(result.messages[0]!.content).toBe('immutable-record-found');
  expect(effects).toHaveBeenCalledOnce();
  expect(discovery.generation).toBe(before);
  expect(requestIdentity(prepared.currentOverhead())).toEqual(identity);
});

it('revokes a replaced definition while preserving an unrelated captured definition', async () => {
  const definition = probe();
  const unrelated = probe('unrelated_lookup');
  const oldEffects = vi.spyOn(definition, 'execute');
  const unrelatedEffects = vi.spyOn(unrelated, 'execute');
  const currentEffects = vi.fn(async () => ({ success: true, output: 'current-record-found' }));
  const catalog = new Map([[definition.name, definition], [unrelated.name, unrelated]]);
  const discovery = createToolDiscovery({ catalog, pinned: [], initial: [...catalog.keys()] });
  const before = discovery.generation;
  const stale = discovery.snapshot();
  catalog.set(definition.name, { ...definition, description: 'Replacement record contract.', execute: currentEffects });

  const refused = await batch(discovery, gate(), definition.name, { selector: 'first' }, stale);
  const preserved = await batch(discovery, gate(), unrelated.name, { selector: 'first' }, stale);
  expect(discovery.generation).not.toBe(before);
  expect(refused.messages[0]!.content).toContain('older discovery generation');
  expect(oldEffects).not.toHaveBeenCalled();
  expect(preserved.messages[0]!.content).toBe('record-found');
  expect(unrelatedEffects).toHaveBeenCalledOnce();

  const current = await batch(discovery, gate(), definition.name, { selector: 'first' });
  expect(current.messages[0]!.content).toBe('current-record-found');
  expect(currentEffects).toHaveBeenCalledOnce();
});

it.each(['preparation', 'prepared approval', 'ordinary approval'] as const)(
  'blocks effects when a definition is replaced during pending %s', async stage => {
    const held = barrier();
    const started = barrier();
    const effects = vi.fn(async () => ({ success: true, output: 'stale-record-found' }));
    const currentEffects = vi.fn(async () => ({ success: true, output: 'current-record-found' }));
    const definition: ToolDefinition = {
      ...probe(),
      execute: effects,
      ...(stage === 'ordinary approval' ? {} : { prepare: async () => {
        if (stage === 'preparation') { started.release(); await held.promise; }
        return { targets: [], permissionToolName: 'task' as const,
          permissionArgs: { prompt: 'Inspect the captured record.' }, preview: 'Record lookup', execute: effects };
      } }),
    };
    const catalog = new Map([[definition.name, definition]]);
    const discovery = createToolDiscovery({ catalog, pinned: [], initial: [definition.name] });
    const setup = gate({ permissionScope: 'ask', escalationPromptHandler: async prompt => {
      if (stage !== 'preparation') { started.release(); await held.promise; }
      return { promptId: prompt.id, decision: 'allow-once', respondedAt: 1 };
    } });
    const pending = batch(discovery, setup, definition.name, { selector: 'first' });
    await started.promise;
    const { prepare: _prepare, ...plain } = definition;
    catalog.set(definition.name, { ...plain, description: 'Current record contract.', execute: currentEffects });
    held.release();
    const refused = await pending;

    expect(effects).not.toHaveBeenCalled();
    expect(currentEffects).not.toHaveBeenCalled();
    expect(refused.messages[0]!.content).toContain('older discovery generation');
    const current = await batch(discovery, gate(), definition.name, { selector: 'first' });
    expect(current.messages[0]!.content).toBe('current-record-found');
    expect(currentEffects).toHaveBeenCalledOnce();
  },
);

it.each(['allow-once', 'deny'] as const)(
  'loads a schema-only search hit on the next serialized request and preserves ordinary %s permission', async decision => {
    const definition = probe();
    const effects = vi.spyOn(definition, 'execute');
    const prepared = await request(definition);
    const discovery = prepared.discovery!;
    const bodies: Array<{ tools?: Array<{ function: { name: string; parameters: Record<string, unknown> } }>; messages: Array<{ role: string; content: string }> }> = [];
    const identities: PromptIdentitySnapshot[] = [];
    const persisted: Array<{ role: string; tool_call_id?: string; content: unknown }> = [];
    const hooks = vi.fn(async (_payload: { eventName: string; toolName?: string }, _options?: unknown) => ({ decision: 'allow' as const }));
    const approval = vi.fn(async (prompt: { id: string; context: { toolName: string } }) => ({
      promptId: prompt.id, decision: prompt.context.toolName === 'tool_search' ? 'allow-once' as const : decision, respondedAt: 1,
    }));
    const step = createStepFunction({
      workspaceRoot: root,
      sessionId,
      provider: { provider: 'fixture', model: 'm', endpoint: 'openai-compatible', baseUrl: 'https://fixture.invalid/v1', headers: {} },
      systemPrompt: prepared.system.text,
      tools: toolSchemas(prepared.tools),
      toolSnapshot: () => toolSchemas(discovery.snapshot()),
      contextWindow: 65536,
      maxOutputTokens: 128,
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        const index = bodies.length;
        const name = index === 1 ? 'tool_search' : definition.name;
        const args = index === 1 ? { query: 'chrysoprase', load: true } : { selector: 'first' };
        return new Response(JSON.stringify({ choices: [{ message: index < 3 ? {
          content: '', tool_calls: [{ id: `call_${index}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
        } : { content: 'Finished inspecting the record.' }, finish_reason: index < 3 ? 'tool_calls' : 'stop' }] }),
        { headers: { 'content-type': 'application/json' } });
      },
    });
    const emitted: QueryEvent[] = [];
    for await (const event of runTurn({
      sessionId,
      prompt: 'Inspect the isolated record.',
      workspaceRoot: root,
      history: [],
      tools: prepared.tools,
      toolSnapshot: () => discovery.snapshot(),
      step,
      hooks: { dispatch: hooks } as unknown as HookDispatcher,
      permissionScope: 'ask',
      escalationPromptHandler: approval,
      maxSteps: 4,
      signal: new AbortController().signal,
      onMessage: persisted.push.bind(persisted),
      onPromptIdentity: identities.push.bind(identities),
    }).events) emitted.push(event);

    expect(bodies).toHaveLength(3);
    expect(bodies[0]!.tools?.map(tool => tool.function.name)).toEqual(['tool_search', 'tool_load']);
    const nextSchema = bodies[1]!.tools?.find(tool => tool.function.name === definition.name);
    expect(nextSchema?.function.parameters).toEqual(definition.argsSchema);
    const searchResult = persisted.find(message => message.tool_call_id === 'call_1');
    expect(JSON.parse(String(searchResult?.content))).toMatchObject({
      matches: [{ name: definition.name, loaded: false, pinned: false }], loaded: [definition.name], rejected: [],
    });
    expect(identities).toHaveLength(3);
    expect(identities[0]!.schemaDigest).toBeDefined();
    expect(identities[1]!.schemaDigest).not.toBe(identities[0]!.schemaDigest);
    expect(identities[1]!.systemDigest).toBe(identities[0]!.systemDigest);
    expect(bodies[2]!.messages).toContainEqual(expect.objectContaining({ role: 'tool',
      content: decision === 'allow-once' ? 'record-found' : expect.stringContaining('User denied permission') }));
    expect(approval.mock.calls.map(([prompt]) => prompt.context.toolName)).toEqual(['tool_search', definition.name]);
    expect(effects).toHaveBeenCalledTimes(decision === 'allow-once' ? 1 : 0);
    expect(emitted).toContainEqual(expect.objectContaining({ type: 'tool.result', toolName: definition.name, success: decision === 'allow-once' }));
    expect(hooks.mock.calls.some(([payload]) => payload.eventName === (decision === 'allow-once' ? 'PreToolUse' : 'PermissionDenied')
      && payload.toolName === definition.name)).toBe(true);
  },
);

it.each(['disabled', 'hidden'] as const)('keeps a %s capability out of discovery and executable declarations', async restriction => {
  const definition = probe();
  const effects = vi.spyOn(definition, 'execute');
  const permitted = probe('permitted_lookup');
  const prepared = await preparePromptRequest({
    workspaceRoot: root,
    sessionId,
    runtimeConfig: { ...config(), disabledTools: restriction === 'disabled' ? [definition.name] : [],
      hiddenToolPrefixes: restriction === 'hidden' ? ['archive_'] : [] },
    catalogContent: { skills: new Map(), tools: [definition, permitted] },
  }, () => new Map());
  const discovery = prepared.discovery!;

  expect(discovery.search('archive')).toEqual([]);
  expect(discovery.search('permitted').map(match => match.name)).toEqual([permitted.name]);
  expect(discovery.load([definition.name])).toEqual({ loaded: [], rejected: [definition.name] });
  expect(prepared.currentOverhead().tools.some(tool => tool.function.name === definition.name)).toBe(false);
  const result = await batch(discovery, gate(), definition.name, { selector: 'first' });
  expect(result.messages[0]!.content).toBe(`Tool ${definition.name} not found`);
  expect(effects).not.toHaveBeenCalled();
});
