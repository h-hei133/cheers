import http from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../../test-utils/advisor.js';
import { getRuntimeConfig } from '../../../config/runtimeConfig.js';
import { ConfigState } from '../../../config/state.js';
import { configurationBinding } from '../../../core/shell/configuration.js';
import { resolveProviderCredential } from '../../../core/shell/providerCredentials.js';
import { registerCatalogContribution } from '../../../core/catalog/contributions.js';
import type { ModelRoute, ModelRouteRequest } from '../../../core/models/virtualModels.js';
import type { CatalogModel, CatalogProvider } from '../../../core/models/catalog.js';
import type { ThinkingPreference } from '../../../core/models/effort.js';
import type { MessageConverter } from '../../../core/agent/messages.js';
import type { EndpointKind } from '../../../provider/endpoints/index.js';
import { captureBranchStore } from '../../../session/branch/store/index.js';
import { readSessionModelEdit, writeSessionModel } from '../../../session/model/state.js';
import type { SessionRuntimeDependencies } from '../../../core/shell/sessionRuntime.js';
import { ShellCommandRuntime } from '../../../core/shell/command.js';
import type { CliRuntimeInvocationInput } from '../../../entrypoints/cliRuntimeInvocation.js';
import { createCliSessionRuntime } from '../cliSessionRuntimeFactory.js';

const observed = vi.hoisted(() => ({ deps: undefined as SessionRuntimeDependencies | undefined,
  resources: undefined as ReturnType<NonNullable<CliRuntimeInvocationInput['prepareProviderResources']>> | undefined }));
vi.mock('../goalScheduling.js', () => ({ installGoalScheduler: () => undefined, schedulerForContext: () => undefined }));
vi.mock('../../../core/shell/sessionRuntime.js', () => ({ ShellSessionRuntime: class {
  readonly commands = new ShellCommandRuntime();
  constructor(deps: SessionRuntimeDependencies) { observed.deps = deps; }
  getPermissionScope() { return 'ask'; }
  getAgentMode() { return 'plan'; }
  getCurrentRunController() { return null; }
} }));
vi.mock('../cliRuntimeInvocationBridge.js', () => ({ streamCliRuntimePrompt: (input: CliRuntimeInvocationInput) => {
  observed.resources = input.prepareProviderResources?.(input.providerCredentialResolution);
  return { events: [] };
} }));
const servers: http.Server[] = [], retire: Array<() => void> = [];
afterEach(async () => {
  for (const close of retire.splice(0)) close();
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  cleanupAdvisorHarnesses();
});

