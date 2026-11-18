import http from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../../test-utils/advisor.js';
import { getRuntimeConfig } from '../../../config/runtimeConfig.js';
import { VirtualModelRegistry } from '../../../core/models/virtualModels.js';
import type { CatalogProvider } from '../../../core/models/catalog.js';
import type { HookDispatcher } from '../../../core/hooks/hookDispatcher.js';
import type { StepRequest } from '../../../turn/step.js';
import { createStepFunction } from '../../../turn/step.js';
import { runTurn } from '../../../turn/session.js';
import { buildCompactionWiring } from '../compaction.js';
import { createTurnContextPreparer } from '../../../turn/context/prepare.js';
import { generateCompaction } from '../../../session/compaction/generation.js';
import { summaryBudget } from '../../provider/summary/budget.js';
import type { PreparedTurnContext } from '../../../turn/context/contract.js';
import { turnCompaction } from '../../../turn/compaction.js';
import * as accountRenewal from '../../../core/auth/account/renewal.js';
import { assertAdmission } from '../../../core/network/admission.js';

const servers: http.Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
  cleanupAdvisorHarnesses();
});

async function wire() {
  const requests: { path: string; authorization?: string; body: Record<string, any> }[] = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push({ path: request.url!, authorization: request.headers.authorization, body });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: body.max_tokens === 32 ? 'done' : 'Saved work.' }, finish_reason: 'stop' }] }));
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Fixture address unavailable');
  return { requests, baseUrl: `http://127.0.0.1:${address.port}/v1` };
}

async function fixture(explicitSummary = false) {
  const setup = createAdvisorHarness(false, false);
  const original = await wire(), physical = await wire();
  const config = { ...getRuntimeConfig(setup.root), provider: 'openai' as const,
    providerConnections: [{ id: 'summary', provider: 'openai' as const, status: 'connected' as const, authType: 'api-key' as const,
      apiKey: 'synthetic-summary', model: 'summary', baseUrl: original.baseUrl, createdAt: '2026-11-15', updatedAt: '2026-11-15' }],
    activeProviderConnectionId: undefined, sessionConnection: undefined, accountPool: undefined,
    configScopes: undefined, allowedModels: undefined, contextWindow: 20_000, maxOutputTokens: 32,
    reserveTokens: 0, keepRecentTokens: 10, compactionEnabled: true, retryEnabled: false,
    providerConnectTimeoutMs: 3000, providerHeadersTimeoutMs: 3000, providerBodyTimeoutMs: 3000,
    providerCredentials: {
      openai: { apiKey: 'synthetic-original', baseUrl: original.baseUrl, model: 'automatic' },
      anthropic: { apiKey: 'synthetic-physical', baseUrl: physical.baseUrl, model: 'physical' },
    }, sessionModelRoles: explicitSummary ? { summary: { provider: 'openai' as const, model: 'summary', connectionId: 'summary' } } : undefined,
  };
  const catalog: readonly CatalogProvider[] = [
    { id: 'openai', runtime: 'openai', baseUrl: original.baseUrl, endpoint: 'openai-compatible', models: [
      { id: 'automatic', contextWindow: 20_000, maxTokens: 2048 }, { id: 'summary', contextWindow: 8000, maxTokens: 256 }] },
    { id: 'anthropic', runtime: 'anthropic', baseUrl: physical.baseUrl, endpoint: 'openai-compatible',
      models: [{ id: 'physical', contextWindow: 5000, maxTokens: 512 }] },
  ];
  const provider = { provider: 'openai', model: 'automatic', baseUrl: original.baseUrl,
    endpoint: 'openai-compatible', headers: { authorization: 'Bearer synthetic-original' } };
  const target = { provider: { provider: 'anthropic', model: 'physical', baseUrl: physical.baseUrl,
    endpoint: 'openai-compatible', headers: { authorization: 'Bearer synthetic-physical' },
    credentialId: 'target', credentialGeneration: 'generation' }, maxOutputTokens: 32, reserveTokens: 0,
    fetchImpl: fetch, isCurrent: vi.fn(() => true), modelTransport: vi.fn(async (url: RequestInfo | URL, init: RequestInit,
      beforeDispatch: () => void) => { beforeDispatch(); return fetch(url, init); }) };
  const registry = new VirtualModelRegistry(); const route = vi.fn(() => ({ provider: 'anthropic', modelId: 'physical' }));
  registry.register({ provider: 'openai', id: 'automatic', name: 'Automatic', route });
  const request: StepRequest = { provider, catalog, virtualModels: registry, resolveTarget: async () => target,
    sessionId: setup.session.id, workspaceRoot: setup.root, tools: [], maxOutputTokens: 32,
    systemPrompt: 'System '.repeat(1200), fetchImpl: fetch };
  const wireInput = { provider: { ...provider, providerId: provider.provider }, runtimeConfig: config,
    sessionId: setup.session.id, workspaceRoot: setup.root, catalog };
  const history = Array.from({ length: 5 }, (_, index) => [
    { role: 'user' as const, content: `Question ${index}: ${'x'.repeat(1200)}` },
    { role: 'assistant' as const, content: `Answer ${index}: ${'y'.repeat(1200)}` },
  ]).flat();
  const onCompact = vi.fn(), onDeclined = vi.fn();
  const execute = async (wiring = buildCompactionWiring(wireInput), overrides: Partial<StepRequest> = {}) => {
    const run = runTurn({ sessionId: setup.session.id, workspaceRoot: setup.root, prompt: 'Continue.', history,
      signal: setup.signal, onMessage: () => {}, hooks: { dispatch: async () => ({ decision: 'allow', stopChecks: [] }) } as unknown as HookDispatcher,
      maxSteps: 3, tools: new Map(), retry: { enabled: false }, step: createStepFunction({ ...request, ...overrides }),
      compaction: { ...wiring, onCompact, onDeclined } });
    for await (const _event of run.events) { /* Exercise the production preparation and summary owners. */ }
  };
  return { setup, original, physical, config, catalog, request, target, route, wireInput, history, onCompact, onDeclined, execute };
}

