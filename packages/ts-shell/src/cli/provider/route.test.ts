import http from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { VirtualModelRegistry, type ModelRoute, type ModelRouteRequest } from '../../core/models/virtualModels.js';
import type { CatalogProvider } from '../../core/models/catalog.js';
import type { PreparedRequest, RequestPolicy } from '../../core/agent/request/model.js';
import { writeGoal, readGoalEdit } from '../../planning/goal/store.js';
import { goalRequestPolicy } from '../../planning/goal/budget.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { createProviderStep, delegatedSteps, type ProviderStepHost } from './step.js';
import { captureBranchStore } from '../../session/branch/store/index.js';

const servers: http.Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  cleanupAdvisorHarnesses();
});

async function wire(answer: string) {
  const requests: { readonly path: string; readonly authorization?: string; readonly body: Record<string, unknown> }[] = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({ path: request.url!, authorization: request.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: answer }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 } }));
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture address unavailable');
  return { requests, baseUrl: `http://127.0.0.1:${address.port}/v1` };
}

function observingPolicy(current: RequestPolicy, reserved: PreparedRequest[]): RequestPolicy {
  return { ...current,
    reserve: request => { reserved.push(request); return current.reserve(request); },
    ...(current.withAdmission ? { withAdmission: (admit: () => void) => observingPolicy(current.withAdmission!(admit), reserved) } : {}),
    ...(current.withCompletionReserve ? { withCompletionReserve: (tokens: () => number) =>
      observingPolicy(current.withCompletionReserve!(tokens), reserved) } : {}) };
}

async function fixture() {
  const setup = createAdvisorHarness(false, false);
  vi.stubEnv('CHEERS_TEST_ROOT', setup.directory);
  vi.stubEnv('OPENAI_API_KEY', ''); vi.stubEnv('ANTHROPIC_API_KEY', '');
  const original = await wire('Original route must remain unused.');
  const physical = await wire('Physical route answer.');
  writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session),
    { type: 'set', objective: 'Verify the selected physical route.' });
  const reserved: PreparedRequest[] = [];
  const policy = goalRequestPolicy(setup.manager, setup.session);
  if (!policy) throw new Error('Fixture request policy unavailable');
  const ledgerBefore = structuredClone(readBoundSessionState(setup.manager, setup.session).state.requestLedger);
  const config = { ...getRuntimeConfig(setup.root), provider: 'openai' as const,
    activeProviderConnectionId: undefined, sessionConnection: undefined, providerConnections: [], accountPool: undefined,
    allowedModels: undefined, configScopes: undefined, maxOutputTokens: 10, reserveTokens: 0,
    retryEnabled: false, retryMaxRetries: 0, providerRetryMaxRetries: 0,
    providerConnectTimeoutMs: 3000, providerHeadersTimeoutMs: 3000, providerBodyTimeoutMs: 3000,
    providerCredentials: {
      openai: { apiKey: 'synthetic-original-route-only', model: 'automatic', baseUrl: original.baseUrl },
      anthropic: { apiKey: 'synthetic-physical-route-only', model: 'physical', baseUrl: physical.baseUrl },
    } };
  const catalog: readonly CatalogProvider[] = [
    { id: 'openai', label: 'Original loopback', runtime: 'openai', auth: 'api-key', endpoint: 'openai-compatible',
      baseUrl: original.baseUrl, models: [{ id: 'automatic', contextWindow: 20000, maxTokens: 10 }] },
    { id: 'anthropic', label: 'Physical loopback', runtime: 'anthropic', auth: 'api-key', endpoint: 'openai-compatible',
      baseUrl: physical.baseUrl, models: [{ id: 'physical', contextWindow: 10000, maxTokens: 10 }] },
  ];
  const registry = new VirtualModelRegistry();
  const route = vi.fn(async (_request: ModelRouteRequest): Promise<ModelRoute> => ({ provider: 'anthropic', modelId: 'physical' }));
  registry.register({ provider: 'openai', id: 'automatic', name: 'Automatic loopback', route });
  const host: ProviderStepHost = { providerMode: 'real', workspaceRoot: setup.root, sessionId: setup.session.id,
    agentMode: 'build', runtimeConfig: config, providerCatalog: catalog, virtualModels: registry,
    providerCredentialResolution: resolveProviderCredential({ runtimeConfig: config, env: {} }),
    requestPolicy: observingPolicy(policy, reserved) };
  const ledger = () => readBoundSessionState(setup.manager, setup.session).state.requestLedger;
  return { setup, original, physical, reserved, ledgerBefore, ledger, route, host };
}

