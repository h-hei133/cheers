import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runBtwCommand } from "./btwCommandRuntime.js";
import { loadCatalog } from "../models/catalogStore.js";
import { providerFetchForEndpoint } from "../../provider/request/fetch.js";
import { resolveProviderCredential } from "../shell/providerCredentials.js";
import { routeSlashCommand } from "./slashRouter.js";
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { getSessionUsage, recordSessionUsage, resetSessionUsage } from '../../observability/usageTelemetry.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { costModel } from './cost/model.js';
import { sessionUsageSink } from '../../session/store/usage.js';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CatalogProvider } from '../models/catalog.js';

vi.mock("../../config/runtimeConfig.js", async () => ({
  ...await vi.importActual<typeof import('../../config/runtimeConfig.js')>('../../config/runtimeConfig.js'),
  getRuntimeConfig: () => ({}),
}));
vi.mock("../shell/providerCredentials.js", async () => ({ ...await vi.importActual<typeof import('../shell/providerCredentials.js')>('../shell/providerCredentials.js'), resolveProviderCredential: vi.fn(() => ({
  provider: "fixture", model: "m", baseUrl: "https://provider.test",
  credential: { apiKey: "synthetic" },
})) }));
vi.mock("../models/catalogStore.js", () => ({ loadCatalog: vi.fn() }));
vi.mock("../../provider/request/fetch.js", () => ({ providerFetchForEndpoint: vi.fn() }));
beforeEach(() => {
  vi.mocked(resolveProviderCredential).mockReturnValue({
    provider: "fixture", model: "m", baseUrl: "https://provider.test", credential: { apiKey: "synthetic" },
  } as never);
  vi.mocked(loadCatalog).mockReturnValue([{ id: "fixture", name: "Fixture", endpoint: "openai-compatible", models: [{ id: "m", name: "Model" }] }] as never);
});
afterEach(() => { cleanupAdvisorHarnesses(); vi.clearAllMocks(); vi.useRealTimers(); });

it.each(['long', 'none'] as const)('applies the captured %s cache preference to a real side-command HTTP request', async cacheRetention => {
  const setup = createAdvisorHarness(false, false);
  const requests: { body: Record<string, unknown>; affinity?: string }[] = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({ body: JSON.parse(Buffer.concat(chunks).toString('utf8')), affinity: request.headers['x-affinity'] as string | undefined });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content: 'Side answer' }, finish_reason: 'stop' }] }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
    const runtimeConfig = { cacheRetention } as never;
    const catalog: CatalogProvider[] = [{ id: 'fixture', label: 'Side fixture', runtime: 'openai-compatible', auth: 'api-key', baseUrl,
      endpoint: 'openai-compatible', models: [{ id: 'm', compat: { promptCacheKey: true,
        supportsLongCacheRetention: true, supportsExplicitPromptCacheMode: true } }] }];
    vi.mocked(resolveProviderCredential).mockReturnValue({ provider: 'fixture', model: 'm', baseUrl,
      credential: { apiKey: 'synthetic-side-cache' } } as never);
    vi.mocked(loadCatalog).mockReturnValue(catalog);
    vi.mocked(providerFetchForEndpoint).mockReturnValue(fetch);
    const before = structuredClone(setup.manager.getSession(setup.session.id)!.turns);
    const result = await runBtwCommand(['question'], { cwd: setup.root, projectRoot: setup.root, sessionId: setup.session.id, runtimeConfig });
    expect(result.output).toContain('Side answer');
    expect(requests).toHaveLength(1);
    if (cacheRetention === 'none') {
      expect(requests[0]!.body).not.toHaveProperty('prompt_cache_key');
      expect(requests[0]!.body).not.toHaveProperty('prompt_cache_options');
    } else expect(requests[0]!.body).toMatchObject({ prompt_cache_key: expect.any(String), prompt_cache_retention: '24h' });
    expect(setup.manager.getSession(setup.session.id)!.turns).toEqual(before);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

it('reports local byte admission refusal without inventing a provider failure or dispatching', async () => {
  vi.mocked(loadCatalog).mockReturnValue([{ id: 'fixture', label: 'Fixture', runtime: 'openai-compatible', auth: 'api-key',
    models: [{ id: 'm', inputLimits: { maxRequestBytes: 1 } }] }]);
  const fetchImpl = vi.fn(async () => Response.json({ choices: [{ message: { content: 'should not send' } }] })) as unknown as typeof fetch;
  vi.mocked(providerFetchForEndpoint).mockReturnValue(fetchImpl);
  const result = await runBtwCommand(['question'], { cwd: '/synthetic' });
  expect(result.output).toContain('byte limit'); expect(result.output).not.toContain('Failure:');
  expect(fetchImpl).not.toHaveBeenCalled();
});