async function fixture(explicit = false, dormant = true, input: {
  readonly effort?: ThinkingPreference;
  readonly physical?: Partial<CatalogModel>;
  readonly converter?: MessageConverter;
  readonly endpoint?: EndpointKind;
  readonly cacheRetention?: 'short' | 'long' | 'none';
} = {}) {
  const setup = createAdvisorHarness(false, false);
  const requests: Array<{ authorization?: string; body: Record<string, unknown> }> = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({ authorization: request.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Condensed routed history.' }, finish_reason: 'stop' }] }));
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  const config = { ...getRuntimeConfig(setup.root), provider: 'openai' as const,
    providerConnections: explicit ? [{ id: 'summary', provider: 'anthropic' as const, status: 'connected' as const,
      authType: 'api-key' as const, apiKey: 'synthetic-summary', model: 'summary', baseUrl,
      createdAt: '2026-11-15', updatedAt: '2026-11-15' }] : [],
    activeProviderConnectionId: undefined, sessionConnection: undefined, accountPool: undefined, configScopes: undefined,
    allowedModels: undefined, contextWindow: undefined, maxOutputTokens: 64, reserveTokens: 0, keepRecentTokens: 100,
    retryEnabled: false, cacheWarming: 'on' as const, cacheRetention: input.cacheRetention ?? 'short',
    providerCredentials: {
      openai: { ...(dormant ? {} : { apiKey: 'synthetic-dormant' }), model: 'dormant', baseUrl },
      anthropic: { apiKey: 'synthetic-route', model: 'physical', baseUrl },
    },
    sessionModelRoles: explicit ? { summary: { provider: 'anthropic' as const, model: 'summary', connectionId: 'summary' } } : undefined,
  };
  const catalog: readonly CatalogProvider[] = [
    { id: 'openai', runtime: 'openai', endpoint: 'openai-compatible', baseUrl, models: [{ id: 'dormant', contextWindow: 4000, maxTokens: 64 }] },
    { id: 'anthropic', runtime: 'anthropic', endpoint: input.endpoint ?? 'openai-compatible', baseUrl,
      models: [{ id: 'physical', contextWindow: 12_000, maxTokens: 512, ...input.physical }, { id: 'summary', contextWindow: 12_000, maxTokens: 256 }] },
  ];
  const route = vi.fn((_request: ModelRouteRequest): ModelRoute => ({ provider: 'anthropic', modelId: 'physical', state: 999 }));
  const close = registerCatalogContribution({ root: setup.root, sessionId: setup.session.id, commands: [], tools: [], skills: () => [],
    virtualModels: [{ provider: 'adaptive', id: 'auto', name: 'Adaptive', route }] });
  retire.push(close);
  writeSessionModel(setup.session.id, { provider: 'openai', model: 'dormant', connectionScope: 'provider',
    virtualModel: { provider: 'adaptive', model: 'auto',
      ...(input.effort !== undefined ? { thinkingEffort: input.effort } : {}) } }, readSessionModelEdit(setup.session.id));
  for (let index = 0; index < 8; index++) {
    if (index % 2 === 0) setup.manager.persistUserPromptBarrier(setup.session.id, `${index}:${'x'.repeat(1400)}`);
    else setup.manager.addTurn(setup.session.id, { role: 'assistant', content: `${index}:${'y'.repeat(1400)}` });
  }
  const key = JSON.stringify(['adaptive', 'auto']);
  const store = () => captureBranchStore({ sessionId: setup.session.id, cwd: setup.root, namespace: 'model-routing' });
  store().commit({ [key]: '7' });
  const identity = { projectRoot: setup.root, session: setup.session };
  const configuration = new ConfigState(config, configurationBinding(identity), catalog);
  const context = { ...identity, cwd: setup.root, configuration,
    ...(input.converter ? { convertToLlm: input.converter } : {}),
    get runtimeConfig() { return configuration.current.config; } };
  createCliSessionRuntime({ runtimeContext: context, sessionManager: setup.manager,
    providerRuntimeBridge: { resolveCredentialSnapshot: () => resolveProviderCredential({ runtimeConfig: context.runtimeConfig, env: {} }) },
    renderer: { renderLine: vi.fn(), emit: vi.fn() }, options: {}, approvalTrustPolicy: {}, getReadline: () => null,
  } as never);
  return { ...setup, deps: observed.deps!, context, route, requests, close, store, key };
}

it.each(['manual', 'branch'] as const)('routes %s summaries once without reading or writing branch routing state', async kind => {
  const test = await fixture();
  if (kind === 'manual') expect(await test.deps.compactHistory!(test.session.id, test.signal)).toMatchObject({ status: 'compacted' });
  else expect(await test.deps.summarizeAbandonedTurns!(test.manager.getSession(test.session.id)!.turns, test.signal)).toContain('Condensed routed history.');
  expect(test.route).toHaveBeenCalledOnce();
  expect(test.route.mock.calls[0]![0]).toMatchObject({ provider: 'adaptive', modelId: 'auto', reason: 'direct' });
  expect(test.route.mock.calls[0]![0].state).toBeUndefined();
  expect(test.store().initial[test.key]).toBe('7');
  expect(test.requests.length).toBeGreaterThan(0);
  expect(test.requests.every(request => request.body.model === 'physical' && request.authorization === 'Bearer synthetic-route')).toBe(true);
  expect(test.requests.every(request => request.body.max_tokens === 512)).toBe(true);
});

it.each(['manual', 'branch'] as const)('carries long cache retention through the actual direct %s virtual summary', async kind => {
  const test = await fixture(false, true, { cacheRetention: 'long',
    physical: { compat: { promptCacheKey: true, supportsLongCacheRetention: true } } });
  if (kind === 'manual') expect(await test.deps.compactHistory!(test.session.id, test.signal)).toMatchObject({ status: 'compacted' });
  else expect(await test.deps.summarizeAbandonedTurns!(test.manager.getSession(test.session.id)!.turns, test.signal)).toContain('Condensed routed history.');
  expect(test.requests.length).toBeGreaterThan(0);
  for (const request of test.requests) expect(request.body).toMatchObject({ model: 'physical', prompt_cache_key: expect.any(String), prompt_cache_retention: '24h' });
  expect(test.route).toHaveBeenCalledOnce();
  expect(test.store().initial[test.key]).toBe('7');
});

it.each(['manual', 'branch'] as const)('keeps an explicit summary role for %s with dormant credentials unavailable', async kind => {
  const test = await fixture(true);
  if (kind === 'manual') expect(await test.deps.compactHistory!(test.session.id, test.signal)).toMatchObject({ status: 'compacted' });
  else expect(await test.deps.summarizeAbandonedTurns!(test.manager.getSession(test.session.id)!.turns, test.signal)).toContain('Condensed routed history.');
  expect(test.requests.length).toBeGreaterThan(0);
  expect(test.requests.every(request => request.body.model === 'summary' && request.body.max_tokens === 256)).toBe(true);
  expect(test.store().initial[test.key]).toBe('7');
});

it('defers automatic compaction to the routed physical target and does not create a virtual cache warmer', async () => {
  const test = await fixture(false, false);
  test.deps.runPrompt('Continue', test.signal);
  expect(observed.resources?.cacheWarming).toBeUndefined();
  expect(observed.resources?.compaction?.forRequest).toBeTypeOf('function');
  expect(test.route).not.toHaveBeenCalled(); expect(test.requests).toEqual([]);
});

it('rejects a retired direct route before summary dispatch', async () => {
  const test = await fixture();
  test.route.mockImplementation(() => { test.close(); return { provider: 'anthropic', modelId: 'physical', state: 999 }; });
  await test.deps.summarizeAbandonedTurns!(test.manager.getSession(test.session.id)!.turns, test.signal)?.catch(() => undefined);
  expect(test.route).toHaveBeenCalledOnce(); expect(test.requests).toEqual([]); expect(test.store().initial[test.key]).toBe('7');
});

it('refuses a direct summary when its output budget cannot carry explicit thinking', async () => {
  const test = await fixture(false, true, { effort: 'high', endpoint: 'anthropic-messages' });
  await expect(test.deps.summarizeAbandonedTurns!(test.manager.getSession(test.session.id)!.turns, test.signal))
    .rejects.toThrow('output limit must be at least 2048');
  expect(test.route).toHaveBeenCalledOnce(); expect(test.requests).toEqual([]); expect(test.store().initial[test.key]).toBe('7');
});

it.each(['route', 'converter'] as const)('retains its captured settings across a same-binding publication during direct summary %s', async boundary => {
  let publish!: () => void;
  const test = await fixture(false, true, boundary === 'converter' ? { converter: () => {
    publish(); return [{ role: 'user', content: 'Captured converted history.' }];
  } } : {});
  const configuration = test.context.configuration, before = configuration.current;
  const substrate = configuration.substrateRevision;
  publish = () => {
    const binding = configurationBinding(test.context);
    const config = { ...before.config, providerCredentials: { ...before.config.providerCredentials,
      anthropic: { ...before.config.providerCredentials.anthropic, apiKey: 'synthetic-replacement' } } };
    expect(configuration.publish(configuration.begin(binding), config, binding).status).toBe('applied');
    expect(configuration.current).not.toBe(before);
    expect(configuration.substrateRevision).toBe(substrate);
  };
  if (boundary === 'route') test.route.mockImplementation(() => {
    publish(); return { provider: 'anthropic', modelId: 'physical', state: 999 };
  });
  await expect(test.deps.summarizeAbandonedTurns!(test.manager.getSession(test.session.id)!.turns, test.signal))
    .resolves.toContain('Condensed routed history.');
  expect(test.route).toHaveBeenCalledOnce(); expect(test.requests.length).toBeGreaterThan(0);
  expect(test.requests.every(request => request.authorization === 'Bearer synthetic-route' && request.body.model === 'physical')).toBe(true);
  expect(test.store().initial[test.key]).toBe('7');
});

it.each(['manual', 'branch'] as const)('preserves selected effort when a %s summary route omits its override', async kind => {
  const test = await fixture(false, true, { effort: 'high', physical: { thinkingLevelMap: { high: 'strong' } } });
  if (kind === 'manual') expect(await test.deps.compactHistory!(test.session.id, test.signal)).toMatchObject({ status: 'compacted' });
  else expect(await test.deps.summarizeAbandonedTurns!(test.manager.getSession(test.session.id)!.turns, test.signal)).toContain('Condensed routed history.');
  expect(test.route).toHaveBeenCalledOnce();
  expect(test.route.mock.calls[0]![0].thinkingLevel).toBe('high');
  expect(test.requests.length).toBeGreaterThan(0);
  expect(test.requests.every(request => request.body.reasoning_effort === 'strong')).toBe(true);
  expect(test.store().initial[test.key]).toBe('7');
});

it('uses an explicit route effort override for a branch summary', async () => {
  const test = await fixture(false, true, { effort: 'high', physical: { thinkingLevelMap: { low: 'light', high: 'strong' } } });
  test.route.mockImplementation(() => ({ provider: 'anthropic', modelId: 'physical', thinkingLevel: 'low', state: 999 }));
  expect(await test.deps.summarizeAbandonedTurns!(test.manager.getSession(test.session.id)!.turns, test.signal)).toContain('Condensed routed history.');
  expect(test.requests).toHaveLength(1);
  expect(test.requests[0]!.body.reasoning_effort).toBe('light');
});

it.each([
  { effort: 'high' as const, physical: { reasoning: false }, routeEffort: undefined },
  { effort: 'high' as const, physical: { thinkingLevelMap: { high: null } }, routeEffort: undefined },
  { effort: undefined, physical: { reasoning: true }, routeEffort: 'max' as const },
])('refuses an unsupported direct summary effort before dispatch: %j', async ({ effort, physical, routeEffort }) => {
  const test = await fixture(false, true, { effort, physical });
  test.route.mockImplementation(() => ({ provider: 'anthropic', modelId: 'physical',
    ...(routeEffort ? { thinkingLevel: routeEffort } : {}), state: 999 }));
  await expect(test.deps.summarizeAbandonedTurns!(test.manager.getSession(test.session.id)!.turns, test.signal))
    .rejects.toThrow('does not support this reasoning effort');
  expect(test.route).toHaveBeenCalledOnce(); expect(test.requests).toEqual([]); expect(test.store().initial[test.key]).toBe('7');
});
