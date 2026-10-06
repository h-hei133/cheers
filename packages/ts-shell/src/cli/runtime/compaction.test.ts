import { ConfigState } from "../../config/state.js";
import { configurationBinding } from "../../core/shell/configuration.js";
import type { CliRuntimeInvocationInput } from "../../entrypoints/cliRuntimeInvocation.js";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCliSessionRuntime } from "./cliSessionRuntimeFactory.js";
import { runBtwCommand } from "../../core/commands/btwCommandRuntime.js";
import { declareEndpoint, endpointShape } from "../../provider/endpoints/index.js";
import type { SessionRuntimeDependencies } from "../../core/shell/sessionRuntime.js";
import type { CompactionSetup } from "../../turn/session.js";
import type { RequestSigner } from "../../provider/request/fetch.js";
import { createCacheWarmingRunner } from "../../turn/cacheWarm.js";
import { loadCatalog } from '../../core/models/catalogStore.js';

const fixture = vi.hoisted(() => ({
  deps: undefined as SessionRuntimeDependencies | undefined,
  compaction: undefined as CompactionSetup | undefined,
  invocation: undefined as CliRuntimeInvocationInput | undefined,
  configuration: undefined as ConfigState | undefined,
  resolution: {} as Record<string, unknown>,
  config: { providerConnectTimeoutMs: 1000, providerHeadersTimeoutMs: 1000, providerBodyTimeoutMs: 1000, offline: true },
}));
vi.mock("../../config/runtimeConfig.js", () => ({ getRuntimeConfig: () => fixture.config }));
vi.mock("../../core/shell/providerCredentials.js", () => ({ resolveProviderCredential: () => fixture.resolution }));
vi.mock("../../core/models/catalogStore.js", () => ({ loadCatalog: () => [{
  id: "fixture", endpoint: "test-signed-summary", models: [{ id: "fixture-model", contextWindow: 10000,
    promptCache: { short: 300 }, cost: { promptPerMTok: 10, cacheReadPerMTok: 1, completionPerMTok: 1 },
  }],
}] }));
vi.mock("../../turn/cacheWarm.js", () => ({ createCacheWarmingRunner: vi.fn(() => ({ stop: vi.fn() })) }));
vi.mock("../../memory/projectMemoryLocalStore.js", () => ({ createProjectMemoryLocalStore: () => ({}) }));
vi.mock("../../core/shell/sessionRuntime.js", () => ({ ShellSessionRuntime: class {
  constructor(deps: SessionRuntimeDependencies) { fixture.deps = deps; }
  getPermissionScope() { return "ask"; }
  getAgentMode() { return "plan"; }
} }));
vi.mock("../approval/cliApprovalEscalationBridge.js", () => ({ createCliApprovalEscalationBridge: () => vi.fn() }));
vi.mock("./cliRuntimeInvocationBridge.js", () => ({ streamCliRuntimePrompt: (input: CliRuntimeInvocationInput) => {
  fixture.invocation = input;
  fixture.compaction = input.prepareProviderResources?.(input.providerCredentialResolution).compaction ?? input.compaction;
  return { events: [] };
} }));
vi.mock("../../core/shell/compaction.js", () => ({ compactSessionHistory: async (input: {
  summarize: (request: { messages: []; signal: AbortSignal }) => Promise<string | undefined>;
  summarizeTurnPrefix: (messages: [], signal: AbortSignal) => Promise<string | undefined>;
  signal: AbortSignal;
}) => {
  await input.summarize({ messages: [], signal: input.signal });
  await input.summarizeTurnPrefix([], input.signal);
  return { status: "compacted" };
} }));