it.each(['blocked', 'catalogue'] as const)('refuses a %s endpoint override before side-question HTTP', async source => {
  vi.mocked(resolveProviderCredential).mockReturnValue(source === 'blocked'
    ? { provider: 'openai', baseUrl: 'https://foreign.invalid/v1', expectedEnvVarName: 'OPENAI_API_KEY', blocked: 'connection-overridden' }
    : { provider: 'openai', baseUrl: 'https://foreign.invalid/v1', expectedEnvVarName: 'OPENAI_API_KEY',
        credential: { provider: 'openai', source: 'config', authMode: 'account-auth', envVarName: 'OPENAI_API_KEY',
          accountAuth: { type: 'openai-chatgpt-account', accessToken: 'synthetic', refreshToken: 'synthetic', expiresAt: 1 } } });
  vi.mocked(loadCatalog).mockReturnValue([{ id: 'openai', runtime: 'openai', label: 'Foreign', auth: 'oauth', baseUrl: 'https://foreign.invalid/v1', models: [] }]);
  const result = await runBtwCommand(['question'], { cwd: '/synthetic' });
  expect(result.output).toContain('Side question refused');
  expect(result.output).not.toContain('synthetic');
  expect(providerFetchForEndpoint).not.toHaveBeenCalled();
});

it.each(['stop', 'content_filter', 'empty'])('persists side-question fees for a %s response without changing main context or history', async finish => {
  const setup = createAdvisorHarness(false, false);
  const prices = { promptPerMTok: 3, completionPerMTok: 6 };
  vi.mocked(loadCatalog).mockReturnValue([{ id: 'fixture', models: [{ id: 'm', cost: prices }] }] as never);
  const identity = { provider: 'main', model: 'm', endpoint: 'openai-compatible' };
  recordSessionUsage(setup.session.id, { provider: 'main', model: 'm', promptTokens: 400, promptMessageCount: 2,
    promptIdentity: identity });
  expect(getSessionUsage(setup.session.id).lastPromptTokens).toBe(400);
  const foreground = structuredClone(getSessionUsage(setup.session.id));
  const turns = structuredClone(setup.manager.getSession(setup.session.id)!.turns);
  vi.mocked(providerFetchForEndpoint).mockReturnValue((async () => {
    prices.promptPerMTok = 99;
    return Response.json({ choices: [{ message: { content: finish === 'empty' ? '' : 'answer' }, finish_reason: finish === 'content_filter' ? finish : 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 2, total_tokens: 102 } });
  }) as typeof fetch);
  const result = await runBtwCommand(['question'], { cwd: setup.root, projectRoot: setup.root, sessionId: setup.session.id,
    recordAuxiliaryUsage: sessionUsageSink(setup.session.id) });
  expect(result.report?.facts?.delivered).toBe(finish === 'stop');
  const saved = readBoundSessionState(setup.manager, setup.session).state.usage!;
  expect(Object.values(saved.byModel).find(bucket => bucket.attribution)).toMatchObject({
    promptTokens: 100, completionTokens: 2, attribution: { rates: { promptPerMTok: 3 } },
  });
  expect(costModel(getSessionUsage(setup.session.id), []).buckets.find(bucket => bucket.attribution)?.estimate.usd).toBeCloseTo(0.000312);
  expect(getSessionUsage(setup.session.id)).toMatchObject({ lastPromptTokens: 400, lastPromptMessageCount: 2,
    lastPromptIdentity: identity, lastBucketKey: foreground.lastBucketKey, recentRequests: foreground.recentRequests });
  expect(setup.manager.getSession(setup.session.id)!.turns).toEqual(turns);
  resetSessionUsage(setup.session.id);
});

it.each([true, false, undefined])("uses catalog temperature capability %s for side questions", async (supportsTemperature) => {
  vi.mocked(loadCatalog).mockReturnValue([{ id: "fixture", name: "Fixture", endpoint: "google-generative-ai", models: [
    { id: "m", name: "Model", compat: { supportsTemperature } },
  ] }] as never);
  const bodies: Record<string, unknown>[] = [];
  vi.mocked(providerFetchForEndpoint).mockReturnValue((async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "answer" }] } }] }), { status: 200 });
  }) as typeof fetch);
  const result = await runBtwCommand(["question"], { cwd: "/synthetic" });
  expect(result.output).toContain("answer");
  expect(bodies).toHaveLength(1);
  if (supportsTemperature === false) expect(bodies[0]?.generationConfig).not.toHaveProperty("temperature");
  else expect(bodies[0]?.generationConfig).toHaveProperty("temperature", 0);
});

