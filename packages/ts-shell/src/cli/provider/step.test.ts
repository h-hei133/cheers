import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { createSubagentRunner } from '../../turn/subagent.js';
import { createProviderStep, delegatedSteps, type ProviderStepHost } from './step.js';
import { declareEndpoint, endpointShape } from '../../provider/endpoints/index.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { writeGoal, readGoalEdit } from '../../planning/goal/store.js';
import { goalRequestPolicy } from '../../planning/goal/budget.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { createTaskToolDefinition } from '../../core/tools/taskTool.js';
import { runTurn } from '../../turn/session.js';
import { runAgentsCommand } from '../../core/subagents/command.js';
import { getSessionUsage } from '../../observability/usageTelemetry.js';
import { createToolDiscovery } from '../../core/tools/discovery/state.js';
import { toolSchemas } from '../../turn/tools.js';
import type { ToolDefinition } from '../../tools/types.js';
import { modelPicker } from '../interactive/picker/model.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../session/model/state.js';
import { writeCatalogCache } from '../../core/models/catalogStore.js';
import { projectSessionModel } from '../../session/model/projection.js';

const servers: http.Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  cleanupAdvisorHarnesses();
});

async function wire(setup: ReturnType<typeof createAdvisorHarness>, status = 200, ordinary = false, held = false) {
  const received: Record<string, unknown>[] = [];
  let onChild!: () => void; const childReceived = new Promise<void>(resolve => { onChild = resolve; });
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')); received.push(body);
    if (body.model === 'review-model') { onChild(); if (held) return; }
    const message = ordinary && body.model === 'primary-model' && received.length === 1 ? { role: 'assistant', content: '', tool_calls: [{ id: 'ordinary-task', type: 'function',
      function: { name: 'task', arguments: JSON.stringify({ description: 'Role inspection', prompt: 'Inspect role evidence', subagent_type: 'review' }) } }] }
      : { role: 'assistant', content: 'INDEPENDENT_ADVISOR_FINDING' };
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(status === 200 ? JSON.stringify({ choices: [{ message, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 } }) : JSON.stringify({ error: { message: 'sk-synthetic-HTTP-BODY-MUST-NOT-PUBLISH' } }));
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing local server address');
  const baseUrl = `http://127.0.0.1:${address.port}/v1`; const endpoint = 'advisor-wire-test';
  declareEndpoint(endpoint, { ...endpointShape('openai-compatible'), requestBound: value => {
    const body = JSON.parse(value.body); return { inputTokens: Buffer.byteLength(value.body), outputTokens: body.max_tokens ?? body.max_completion_tokens,
      source: 'isolated-test-protocol', version: '1' };
  } });
  const config = { ...getRuntimeConfig(setup.root), retryEnabled: false, retryMaxRetries: 0, providerRetryMaxRetries: 0, maxOutputTokens: 10,
    providerConnectTimeoutMs: 3000, providerHeadersTimeoutMs: 3000, providerBodyTimeoutMs: 3000 };
  const request: ProviderStepHost = { providerMode: 'real', providerCredentialResolution: {
    provider: 'openai', model: 'primary-model', baseUrl, expectedEnvVarName: 'OPENAI_API_KEY',
    credential: { provider: 'openai', authMode: 'api-key', apiKey: 'synthetic-wire-only', model: 'primary-model', baseUrl, source: 'cli', envVarName: 'OPENAI_API_KEY' } },
    workspaceRoot: setup.root, sessionId: setup.session.id, runtimeConfig: config,
    providerCatalog: [{ id: 'openai', label: 'Isolated wire fixture', runtime: 'openai', auth: 'api-key', endpoint, baseUrl, models: [
      { id: 'review-model', contextWindow: 10000, maxTokens: 10, reasoning: true }, { id: 'primary-model', contextWindow: 10000, maxTokens: 10, reasoning: true },
      { id: 'plain-model', contextWindow: 10000, maxTokens: 10, reasoning: false }] }],
    requestPolicy: goalRequestPolicy(setup.manager, setup.session), agentMode: 'build' };
  const main = vi.fn(async () => ({ text: 'WRONG_PARENT_STEP', toolCalls: [], stopReason: 'stop' as const }));
  const runner = createSubagentRunner({ step: main, stepForModel: delegatedSteps(request, new Map(), {}), defaultMaxSteps: 1,
    retry: { enabled: config.retryEnabled, maxRetries: config.retryMaxRetries } }, new Map(), {
    sessionId: setup.session.id, workspaceRoot: setup.root, agentMode: 'build', permissionScope: 'ask', hooks: new HookDispatcher(), emit: () => {} });
  return { received, request, main, runner, childReceived };
}

function ordinaryTurn(setup: ReturnType<typeof createAdvisorHarness>, server: Awaited<ReturnType<typeof wire>>) {
  const tools = new Map([['task', createTaskToolDefinition()]]);
  const request = { ...server.request, thinkingEffort: 'low' as const, thinkingEffortExplicit: true };
  const step = createProviderStep(request, tools, {}); const messages: string[] = [];
  const turn = runTurn({ sessionId: setup.session.id, workspaceRoot: setup.root, agentMode: 'build', permissionScope: 'allow-all',
    prompt: 'MAIN_CONTEXT_MARKER', history: [], onMessage: message => messages.push(String(message.content)), signal: setup.signal,
    step, tools, hooks: new HookDispatcher(), maxSteps: 3, retry: { enabled: false, maxRetries: 0 },
    subagentHost: { step, stepForModel: delegatedSteps(request, tools, {}), defaultMaxSteps: 1, retry: { enabled: false, maxRetries: 0 } } });
  return { messages, finished: (async () => { for await (const _event of turn.events) { /* consume actual native turn */ } })() };
}

it('uses the host plan mode for a foreground model that cannot call tools', async () => {
  const setup = createAdvisorHarness(false, false);
  const server = await wire(setup);
  const providerCatalog = server.request.providerCatalog!.map(provider => ({
    ...provider,
    models: provider.models.map(model => model.id === 'primary-model'
      ? { ...model, toolCalling: false }
      : model),
  }));
  const step = createProviderStep({
    ...server.request,
    agentMode: 'plan',
    providerCatalog,
  }, new Map(), {});

  const result = await step([{ role: 'user', content: 'Plan without tools' }], setup.signal, {}, { allowTools: true });

  expect(result).toMatchObject({ stopReason: 'stop', text: 'INDEPENDENT_ADVISOR_FINDING' });
  expect(server.received).toHaveLength(1);
  expect(server.received[0]?.tools).toBeUndefined();
  const messages = server.received[0]?.messages as Array<{ readonly role: string; readonly content?: string }>;
  expect(messages[0]?.content).toContain('PLAN MODE ACTIVE: Answer from the conversation');
  expect(messages[0]?.content).not.toContain('BUILD MODE ACTIVE');
  expect(messages[0]?.content).not.toContain('equipped with real tools');
});

it('keeps an explicit request tier ahead of the session, resolved connection and provider defaults', async () => {
  const setup = createAdvisorHarness(false, false);
  const server = await wire(setup);
  const connection = { id: 'tier-owner', provider: 'openai' as const, authType: 'api-key' as const,
    apiKey: 'synthetic-tier-owner', baseUrl: server.request.providerCredentialResolution.baseUrl,
    serviceTier: 'flex', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
  const config = { ...server.request.runtimeConfig!, providerConnections: [connection],
    providerCredentials: { openai: { serviceTier: 'priority' } },
    sessionServiceTier: { provider: 'openai', model: 'primary-model', connectionId: connection.id,
      connectionScope: 'session' as const, value: 'flex' } };
  const selected = server.request.providerCredentialResolution;
  const resolution = { ...selected, credential: { ...selected.credential!, source: 'connection' as const,
    connectionId: connection.id, apiKey: connection.apiKey } };
  const step = createProviderStep({ ...server.request, providerCredentialResolution: resolution,
    runtimeConfig: config, serviceTier: 'default' }, new Map(), {});
  await step([{ role: 'user', content: 'Check tier override' }], setup.signal, {}, { allowTools: false });
  expect(server.received).toHaveLength(1);
  expect(server.received[0]?.service_tier).toBe('default');
});

it('does not carry the main session tier into a different delegated model or sibling connection', async () => {
  const setup = createAdvisorHarness(false, false);
  const server = await wire(setup);
  const baseUrl = server.request.providerCredentialResolution.baseUrl;
  const connection = (id: string, serviceTier: string) => ({ id, provider: 'openai' as const, authType: 'api-key' as const,
    apiKey: `synthetic-${id}`, baseUrl, serviceTier, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
  const main = connection('main', 'default');
  const sibling = connection('sibling', 'priority');
  const config = { ...server.request.runtimeConfig!, providerConnections: [main, sibling],
    providerCredentials: { openai: { serviceTier: 'priority' } },
    sessionServiceTier: { provider: 'openai', model: 'primary-model', connectionId: main.id,
      connectionScope: 'session' as const, value: 'flex' } };
  const resolution = { ...server.request.providerCredentialResolution, credential: { ...server.request.providerCredentialResolution.credential!,
    source: 'connection' as const, connectionId: main.id, apiKey: main.apiKey } };
  const providerCatalog = server.request.providerCatalog!.map(provider => ({ ...provider,
    models: provider.models.map(model => ({ ...model, serviceTiers: ['default', 'priority', 'flex'] })) }));
  const request = { ...server.request, runtimeConfig: config, providerCredentialResolution: resolution, providerCatalog };
  const messages = [{ role: 'user' as const, content: 'Inspect tier binding' }];
  await createProviderStep(request, new Map(), {})(messages, setup.signal, {}, { allowTools: false });
  const delegated = delegatedSteps(request, new Map(), {});
  await delegated('review-model')(messages, setup.signal, {}, { allowTools: false });
  await delegated({ connectionId: sibling.id, provider: 'openai', model: 'primary-model' })(messages, setup.signal, {}, { allowTools: false });
  expect(server.received.map(body => body.service_tier)).toEqual(['flex', 'default', 'priority']);
});

it('dispatches a subagent using the effort saved in the role panel while the main request keeps its own setting', async () => {
  const setup = createAdvisorHarness(false, false); const server = await wire(setup);
  const connection = { id: 'role-wire', provider: 'openai' as const, authType: 'api-key' as const, apiKey: 'synthetic-role-wire',
    baseUrl: server.request.providerCredentialResolution.baseUrl, model: 'review-model', status: 'connected' as const,
    createdAt: '2026-01-01', updatedAt: '2026-01-01' };
  const config = { ...server.request.runtimeConfig!, activeProviderConnectionId: connection.id, providerConnections: [connection] };
  const catalog = server.request.providerCatalog!;
  writeCatalogCache(catalog);
  writeSessionModel(setup.session.id, { connectionId: connection.id, provider: 'openai', model: 'primary-model', thinkingEffort: 'low',
    roles: { subagent: { connectionId: connection.id, provider: 'openai', model: 'review-model', thinkingEffort: 'high' } } }, readSessionModelEdit(setup.session.id));
  const picker = modelPicker({ cwd: setup.root, projectRoot: setup.root, sessionId: setup.session.id,
    runtimeConfig: projectSessionModel(config, setup.session.id) }); await picker.load();
  const role = (await picker.inspect!('role:subagent'))!.next!; await role.load();
  const thinking = (await role.apply(['thinking']))!.next!; await thinking.load();
  expect((await thinking.apply(['medium']))?.note).toContain('subagent uses');
  const request = { ...server.request, runtimeConfig: config, thinkingEffort: 'low' as const, thinkingEffortExplicit: true };
  const run = createSubagentRunner({ step: createProviderStep(request, new Map(), {}), stepForModel: delegatedSteps(request, new Map(), {}),
    defaultMaxSteps: 1, defaultModel: readSessionModel(setup.session.id)!.roles!.subagent }, new Map(), {
    sessionId: setup.session.id, workspaceRoot: setup.root, agentMode: 'plan', permissionScope: 'ask', hooks: new HookDispatcher(), emit: () => {},
  });
  const result = await run({ definition: { name: 'role-fixture', description: 'Check role', systemPrompt: 'Inspect role evidence',
    source: 'builtin', tools: [], maxTurns: 1 }, prompt: 'Check role', workspace: setup.root });
  expect(result.failed).toBe(false);
  expect(result.selection).toMatchObject({ effort: 'medium', source: 'session-role' });
  await createProviderStep(request, new Map(), {})([{ role: 'user', content: 'Main request' }], setup.signal, {}, { allowTools: false });
  expect(server.received.map(body => [body.model, body.reasoning_effort])).toEqual([['review-model', 'medium'], ['primary-model', 'low']]);
});

it('does not advertise tools to a delegated model the catalogue says takes none', async () => {
  const setup = createAdvisorHarness(false, false);
  const server = await wire(setup);
  const providerCatalog = server.request.providerCatalog!.map(provider => ({ ...provider,
    models: provider.models.map(model => model.id === 'review-model' ? { ...model, toolCalling: false } : model) }));
  const request = { ...server.request, providerCatalog };
  const tools = new Map([['task', createTaskToolDefinition()]]);
  const delegated = delegatedSteps(request, tools, {});
  expect(delegated.acceptsTools('openai/review-model')).toBe(false);
  expect(delegated.acceptsTools('openai/primary-model')).toBe(true);

  await createSubagentRunner({ step: createProviderStep(request, new Map(), {}), stepForModel: delegated, defaultMaxSteps: 1,
    acceptsTools: model => delegated.acceptsTools(model) },
  tools, { sessionId: setup.session.id, workspaceRoot: setup.root, agentMode: 'build', permissionScope: 'ask',
    hooks: new HookDispatcher(), emit: () => {} })(
    { definition: { name: 'review', description: 'Inspect', systemPrompt: 'Inspect the role evidence', source: 'builtin', tools: ['read'],
        model: 'openai/review-model' },
      prompt: 'Check role', workspace: setup.root,
      observeTool: async () => undefined });

  const child = server.received.find(body => body.model === 'review-model');
  expect(child).toBeDefined();
  expect(child!.tools).toBeUndefined();
  expect(JSON.stringify(child)).not.toContain('Tools available to you');
  expect(JSON.stringify(child)).toContain('You have no tools');
});

it('ordinary main task dispatch consumes fresh role prompt, model and effort on actual HTTP and the same ledger without changing main effort', async () => {
  const setup = createAdvisorHarness(false, false); writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'set', objective: 'Ordinary roles' });
  fs.mkdirSync(path.join(setup.root, '.agents'));
  fs.writeFileSync(path.join(setup.root, '.agents', 'review.md'), '---\nname: review\ndescription: Inspect\nmodel: openai/review-model\neffort: high\ntools: []\nmaxTurns: 1\n---\nACTUAL_ROLE_PROMPT');
  const server = await wire(setup, 200, true); await ordinaryTurn(setup, server).finished;
  expect(server.received.map(body => [body.model, body.reasoning_effort])).toEqual([['primary-model', 'low'], ['review-model', 'high'], ['primary-model', 'low']]);
  expect(JSON.stringify(server.received[1])).toContain('ACTUAL_ROLE_PROMPT'); expect(JSON.stringify(server.received[1])).not.toContain('MAIN_CONTEXT_MARKER');
  const ledger = decodeRequestLedger(readBoundSessionState(setup.manager, setup.session).state.requestLedger)!;
  expect(ledger.scopes[readGoalEdit(setup.manager, setup.session).goal!.id]).toMatchObject({ inputTokens: 12, outputTokens: 3, historyUnknown: false, pending: {} });
});
it('ordinary task disabled and known unsupported effort refuse before a child HTTP send', async () => {
  const setup = createAdvisorHarness(false, false); fs.mkdirSync(path.join(setup.root, '.agents'));
  const role = path.join(setup.root, '.agents', 'review.md');
  fs.writeFileSync(role, '---\nname: review\ndescription: Inspect\nmodel: openai/review-model\neffort: high\nenabled: false\n---\nROLE');
  const disabled = await wire(setup, 200, true); const result = ordinaryTurn(setup, disabled); await result.finished;
  expect(disabled.received.map(body => body.model)).toEqual(['primary-model', 'primary-model']); expect(result.messages.join('\n')).toContain('disabled or invalid');
  fs.writeFileSync(role, '---\nname: review\ndescription: Inspect\nmodel: openai/plain-model\neffort: high\n---\nROLE');
  const unsupported = await wire(setup, 200, true); const refused = ordinaryTurn(setup, unsupported); await refused.finished;
  expect(unsupported.received.map(body => body.model)).toEqual(['primary-model', 'primary-model']); expect(refused.messages.join('\n')).toContain('does not support this reasoning effort');
});
it('ordinary effort-only role keeps the exact parent model and changes only its own request effort', async () => {
  const setup = createAdvisorHarness(false, false); fs.mkdirSync(path.join(setup.root, '.agents'));
  fs.writeFileSync(path.join(setup.root, '.agents', 'review.md'), '---\nname: review\ndescription: Inspect\neffort: high\nmaxTurns: 1\n---\nEFFORT_ONLY_PROMPT');
  const server = await wire(setup, 200, true); await ordinaryTurn(setup, server).finished;
  expect(server.received.map(body => [body.model, body.reasoning_effort])).toEqual([['primary-model', 'low'], ['primary-model', 'high'], ['primary-model', 'low']]);
  expect(JSON.stringify(server.received[1])).toContain('EFFORT_ONLY_PROMPT');
});
it('charges a dynamically loaded schema to the next request budget and refuses before dispatch', async () => {
  const setup = createAdvisorHarness(false, false);
  const server = await wire(setup);
  const tool = (name: string, description: string, properties: Record<string, unknown>): ToolDefinition => ({
    name, description, argsSchema: { type: 'object', properties },
    execute: async () => ({ success: true, output: 'ok' }),
  });
  const small = tool('small', 'small fixture', {});
  const large = tool('large', 'large fixture', {
    payload: { type: 'string', description: 'x'.repeat(40_000) },
  });
  const discovery = createToolDiscovery({ catalog: new Map([[small.name, small], [large.name, large]]), pinned: [small.name] });
  const request = { ...server.request, runtimeConfig: { ...server.request.runtimeConfig!, contextWindow: 2_000, reserveTokens: 0 } };
  const step = createProviderStep(request, new Map(), {}, discovery);
  let firstSchemaDigest = '';
  const first = await step([{ role: 'user', content: 'first' }], setup.signal, {}, {
    allowTools: true, onRequestSent: sent => { firstSchemaDigest = sent.promptIdentity?.schemaDigest ?? ''; },
  });
  expect(first.stopReason, first.errorMessage).toBe('stop');
  expect(firstSchemaDigest).not.toBe('');
  expect(server.received).toHaveLength(1);
  expect((server.received[0]!.tools as Array<{ function: { name: string } }> | undefined ?? []).map(item => item.function.name)).toEqual(['small']);
  expect(discovery.load(['large'])).toEqual({ loaded: ['large'], rejected: [] });
  const loadedDigest = createHash('sha256').update(JSON.stringify(toolSchemas(discovery.snapshot()))).digest('hex');
  expect(loadedDigest).not.toBe(firstSchemaDigest);
  const second = await step([{ role: 'user', content: 'second' }], setup.signal, {}, { allowTools: true });
  expect(second).toMatchObject({ stopReason: 'error', errorMessage: expect.stringMatching(/^Context overflow:/) });
  expect(server.received).toHaveLength(1);
});
it('disable cancels a held actual ordinary-task child request within its bounded cleanup window', async () => {
  const setup = createAdvisorHarness(false, false); fs.mkdirSync(path.join(setup.root, '.agents'));
  fs.writeFileSync(path.join(setup.root, '.agents', 'review.md'), '---\nname: review\ndescription: Inspect\nmodel: openai/review-model\neffort: high\n---\nROLE');
  const server = await wire(setup, 200, true, true); const running = ordinaryTurn(setup, server); await server.childReceived;
  const output = await runAgentsCommand(['disable', 'project', 'review'], { root: setup.root, trusted: () => true, sourceAccess: () => {},
    gate: () => ({ sessionId: setup.session.id, workspaceRoot: setup.root, agentMode: 'build', permissionScope: 'allow-all', hooks: new HookDispatcher(), emit: () => {} }) });
  await running.finished;
  expect(output.output).toContain('Affected live roles stopped'); expect(running.messages.join('\n')).toContain('aborted');
  expect(server.received.filter(body => body.model === 'review-model')).toHaveLength(1);
});

it('sends actual different body.model with independent tool-free context, shares main goal usage and refuses a lowered cap without fallback', async () => {
  const setup = createAdvisorHarness(); writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'set', objective: 'Independent review' });
  const server = await wire(setup); const mainStep = createProviderStep(server.request, new Map(), {});
  await mainStep([{ role: 'user', content: 'PRIVATE_MAIN_CONTEXT_NOT_INCLUDED_IN_REVIEW' }], setup.signal, {}, { allowTools: false });
  const foreground = structuredClone(getSessionUsage(setup.session.id));
  await setup.runtime.capture(setup.boundary('BOUND_SNAPSHOT_TOOL_EVIDENCE'), server.runner, setup.signal);
  expect(server.main).not.toHaveBeenCalled(); expect(server.received.map(body => body.model)).toEqual(['primary-model', 'review-model']);
  expect(JSON.stringify(server.received[1])).toContain('BOUND_SNAPSHOT_TOOL_EVIDENCE');
  expect(JSON.stringify(server.received[1])).not.toContain('PRIVATE_MAIN_CONTEXT_NOT_INCLUDED_IN_REVIEW'); expect(server.received[1]!.tools ?? []).toHaveLength(0);
  expect(setup.runtime.view().notes[0]!.text).toBe('INDEPENDENT_ADVISOR_FINDING');
  expect(getSessionUsage(setup.session.id)).toMatchObject({ lastPromptTokens: foreground.lastPromptTokens,
    lastPromptMessageCount: foreground.lastPromptMessageCount, lastBucketKey: foreground.lastBucketKey,
    lastPromptIdentity: foreground.lastPromptIdentity, recentRequests: foreground.recentRequests, turnsCount: 2 });
  const scope = () => decodeRequestLedger(readBoundSessionState(setup.manager, setup.session).state.requestLedger)!.scopes[readGoalEdit(setup.manager, setup.session).goal!.id]!;
  expect(scope()).toMatchObject({ inputTokens: 8, outputTokens: 2, historyUnknown: false, pending: {} });
  writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'budget', cap: 0 });
  await setup.runtime.capture(setup.boundary('cap zero', 2), server.runner, setup.signal);
  expect(server.received).toHaveLength(2); expect(setup.runtime.view().notes).toHaveLength(1); expect(scope()).toMatchObject({ inputTokens: 8, outputTokens: 2, pending: {} });
});