it('keeps the captured explicit cache preference for physical history, prefix and merge summaries', async () => {
  const test = await fixture();
  const catalog = test.catalog.map(provider => ({ ...provider, models: provider.models.map(model => ({ ...model,
    compat: { promptCacheKey: true, supportsLongCacheRetention: true } })) }));
  const request = { ...test.request, catalog, cacheRetention: 'long' as 'short' | 'long' | 'none' };
  const prepared = await capture(request);
  const wiring = buildCompactionWiring({ ...test.wireInput, catalog, runtimeConfig: { ...test.config, cacheRetention: 'none' } });
  const bound = wiring.forRequest(prepared, () => undefined);
  expect(await generateCompaction({ history: test.history, prefix: [{ role: 'user', content: 'Opening context.' }],
    summarize: bound.summarize, summarizeTurnPrefix: bound.summarizeTurnPrefix,
    maxTokens: bound.policy.segmentTokens, maxMergeTokens: bound.policy.mergeTokens })).toContain('Saved work.');
  expect(test.original.requests).toHaveLength(0);
  expect(test.physical.requests.length).toBeGreaterThan(3);
  for (const request of test.physical.requests) expect(request.body).toMatchObject({ prompt_cache_key: expect.any(String), prompt_cache_retention: '24h' });
  expect(new Set(test.physical.requests.map(request => request.body.prompt_cache_key)).size).toBe(1);
  expect(test.route).toHaveBeenCalledOnce();
});

it('sends automatic fallback summaries only through the captured physical transport', async () => {
  const test = await fixture(); await test.execute();
  expect(test.onCompact).toHaveBeenCalledOnce();
  expect(test.original.requests).toEqual([]);
  expect(test.physical.requests.length).toBeGreaterThan(1);
  expect(test.target.modelTransport).toHaveBeenCalledTimes(test.physical.requests.length);
  expect(test.physical.requests.every(request => request.authorization === 'Bearer synthetic-physical' && request.body.model === 'physical')).toBe(true);
  expect(test.physical.requests.some(request => request.body.max_tokens === 512)).toBe(true);
  expect(test.physical.requests.at(-1)!.body.max_tokens).toBe(32);
  expect(test.route).toHaveBeenCalledOnce();
});