it.each([
  ["network", "provider_network"],
  ["refusal", "provider_safety_block"],
  ["http", "provider_endpoint"],
  ["empty", "provider_output_insufficient"],
  ["malformed", "provider_response_malformed"],
])("reports %s failures without displaying response details", async (scenario, classification) => {
  vi.mocked(providerFetchForEndpoint).mockReturnValue((async () => {
    if (scenario === "network") throw new TypeError("fetch failed: private-provider-detail");
    if (scenario === "http") return new Response("private-provider-detail", { status: 400 });
    if (scenario === "malformed") return new Response("{private-provider-detail", { status: 200 });
    return Response.json({ choices: [{ message: { content: "" }, finish_reason: scenario === "refusal" ? "content_filter" : "stop" }] });
  }) as typeof fetch);
  const result = await runBtwCommand(["question"], { cwd: "/synthetic" });
  expect(result.output).toContain(`Failure: ${classification}`);
  expect(result.output).not.toContain("private-provider-detail");
  expect(result.output).not.toContain("was answered");
  expect(result.output).not.toContain("No provider credential");
});

it("reports its own deadline as a timeout and releases the timer", async () => {
  vi.useFakeTimers();
  vi.mocked(providerFetchForEndpoint).mockReturnValue((async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  })) as typeof fetch);
  const pending = runBtwCommand(["question"], { cwd: "/synthetic" });
  await vi.advanceTimersByTimeAsync(15_000);
  expect((await pending).output).toContain("Failure: provider_timeout");
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps the missing-credential explanation and sends nothing", async () => {
  vi.mocked(resolveProviderCredential).mockReturnValue({ provider: "fixture" } as never);
  const result = await runBtwCommand(["question"], { cwd: "/synthetic" });
  expect(result.output).toContain("No provider credential is configured, so nothing was sent.");
  expect(result.output).not.toContain("Failure:");
  expect(providerFetchForEndpoint).not.toHaveBeenCalled();
});

it("sends the literal side question without decoding quotes, whitespace or escapes", async () => {
  const requests: Record<string, unknown>[] = [];
  vi.mocked(providerFetchForEndpoint).mockReturnValue((async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ choices: [{ message: { content: "answer" }, finish_reason: "stop" }] });
  }) as typeof fetch);
  const question = "  why 'a  b' in C:\\tmp\\file?\n\t--show-literal\\  ";
  await routeSlashCommand("/side " + question, { cwd: "/synthetic", skillOptions: { noSkills: true } });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.messages).toEqual(expect.arrayContaining([{ role: "user", content: question }]));
});

it.each(["", "  \t\n"])("rejects an empty side question before resolving credentials: %j", async (rawCommandArgs) => {
  const result = await runBtwCommand([], { cwd: "/synthetic", rawCommandArgs });
  expect(result.output).toContain("Usage: /btw <question>");
  expect(resolveProviderCredential).not.toHaveBeenCalled();
  expect(providerFetchForEndpoint).not.toHaveBeenCalled();
});