it('honors retry-off at provider and native child loop while keeping HTTP bodies out of advisor reports', async () => {
  const setup = createAdvisorHarness(); writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'set', objective: 'Failed dispatch remains metered' });
  const server = await wire(setup, 503);
  await setup.runtime.capture(setup.boundary('safe fixture'), server.runner, setup.signal);
  expect(server.received).toHaveLength(1); expect(server.received[0]!.model).toBe('review-model');
  expect(server.main).not.toHaveBeenCalled(); expect(setup.runtime.view()).toMatchObject({ status: 'error', notes: [] });
  expect(setup.reports.join('\n')).not.toContain('HTTP-BODY-MUST-NOT-PUBLISH');
  const scope = decodeRequestLedger(readBoundSessionState(setup.manager, setup.session).state.requestLedger)!.scopes[readGoalEdit(setup.manager, setup.session).goal!.id]!;
  expect(Object.values(scope.pending)).toHaveLength(1); expect(Object.values(scope.pending)[0]).toMatchObject({ dispatched: true });
});

it('an unavailable exact model produces a visible failed result with zero main-model fallback sends', async () => {
  const setup = createAdvisorHarness(); const server = await wire(setup);
  const result = await server.runner({ definition: { name: 'advisor', description: 'review', systemPrompt: 'review', source: 'builtin', model: 'unknown-provider/unavailable-model', tools: [], maxTurns: 1, permissionMode: 'plan' }, prompt: 'review', workspace: setup.root });
  expect(result).toMatchObject({ failed: true, steps: 0, failure: 'Requested delegated model is unavailable.' });
  expect(server.received).toHaveLength(0); expect(server.main).not.toHaveBeenCalled();
});
