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

it.each(['blocked', 'catalogue'] as const)('refuses a %s endpoint override before side-question HTTP', async source => {
  vi.mocked(resolveProviderCredential).mockReturnValue(source === 'blocked'
    ? { provider: 'openai', expectedEnvVarName: 'OPENAI_API_KEY', blocked: 'connection-overridden' }
    : { provider: 'openai', expectedEnvVarName: 'OPENAI_API_KEY',
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
  recordSessionUsage(setup.session.id, { provider: 'main', model: 'm', promptTokens: 400, promptMessageCount: 2 });
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
    lastBucketKey: foreground.lastBucketKey, recentRequests: foreground.recentRequests });
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