it('routes the actual provider step to the physical URL and credential without sending to the original provider', async () => {
  const test = await fixture();
  expect(test.physical.baseUrl).not.toBe(test.original.baseUrl);
  const result = await createProviderStep(test.host, new Map(), {})(
    [{ role: 'user', content: 'Use the physical route.' }], test.setup.signal, {}, { allowTools: false });
  expect(result).toMatchObject({ text: 'Physical route answer.', stopReason: 'stop',
    origin: { provider: 'anthropic', model: 'physical' } });
  expect(test.route).toHaveBeenCalledOnce();
  expect(test.original.requests).toEqual([]);
  expect(test.physical.requests).toEqual([expect.objectContaining({ path: '/v1/chat/completions',
    authorization: 'Bearer synthetic-physical-route-only', body: expect.objectContaining({ model: 'physical' }) })]);
  expect(test.reserved).toEqual([expect.objectContaining({ provider: 'anthropic', model: 'physical' })]);
});

it.each(['model', 'role'] as const)('keeps an explicit delegated %s independent of the foreground logical selection', async kind => {
  const test = await fixture();
  const registry = new VirtualModelRegistry();
  registry.register({ provider: 'adaptive', id: 'auto', name: 'Adaptive', route: test.route });
  const connection = { id: 'delegated', provider: 'openai' as const, authType: 'api-key' as const,
    apiKey: 'synthetic-delegated-route-only', baseUrl: test.original.baseUrl, model: 'automatic',
    status: 'connected' as const, createdAt: '2026-11-15', updatedAt: '2026-11-15' };
  const host = { ...test.host, runtimeConfig: { ...test.host.runtimeConfig!, providerConnections: [connection] },
    virtualModels: registry, virtualModel: { provider: 'adaptive', model: 'auto' } };
  const target = kind === 'model' ? 'openai/automatic' : { connectionId: connection.id, provider: 'openai' as const, model: 'automatic' };
  const before = captureBranchStore({ sessionId: test.setup.session.id, cwd: test.setup.root, namespace: 'model-routing' }).initial;
  const result = await delegatedSteps(host, new Map(), {})(target)(
    [{ role: 'user', content: 'Use the explicit delegated target.' }], test.setup.signal, {}, { allowTools: false });
  expect(result).toMatchObject({ stopReason: 'stop', origin: { provider: 'openai', model: 'automatic' } });
  expect(test.route).not.toHaveBeenCalled();
  expect(test.original.requests).toHaveLength(1); expect(test.physical.requests).toEqual([]);
  expect(captureBranchStore({ sessionId: test.setup.session.id, cwd: test.setup.root, namespace: 'model-routing' }).initial).toEqual(before);
});

it('keeps inherited logical delegation while applying its own explicit effort', async () => {
  const test = await fixture();
  const registry = new VirtualModelRegistry();
  registry.register({ provider: 'adaptive', id: 'auto', name: 'Adaptive', route: test.route });
  const host = { ...test.host, providerCatalog: test.host.providerCatalog!.map(provider => ({ ...provider,
    models: provider.models.map(model => ({ ...model, reasoning: true })) })),
    virtualModels: registry, virtualModel: { provider: 'adaptive', model: 'auto', thinkingEffort: 'low' as const } };
  const result = await delegatedSteps(host, new Map(), {})('', undefined, 'high')(
    [{ role: 'user', content: 'Inherit the logical model at the child effort.' }], test.setup.signal, {}, { allowTools: false });
  expect(result).toMatchObject({ stopReason: 'stop', origin: { provider: 'anthropic', model: 'physical' } });
  expect(test.route).toHaveBeenCalledWith(expect.objectContaining({ thinkingLevel: 'high' }));
  expect(test.original.requests).toEqual([]);
  expect(test.physical.requests[0]?.body).toMatchObject({ model: 'physical', reasoning_effort: 'high' });
});

it('refuses a physical model outside allowedModels before reservation or HTTP dispatch', async () => {
  const test = await fixture();
  const host = { ...test.host, runtimeConfig: { ...test.host.runtimeConfig!, allowedModels: ['openai/automatic'] } };
  const result = await createProviderStep(host, new Map(), {})(
    [{ role: 'user', content: 'The virtual selection is allowed; its target is not.' }], test.setup.signal, {}, { allowTools: false });
  expect(result.stopReason).toBe('error');
  expect(test.route).toHaveBeenCalledOnce();
  expect(test.original.requests).toEqual([]); expect(test.physical.requests).toEqual([]);
  expect(test.reserved).toEqual([]); expect(test.ledger()).toEqual(test.ledgerBefore);
});