async function sideQuestionServer(replies: unknown[], beforeReply?: () => Promise<void>) {
  const requests: string[] = [];
  const server = http.createServer(async (request, response) => {
    for await (const _chunk of request) { /* Consume the actual side question. */ }
    requests.push(request.url!);
    await beforeReply?.();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(replies.shift()));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, requests, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

it.each(['openai-compatible', 'anthropic-messages', 'copilot-messages'])(
  'captures side-question prices at N/N+1 including cache through %s', async endpoint => {
    vi.stubEnv('CHEERS_TEST_ROOT', '/tmp/cheers-test');
    const setup = createAdvisorHarness(false, false);
    const rates = { promptPerMTok: 1, completionPerMTok: 2, cacheReadPerMTok: 0.1, cacheWritePerMTok: 1.25,
      tiers: [{ inputTokensAbove: 100, promptPerMTok: 5, completionPerMTok: 10, cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25 }] };
    const inclusive = endpoint === 'openai-compatible';
    const replies = [40, 41].map(ordinary => inclusive
      ? { choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: ordinary + 60, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 60 } } }
      : { content: [{ type: 'text', text: 'answer' }], stop_reason: 'end_turn',
        usage: { input_tokens: ordinary, output_tokens: 2, cache_read_input_tokens: 40, cache_creation_input_tokens: 20 } });
    const fixture = await sideQuestionServer(replies);
    const catalog: CatalogProvider[] = [{ id: 'fixture', label: 'Fixture', runtime: 'openai-compatible', auth: 'api-key',
      endpoint, baseUrl: fixture.baseUrl, models: [{ id: 'm', cost: rates }] }];
    vi.mocked(loadCatalog).mockReturnValue(catalog);
    vi.mocked(resolveProviderCredential).mockReturnValue({ provider: 'fixture', model: 'm', baseUrl: fixture.baseUrl,
      credential: { apiKey: 'synthetic' } } as never);
    vi.mocked(providerFetchForEndpoint).mockReturnValue(fetch);
    const recordAuxiliaryUsage = sessionUsageSink(setup.session.id);
    try {
      for (const question of ['first', 'second']) {
        expect((await runBtwCommand([question], { cwd: setup.root, projectRoot: setup.root, sessionId: setup.session.id,
          recordAuxiliaryUsage })).report?.facts?.delivered).toBe(true);
      }
      expect(fixture.requests).toHaveLength(2);
      const report = costModel(getSessionUsage(setup.session.id), []);
      expect(report.recordedTurns).toBe(2);
      expect(report.buckets).toHaveLength(2);
      expect(report.buckets.find(bucket => bucket.rates.promptPerMTok === 1)).toMatchObject({ rateBasis: 'captured', turnsCount: 1,
        promptTokens: 40, completionTokens: 2, cacheReadTokens: inclusive ? 60 : 40, cacheWriteTokens: inclusive ? 0 : 20,
        rates: { promptPerMTok: 1, completionPerMTok: 2, cacheReadPerMTok: 0.1, cacheWritePerMTok: 1.25 } });
      expect(report.buckets.find(bucket => bucket.rates.promptPerMTok === 5)).toMatchObject({ rateBasis: 'captured', turnsCount: 1,
        promptTokens: 41, completionTokens: 2, cacheReadTokens: inclusive ? 60 : 40, cacheWriteTokens: inclusive ? 0 : 20,
        rates: { promptPerMTok: 5, completionPerMTok: 10, cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25 } });
      expect(report.estimate.usd).toBeCloseTo(inclusive ? 0.000305 : 0.000443, 10);
      expect(readBoundSessionState(setup.manager, setup.session).state.usage!.byModel).toEqual(getSessionUsage(setup.session.id).byModel);
      expect(getSessionUsage(setup.session.id).recentRequests).toEqual([]);
    } finally {
      resetSessionUsage(setup.session.id);
      fixture.server.closeAllConnections();
      await new Promise<void>(resolve => fixture.server.close(() => resolve()));
    }
  },
);

it('uses side-question tier thresholds and inherited rates captured before the HTTP request when the schedule changes', async () => {
  vi.stubEnv('CHEERS_TEST_ROOT', '/tmp/cheers-test');
  const setup = createAdvisorHarness(false, false);
  const tier = { inputTokensAbove: 100, promptPerMTok: 9, cacheReadPerMTok: 0.9 };
  const rates = { promptPerMTok: 3, completionPerMTok: 6, cacheReadPerMTok: 0.3, cacheWritePerMTok: 3.75, tiers: [tier] };
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const fixture = await sideQuestionServer([{ choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 101, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 60 } } }], () => held);
  vi.mocked(loadCatalog).mockReturnValue([{ id: 'fixture', label: 'Fixture', runtime: 'openai-compatible', auth: 'api-key',
    endpoint: 'openai-compatible', baseUrl: fixture.baseUrl, models: [{ id: 'm', cost: rates }] }]);
  vi.mocked(resolveProviderCredential).mockReturnValue({ provider: 'fixture', model: 'm', baseUrl: fixture.baseUrl,
    credential: { apiKey: 'synthetic' } } as never);
  vi.mocked(providerFetchForEndpoint).mockReturnValue(fetch);
  const pending = runBtwCommand(['question'], { cwd: setup.root, projectRoot: setup.root, sessionId: setup.session.id,
    recordAuxiliaryUsage: sessionUsageSink(setup.session.id) });
  try {
    try {
      await vi.waitFor(() => expect(fixture.requests).toHaveLength(1), { timeout: 1500, interval: 10 });
      tier.inputTokensAbove = 1000; tier.promptPerMTok = 99; tier.cacheReadPerMTok = 9.9;
      rates.completionPerMTok = 60; rates.cacheWritePerMTok = 37.5;
    } finally { release(); }
    expect((await pending).report?.facts?.delivered).toBe(true);
    const report = costModel(getSessionUsage(setup.session.id), []);
    expect(report.buckets).toHaveLength(1);
    expect(report.buckets[0]).toMatchObject({ rateBasis: 'captured', turnsCount: 1,
      rates: { promptPerMTok: 9, completionPerMTok: 6, cacheReadPerMTok: 0.9, cacheWritePerMTok: 3.75 } });
    expect(report.estimate.usd).toBeCloseTo(0.000435, 10);
    expect(readBoundSessionState(setup.manager, setup.session).state.usage?.turnsCount).toBe(1);
  } finally {
    release(); await pending.catch(() => undefined);
    resetSessionUsage(setup.session.id);
    fixture.server.closeAllConnections();
    await new Promise<void>(resolve => fixture.server.close(() => resolve()));
  }
});