it('binds overflow recovery summaries to the refused physical request without routing a second time', async () => {
  const test = await fixture(); let first = true;
  const transport = test.target.modelTransport.getMockImplementation()!;
  test.target.modelTransport.mockImplementation(async (url, init, dispatch) => {
    if (first) { first = false; dispatch(); return new Response('maximum context length exceeded', { status: 400 }); }
    return transport(url, init, dispatch);
  });
  await test.execute(buildCompactionWiring(test.wireInput), { systemPrompt: '' });
  expect(test.onCompact).toHaveBeenCalledOnce(); expect(test.original.requests).toEqual([]);
  expect(test.physical.requests.some(request => request.body.max_tokens === 512)).toBe(true);
  expect(test.physical.requests.at(-1)!.body.max_tokens).toBe(32); expect(test.route).toHaveBeenCalledOnce();
});

it('keeps the explicit summary role while the foreground remains on its physical route', async () => {
  const test = await fixture(true); await test.execute();
  expect(test.onCompact).toHaveBeenCalledOnce();
  expect(test.original.requests.length).toBeGreaterThan(0);
  expect(test.original.requests.every(request => request.body.model === 'summary' && request.body.max_tokens === 256)).toBe(true);
  expect(test.physical.requests).toHaveLength(1); expect(test.physical.requests[0]!.body.model).toBe('physical');
  expect(test.route).toHaveBeenCalledOnce();
});

it('rejects a fallback summary if conversion withdraws the captured physical target', async () => {
  const test = await fixture();
  const wiring = buildCompactionWiring({ ...test.wireInput, convertToLlm: async messages => {
    test.target.isCurrent.mockReturnValue(false); return messages;
  } });
  await test.execute(wiring);
  expect(test.onCompact).not.toHaveBeenCalled();
  expect(test.original.requests).toEqual([]); expect(test.physical.requests).toEqual([]);
});

it('refuses a prepared summary when its physical transport withdraws admission before handoff', async () => {
  const test = await fixture();
  test.target.modelTransport.mockImplementation(async (_url, _init, dispatch) => {
    test.target.isCurrent.mockReturnValue(false); dispatch(); throw new Error('No dispatch after withdrawal');
  });
  await test.execute();
  expect(test.onCompact).not.toHaveBeenCalled();
  expect(test.original.requests).toEqual([]); expect(test.physical.requests).toEqual([]);
});

async function capture(request: StepRequest): Promise<PreparedTurnContext> {
  return createTurnContextPreparer(request, { allowTools: false }, {
    explicitEffort: false, effortAccepted: () => true, streamAttempts: () => 0, replayBinding: 'original',
  })([{ role: 'user', content: 'Continue.' }]);
}

it('uses physical summary limits for segmented history, prefix and merge requests', async () => {
  const test = await fixture(); const prepared = await capture(test.request);
  const wiring = buildCompactionWiring(test.wireInput), bound = wiring.forRequest(prepared, () => undefined);
  const budget = summaryBudget({ contextWindow: 5000, maxOutputCeiling: 512, reserveTokens: 0, providerOwnedOutput: false });
  expect(bound.policy.summaryIdentity).not.toBe(wiring.policy.summaryIdentity);
  expect(bound.policy.segmentTokens).toBe(budget.segmentTokens); expect(bound.policy.mergeTokens).toBe(budget.mergeTokens);
  expect(await generateCompaction({ history: test.history, prefix: [{ role: 'user', content: 'Opening context.' }],
    summarize: bound.summarize, summarizeTurnPrefix: bound.summarizeTurnPrefix,
    maxTokens: bound.policy.segmentTokens, maxMergeTokens: bound.policy.mergeTokens })).toContain('Saved work.');
  expect(test.original.requests).toHaveLength(0);
  expect(test.physical.requests.length).toBeGreaterThan(3);
  expect(test.physical.requests.every(value => value.body.max_tokens === 512 && value.body.model === 'physical')).toBe(true);
  expect(test.physical.requests.some(value => JSON.stringify(value.body).includes('Opening context.'))).toBe(true);
  expect(test.physical.requests.some(value => value.body.messages.filter((message: { content?: string }) => message.content?.includes('Saved work.')).length >= 2)).toBe(true);
  expect(test.target.modelTransport).toHaveBeenCalledTimes(test.physical.requests.length); expect(test.route).toHaveBeenCalledOnce();
});