it.each(['provider', 'model'] as const)('refuses a missing physical catalogue %s before reservation or HTTP dispatch', async missing => {
  const test = await fixture();
  const catalog = test.host.providerCatalog!
    .filter(provider => missing !== 'provider' || provider.id !== 'anthropic')
    .map(provider => provider.id === 'anthropic' ? { ...provider, models: [] } : provider);
  const result = await createProviderStep({ ...test.host, providerCatalog: catalog }, new Map(), {})(
    [{ role: 'user', content: 'Do not infer an uncatalogued physical binding.' }], test.setup.signal, {}, { allowTools: false });
  expect(result.stopReason).toBe('error');
  expect(test.route).toHaveBeenCalledOnce();
  expect(test.original.requests).toEqual([]); expect(test.physical.requests).toEqual([]);
  expect(test.reserved).toEqual([]); expect(test.ledger()).toEqual(test.ledgerBefore);
});

it('rechecks host admission after delayed routing before reservation or HTTP dispatch', async () => {
  const test = await fixture();
  let entered!: () => void; let release!: () => void;
  const routing = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  test.route.mockImplementation(async () => { entered(); await gate; return { provider: 'anthropic', modelId: 'physical' }; });
  let revoked = false;
  const step = createProviderStep({ ...test.host, admission: () => revoked ? 'Route host admission was revoked.' : undefined }, new Map(), {});
  const running = step([{ role: 'user', content: 'Wait for physical selection.' }], test.setup.signal, {}, { allowTools: false });
  try {
    await routing;
    revoked = true; release();
    const result = await running;
    expect(result.stopReason).toBe('error');
    expect(test.route).toHaveBeenCalledOnce();
    expect(test.original.requests).toEqual([]); expect(test.physical.requests).toEqual([]);
    expect(test.reserved).toEqual([]); expect(test.ledger()).toEqual(test.ledgerBefore);
  } finally { release(); await running.catch(() => undefined); }
});

it('rejects a same-provider connection whose credential changed during routing', async () => {
  const test = await fixture();
  const connection = { id: 'captured', provider: 'openai' as const, status: 'connected' as const, authType: 'api-key' as const,
    apiKey: 'synthetic-before', model: 'automatic', baseUrl: test.physical.baseUrl, createdAt: '2026-11-15', updatedAt: '2026-11-15' };
  const config = { ...test.host.runtimeConfig!, providerConnections: [connection], activeProviderConnectionId: connection.id,
    sessionConnection: { id: connection.id, provider: connection.provider } };
  const catalog = [{ id: 'openai', runtime: 'openai' as const, endpoint: 'openai-compatible', baseUrl: test.physical.baseUrl,
    models: [{ id: 'automatic', contextWindow: 10000 }, { id: 'physical', contextWindow: 10000 }] }];
  const resolution = resolveProviderCredential({ runtimeConfig: config, env: {} });
  test.route.mockImplementation(async () => { connection.apiKey = 'synthetic-after'; return { provider: 'openai', modelId: 'physical' }; });
  const result = await createProviderStep({ ...test.host, runtimeConfig: config, providerCatalog: catalog,
    providerCredentialResolution: resolution }, new Map(), {})([{ role: 'user', content: 'Use the captured connection.' }],
    test.setup.signal, {}, { allowTools: false });
  expect(result.stopReason).toBe('error');
  expect(test.original.requests).toEqual([]); expect(test.physical.requests).toEqual([]); expect(test.reserved).toEqual([]);
});

it('rejects a physical profile credential withdrawn during message conversion', async () => {
  const test = await fixture();
  const result = await createProviderStep(test.host, new Map(), {})([{ role: 'user', content: 'Use the original profile.' }],
    test.setup.signal, {}, { allowTools: false, convertToLlm: async messages => {
      const profile = test.host.runtimeConfig!.providerCredentials.anthropic!;
      (profile as { apiKey: string }).apiKey = 'synthetic-successor';
      return messages;
    } });
  expect(result.stopReason).toBe('error');
  expect(test.original.requests).toEqual([]); expect(test.physical.requests).toEqual([]); expect(test.reserved).toEqual([]);
});