let server: http.Server;
let baseUrl: string;
let signed: Parameters<RequestSigner>[0][];
let received: { path: string; body: unknown; signature?: string; accept?: string }[];
beforeEach(async () => {
  signed = [];
  received = [];
  fixture.compaction = undefined;
  fixture.config.offline = true;
  vi.mocked(createCacheWarmingRunner).mockClear();
  declareEndpoint("test-signed-summary", {
    ...endpointShape("bedrock-converse-stream"),
    signer: async () => request => {
      signed.push(request);
      return { "x-test-signature": `signed-${signed.length}` };
    },
  });
  server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({ path: request.url!, body: JSON.parse(Buffer.concat(chunks).toString()),
      signature: request.headers["x-test-signature"] as string | undefined, accept: request.headers.accept });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ output: { message: { content: [{ text: "SUMMARY_ANSWER" }] } }, stopReason: "end_turn", usage: { inputTokens: 20, outputTokens: 1, cacheReadInputTokens: 80, totalTokens: 101 } }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

function runtime(withKey: boolean) {
  fixture.resolution = { provider: "fixture", model: "fixture-model", baseUrl,
    ...(withKey ? { credential: { apiKey: "synthetic", model: "fixture-model", baseUrl } } : {}),
  };
  const context = { cwd: process.cwd(), projectRoot: process.cwd(), session: { id: "signed-summary" },
    runtimeConfig: structuredClone({ ...fixture.config, configProvenance: {}, configValidation: { valid: true, securityBlocked: false }, configDiagnostics: [] }) };
  const configuration = new ConfigState(context.runtimeConfig as never, configurationBinding(context), loadCatalog());
  fixture.configuration = configuration;
  createCliSessionRuntime({
    runtimeContext: { ...context, configuration },
    providerRuntimeBridge: { resolveCredentialSnapshot: () => fixture.resolution },
    sessionManager: { getSession: () => ({ turns: [] }) },
    renderer: {}, options: {}, approvalTrustPolicy: {}, approvalModeState: { get: () => undefined }, getReadline: () => null,
  } as never);
  return fixture.deps!;
}

it.each([true, false])("signs side questions with final JSON URL/body (apiKey=%s)", async withKey => {
  runtime(withKey);
  const result = await runBtwCommand(["question"], { cwd: process.cwd() });
  expect(result.output).toContain("SUMMARY_ANSWER");
  expect(signed).toHaveLength(1);
  expect(received).toEqual([{ path: "/model/fixture-model/converse", body: JSON.parse(signed[0]!.body!),
    signature: "signed-1", accept: "application/json" }]);
});

it.each([true, false])("signs manual history and prefix summaries (apiKey=%s)", async withKey => {
  const deps = runtime(withKey);
  await deps.compactHistory!("signed-summary", new AbortController().signal);
  expect(received).toHaveLength(2);
  expect(signed).toHaveLength(2);
  expect(received.map(request => request.signature)).toEqual(["signed-1", "signed-2"]);
  expect(received.every(request => request.path.endsWith("/converse") && request.accept === "application/json")).toBe(true);
});

it.each([true, false])("signs abandoned-turn summaries (apiKey=%s)", async withKey => {
  const answer = await runtime(withKey).summarizeAbandonedTurns!([]);
  expect(answer).toContain("SUMMARY_ANSWER");
  expect(signed).toHaveLength(1);
  expect(received[0]).toMatchObject({ path: "/model/fixture-model/converse", signature: "signed-1" });
});

it.each([true, false])("signs automatic history and prefix summaries (apiKey=%s)", async withKey => {
  runtime(withKey).runPrompt("hello", new AbortController().signal);
  expect(fixture.compaction).toBeDefined();
  await fixture.compaction!.summarize({ messages: [], signal: new AbortController().signal } as never);
  await fixture.compaction!.summarizeTurnPrefix!([], new AbortController().signal);
  expect(signed).toHaveLength(2);
  expect(received.map(request => request.signature)).toEqual(["signed-1", "signed-2"]);
});

it('uses one accepted catalogue per operation for requests and compaction after reload', () => {
  const deps = runtime(true);
  deps.runPrompt('before reload', new AbortController().signal);
  const original = fixture.compaction!;
  const configuration = fixture.configuration!;
  const before = configuration.current;
  expect(original.policy.contextWindow).toBe(10_000);
  expect(fixture.invocation?.providerCatalog).toBe(before.catalog);
  const catalog = structuredClone(before.catalog);
  (catalog[0]!.models[0] as { contextWindow: number }).contextWindow = 64_000;
  configuration.publish(configuration.begin(before.binding), before.config, before.binding, undefined, catalog);
  deps.runPrompt('after reload', new AbortController().signal);
  expect(fixture.compaction!.policy.contextWindow).toBe(64_000);
  expect(fixture.invocation?.providerCatalog).toBe(configuration.current.catalog);
  expect(original.policy.contextWindow).toBe(10_000);
});

it.each([true, false])("allows signed background refresh eligibility without a static key (apiKey=%s)", withKey => {
  fixture.config.offline = false;
  runtime(withKey).runPrompt("hello", new AbortController().signal);
  const options = vi.mocked(createCacheWarmingRunner).mock.calls[0]![0];
  expect(options.mode).toBe("streaming");
  expect(fixture.compaction).toBeDefined();
  expect(options.promptCache).toEqual({ short: 300 });
  expect(options.cost).toBeDefined();
  expect(received).toEqual([]);
});

it("does not turn signer availability into a successful side answer or summary", async () => {
  const deps = runtime(false);
  declareEndpoint("test-signed-summary", { ...endpointShape("test-signed-summary"), signer: async () => {
    throw new Error("signer unavailable");
  } });
  const result = await runBtwCommand(["question"], { cwd: process.cwd() });
  expect(result.output).toContain("Failure:");
  expect(result.output).not.toContain("SUMMARY_ANSWER");
  expect(result.output).not.toContain("No provider credential");
  await expect(deps.summarizeAbandonedTurns!([])).rejects.toThrow("signer unavailable");
  expect(received).toEqual([]);
});

it.each(["baseUrl", "model"])("does not summarize a signer target missing %s", async field => {
  const deps = runtime(false);
  delete fixture.resolution[field];
  expect(await deps.summarizeAbandonedTurns!([])).toBeUndefined();
  expect(await deps.compactHistory!("signed-summary", new AbortController().signal)).toMatchObject({ status: "failed" });
  deps.runPrompt("hello", new AbortController().signal);
  expect(fixture.compaction).toBeUndefined();
  expect(received).toEqual([]);
});


it.each([true, false])("replays a signed captured request with the final ceiling (apiKey=%s)", async withKey => {
  fixture.config.offline = false;
  runtime(withKey).runPrompt("hello", new AbortController().signal);
  const options = vi.mocked(createCacheWarmingRunner).mock.calls[0]![0];
  const sent = { endpoint: "test-signed-summary", url: `${baseUrl}/model/fixture-model/converse-stream`,
    headers: { "content-type": "application/json" }, requestHeaders: { "x-captured": "preserved" },
    body: JSON.stringify({ messages: [{ role: "user", content: [{ text: "prefix" }] }], inferenceConfig: { maxTokens: 4096 } }),
  };
  expect(options.canRefresh?.(sent)).toBe(true);
  const usage = await options.refresh(sent, new AbortController().signal);
  expect(usage).toMatchObject({ prompt_tokens: 20, completion_tokens: 1, cache_read_input_tokens: 80 });
  expect(signed).toHaveLength(1);
  expect(JSON.parse(signed[0]!.body!).inferenceConfig).toEqual({ maxTokens: 1 });
  expect(signed[0]!.headers["x-captured"]).toBe("preserved");
  expect(received[0]).toMatchObject({ path: "/model/fixture-model/converse-stream", signature: "signed-1" });
});