it.each([false, true])('rejects a prepared summary after request history retires with explicit role %s', async explicit => {
  const test = await fixture(explicit); const prepared = await capture(test.request);
  let current = true;
  const bound = buildCompactionWiring(test.wireInput).forRequest(prepared, () => current ? undefined : 'History changed.');
  const summary = await bound.summarize.prepare!({ messages: [{ role: 'user', content: 'Summarize.' }] });
  current = false;
  expect(() => summary.send()).toThrow('History changed.');
  expect(test.original.requests).toEqual([]); expect(test.physical.requests).toEqual([]);
});

it('keeps the refusal owner when consecutive physical requests receive separate summary bindings', async () => {
  const test = await fixture();
  const wiring = buildCompactionWiring({ ...test.wireInput, runtimeConfig: { ...test.config, keepRecentTokens: 100_000 } });
  const compaction = turnCompaction({ setup: { ...wiring, onCompact: test.onCompact, onDeclined: test.onDeclined },
    sessionId: test.setup.session.id, workspaceRoot: test.setup.root, maxSteps: 3, hasTools: false, prepared: true,
    hooks: { dispatch: async () => ({ decision: 'allow', stopChecks: [] }) } as unknown as HookDispatcher });
  const prepared = await capture({ ...test.request, systemPrompt: 'System '.repeat(3500) });
  const context = { eligible: true, isCurrent: () => true, accept: () => true };
  await compaction.prepareContext(prepared, test.setup.signal, context);
  await compaction.prepareContext(prepared, test.setup.signal, context);
  expect(test.onDeclined).toHaveBeenCalledOnce(); expect(test.onCompact).not.toHaveBeenCalled();
  expect(test.original.requests).toEqual([]); expect(test.physical.requests).toEqual([]);
});

it('passes the physical request admission to explicit summary renewal before it may dispatch', async () => {
  const test = await fixture(true), prepared = await capture(test.request);
  let admitted = false;
  vi.spyOn(accountRenewal, 'renewStoredAccount').mockImplementation(async input => {
    test.target.isCurrent.mockReturnValue(false);
    assertAdmission(input.admission); admitted = true;
    return { stored: false, writeState: 'unchanged' };
  });
  const bound = buildCompactionWiring(test.wireInput).forRequest(prepared, () => undefined);
  await expect(bound.summarize.prepare!({ messages: [{ role: 'user', content: 'Summarize.' }] })).rejects.toThrow();
  expect(admitted).toBe(false);
  expect(test.original.requests).toEqual([]); expect(test.physical.requests).toEqual([]);
});

it('shares a successful role renewal with a successor after its first request retires', async () => {
  const test = await fixture(true), prepared = await capture(test.request);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const renew = vi.spyOn(accountRenewal, 'renewStoredAccount').mockImplementation(async input => {
    assertAdmission(input.admission); entered(); await gate;
    return { stored: false, writeState: 'unchanged' };
  });
  const wiring = buildCompactionWiring(test.wireInput);
  let current = true;
  const first = wiring.forRequest(prepared, () => current ? undefined : 'History retired.');
  const pending = first.summarize.prepare!({ messages: [{ role: 'user', content: 'First history.' }] });
  const refused = expect(pending).rejects.toThrow('History retired.');
  await started; current = false; release(); await refused;
  const next = wiring.forRequest(await capture(test.request), () => undefined);
  await expect(next.summarize({ messages: [{ role: 'user', content: 'Current history.' }] })).resolves.toContain('Saved work.');
  expect(renew).toHaveBeenCalledOnce(); expect(test.original.requests).toHaveLength(1);
  expect(test.physical.requests).toEqual([]);
});