function logicalHost(test: Awaited<ReturnType<typeof fixture>>): ProviderStepHost {
  const virtualModels = new VirtualModelRegistry();
  virtualModels.register({ provider: 'adaptive', id: 'automatic', name: 'Adaptive', route: test.route });
  return { ...test.host, virtualModels, virtualModel: { provider: 'adaptive', model: 'automatic' } } as ProviderStepHost;
}

it('routes a logical selection before checking dormant physical scope and credentials', async () => {
  const test = await fixture();
  const host = { ...logicalHost(test), runtimeConfig: { ...test.host.runtimeConfig!, allowedModels: ['anthropic/physical'] },
    providerCredentialResolution: { ...test.host.providerCredentialResolution, blocked: 'missing-connection' as const, model: undefined, credential: undefined } };
  let result;
  try { result = await createProviderStep(host, new Map(), {})([{ role: 'user', content: 'Use the valid route.' }],
    test.setup.signal, {}, { allowTools: false }); } catch { result = undefined; }
  expect(result).toMatchObject({ text: 'Physical route answer.', stopReason: 'stop' });
  expect(test.route).toHaveBeenCalledOnce();
  expect(test.original.requests).toEqual([]); expect(test.physical.requests).toHaveLength(1);
});

it('persists accepted route state before compaction and restores it in a new step and fork', async () => {
  const test = await fixture(); const host = logicalHost(test);
  test.route.mockImplementation(async request => ({ provider: 'anthropic', modelId: 'physical', state: Number(request.state ?? 0) + 1 }));
  const read = (sessionId = test.setup.session.id) => captureBranchStore({ sessionId, cwd: test.setup.root, namespace: 'model-routing' }).initial;
  const key = JSON.stringify(['adaptive', 'automatic']);
  const messages = [{ role: 'user' as const, content: 'Route on this branch.' }];
  const first = await createProviderStep(host, new Map(), {})(messages, test.setup.signal, {}, { allowTools: false,
    prepareContext: async prepared => { expect(read()[key]).toBe('1'); return prepared.prepare(messages); } });
  expect(first.stopReason).toBe('stop'); expect(test.route).toHaveBeenCalledOnce();
  const fork = test.setup.manager.fork(test.setup.session.id, test.setup.root, { activate: false });
  expect(read(fork.id)[key]).toBe('1');
  const second = await createProviderStep({ ...host, sessionId: fork.id, requestPolicy: undefined }, new Map(), {})(messages,
    test.setup.signal, {}, { allowTools: false });
  expect(second.stopReason).toBe('stop'); expect(read(fork.id)[key]).toBe('2'); expect(read()[key]).toBe('1');
  expect(test.route.mock.calls.map(([request]) => request.state)).toEqual([undefined, 1]);
});

it('refuses a router state race even when the callback returns no replacement state', async () => {
  const test = await fixture(); const key = JSON.stringify(['adaptive', 'automatic']);
  const read = () => captureBranchStore({ sessionId: test.setup.session.id, cwd: test.setup.root, namespace: 'model-routing' });
  read().commit({ [key]: '1' });
  test.route.mockImplementation(async () => { read().commit({ [key]: '2' }); return { provider: 'anthropic', modelId: 'physical' }; });
  const result = await createProviderStep(logicalHost(test), new Map(), {})([{ role: 'user', content: 'Do not accept a stale read.' }],
    test.setup.signal, {}, { allowTools: false });
  expect(result.stopReason).toBe('error'); expect(test.route).toHaveBeenCalledOnce();
  expect(read().initial[key]).toBe('2'); expect(test.original.requests).toEqual([]); expect(test.physical.requests).toEqual([]);
});

it('does not persist router state when conversion cancels before route acceptance', async () => {
  const test = await fixture(); const controller = new AbortController();
  test.route.mockImplementation(async () => ({ provider: 'anthropic', modelId: 'physical', state: 1 }));
  const result = await createProviderStep(logicalHost(test), new Map(), {})([{ role: 'user', content: 'Cancel before accepting state.' }],
    controller.signal, {}, { allowTools: false, convertToLlm: messages => { controller.abort(); return messages; } });
  expect(test.route).toHaveBeenCalledOnce(); expect(result.stopReason).toBe('aborted');
  expect(captureBranchStore({ sessionId: test.setup.session.id, cwd: test.setup.root, namespace: 'model-routing' }).initial).toEqual({});
  expect(test.physical.requests).toEqual([]); expect(test.original.requests).toEqual([]);
});
