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
import { createProviderStep, type ProviderStepHost } from './step.js';

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
