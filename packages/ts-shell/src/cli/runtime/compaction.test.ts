import { ConfigState } from "../../config/state.js";
import fs from 'node:fs';
import path from 'node:path';
import { SessionManager } from '../../session/SessionManager.js';
import { configurationBinding } from "../../core/shell/configuration.js";
import type { CliRuntimeInvocationInput } from "../../entrypoints/cliRuntimeInvocation.js";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCliSessionRuntime } from "./cliSessionRuntimeFactory.js";
import { buildCompactionWiring } from "./compaction.js";
import { runBtwCommand } from "../../core/commands/btwCommandRuntime.js";
import { declareEndpoint, endpointShape } from "../../provider/endpoints/index.js";
import type { SessionRuntimeDependencies } from "../../core/shell/sessionRuntime.js";
import type { CompactionSetup } from "../../turn/session.js";
import type { RequestSigner } from "../../provider/request/fetch.js";
import { createCacheWarmingRunner } from "../../turn/cacheWarm.js";
import { loadCatalog } from '../../core/models/catalogStore.js';
import { getSessionUsage, recordSessionUsage, resetSessionUsage, totalTokens } from '../../observability/usageTelemetry.js';
import { FINAL_STEP_MESSAGE } from '../../turn/messages.js';
import { historyDigest, requestIdentity } from '../../context/request/identity.js';
import { captureUsageAttribution } from '../../observability/usage/identity.js';
import { withRequestOverhead } from '../../entrypoints/cliRuntimeInvocation.js';
import { createStepFunction } from '../../turn/step.js';
import type { PromptIdentitySnapshot } from '../../observability/usage/model.js';
import { estimateRequestTokens, estimateTokens } from '../../session/context.js';
import { planCompaction, planCompactionCut } from '../../session/compaction.js';
import { requestReplayBinding } from '../../provider/request/replay.js';
import { outgoingProjection } from '../../turn/messages.js';
import * as measurement from '../../turn/measurement.js';
import { estimatePrompt } from '../../context/request/estimate.js';
import { resolveRequestShape } from '../../core/models/requestShape.js';

const fixture = vi.hoisted(() => ({
  deps: undefined as SessionRuntimeDependencies | undefined,
  compaction: undefined as CompactionSetup | undefined,
  invocation: undefined as CliRuntimeInvocationInput | undefined,
  configuration: undefined as ConfigState | undefined,
  resolution: {} as Record<string, unknown>,
  toolCalling: undefined as boolean | undefined,
  endpoint: "test-signed-summary",
  config: { providerConnectTimeoutMs: 1000, providerHeadersTimeoutMs: 1000, providerBodyTimeoutMs: 1000, offline: true },
}));
vi.mock("../../config/runtimeConfig.js", async importOriginal => ({ ...await importOriginal<typeof import('../../config/runtimeConfig.js')>(), getRuntimeConfig: () => fixture.config }));
// This transport composition has no goal; budget policy is covered by its owning suite.
vi.mock("./goal.js", () => ({ prepareGoalSession: () => undefined, goalObjectiveFor: () => undefined, goalPolicyFor: () => undefined }));
vi.mock('./goalScheduling.js', () => ({ installGoalScheduler: () => undefined }));
vi.mock("../../core/shell/providerCredentials.js", () => ({ resolveProviderCredential: () => fixture.resolution }));
vi.mock("../../core/models/catalogStore.js", () => ({ loadCatalog: () => [{
  id: "fixture", endpoint: fixture.endpoint, models: [{ id: "fixture-model", contextWindow: 10000,
    promptCache: { short: 300 }, cost: { promptPerMTok: 10, cacheReadPerMTok: 1, completionPerMTok: 1 },
    ...(fixture.toolCalling === undefined ? {} : { toolCalling: fixture.toolCalling }),
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
let scratch: string;
beforeEach(async () => {
  scratch = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/compaction-runtime-'));
  vi.stubEnv('HOME', scratch); vi.stubEnv('USERPROFILE', scratch);
  signed = [];
  received = [];
  fixture.compaction = undefined;
  fixture.toolCalling = undefined;
  fixture.endpoint = "test-signed-summary";
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
  resetSessionUsage('signed-summary');
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true });
});

function runtime(withKey: boolean) {
  fixture.resolution = { provider: "fixture", model: "fixture-model", baseUrl,
    ...(withKey ? { credential: { apiKey: "synthetic", model: "fixture-model", baseUrl } } : {}),
  };
  const manager = new SessionManager();
  const session = manager.createNewWithId('signed-summary', process.cwd());
  const context = { cwd: process.cwd(), projectRoot: process.cwd(), session,
    runtimeConfig: structuredClone({ ...fixture.config, configProvenance: {}, configValidation: { valid: true, securityBlocked: false }, configDiagnostics: [] }) };
  const configuration = new ConfigState(context.runtimeConfig as never, configurationBinding(context), loadCatalog());
  fixture.configuration = configuration;
  createCliSessionRuntime({
    runtimeContext: { ...context, configuration },
    providerRuntimeBridge: { resolveCredentialSnapshot: () => fixture.resolution },
    sessionManager: manager,
    renderer: { renderLine: vi.fn(), emit: vi.fn() }, options: {}, approvalTrustPolicy: {}, getReadline: () => null,
  } as never);
  return fixture.deps!;
}

it.each([true, false])("signs side questions with final JSON URL/body (apiKey=%s)", async withKey => {
  runtime(withKey);
  const result = await runBtwCommand(["question"], { cwd: process.cwd(), sessionId: 'signed-summary' });
  expect(result.output).toContain("SUMMARY_ANSWER");
  expect(signed).toHaveLength(1);
  expect(received).toEqual([{ path: "/model/fixture-model/converse", body: JSON.parse(signed[0]!.body!),
    signature: "signed-1", accept: "application/json" }]);
  expect(totalTokens(getSessionUsage('signed-summary'))).toBe(101);
  expect(Object.values(getSessionUsage('signed-summary').byModel)[0]).toMatchObject({
    promptTokens: 20, cacheReadTokens: 80, completionTokens: 1, attribution: { rates: { promptPerMTok: 10 } },
  });
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

it("writes the fallback summary's tool history as prose for a model that takes none", async () => {
  // A delegated or job run passes a provider that names no request shape. The
  // wiring site is what must resolve it, or the preflight and the send would
  // disagree about whether tool messages may travel. The default protocol is
  // used because it writes tool structure verbatim.
  fixture.toolCalling = false;
  const wiring = buildCompactionWiring({
    provider: { headers: {}, baseUrl, model: "fixture-model", providerId: "fixture", endpoint: "openai-compatible" },
    runtimeConfig: structuredClone({ ...fixture.config, configProvenance: {}, configValidation: { valid: true, securityBlocked: false },
      configDiagnostics: [] }) as never,
    sessionId: "signed-summary", catalog: loadCatalog(),
  });
  const messages = [
    { role: "user" as const, content: "read the file" },
    { role: "assistant" as const, content: "", tool_calls: [{ id: "call-1", type: "function" as const,
      function: { name: "read", arguments: JSON.stringify({ path: "src/a.ts" }) } }] },
    { role: "tool" as const, tool_call_id: "call-1", content: "file contents" },
  ];
  await wiring.summarize({ messages, signal: new AbortController().signal } as never);

  const serialized = JSON.stringify(received[0]!.body);
  expect(received[0]!.path).toBe("/chat/completions");
  expect(serialized).not.toContain('"tool_calls"');
  expect(serialized).not.toContain('"role":"tool"');
  expect(serialized).toContain("[tool call call-1] read");
  expect(serialized).toContain("[tool result call-1]");
  expect(serialized).toContain("file contents");
});

it.each([['main', 'fixture-model', 32000], ['sibling', 'fixture-model', 6000], ['main', 'other', 6000]] as const)(
  'binds compaction to the captured %s credential and %s model', (connectionId, model, expected) => {
    const config = { ...fixture.config, contextWindow: 6000, reserveTokens: 0,
      sessionContextWindow: { provider: 'fixture', model: 'fixture-model', connectionId: 'main',
        connectionScope: 'session' as const, value: 32000 },
      configProvenance: {}, configValidation: { valid: true, securityBlocked: false }, configDiagnostics: [] };
    const wiring = buildCompactionWiring({ provider: { headers: {}, baseUrl, model, providerId: 'fixture' },
      resolution: { provider: 'fixture', model, credential: { connectionId } }, runtimeConfig: config as never,
      sessionId: 'signed-summary', catalog: loadCatalog() });
    expect(wiring.policy.contextWindow).toBe(expected);
  });

it.each([undefined, 1200])('uses the top-level retention budget unless the model overrides it (%s)', modelBudget => {
  const wiring = buildCompactionWiring({ provider: { headers: {}, baseUrl, model: 'fixture-model', providerId: 'fixture' },
    runtimeConfig: { ...fixture.config, keepRecentTokens: 2000,
      ...(modelBudget === undefined ? {} : { modelTokenBudgets: { 'fixture/fixture-model': { keepRecentTokens: modelBudget } } }) } as never,
    sessionId: 'signed-summary', catalog: loadCatalog() });
  expect(wiring.policy.keepRecentTokens).toBe(modelBudget ?? 2000);
});

it.each([false, true])('prices projected tool history before fallback compaction (bridge=%s)', bridge => {
  const catalog = [{ id: 'fixture', endpoint: 'openai-compatible' as const, models: [
    { id: 'fixture-model', contextWindow: 50_000, compat: { assistantAfterToolResult: bridge } },
  ] }];
  const wiring = buildCompactionWiring({
    provider: { headers: {}, baseUrl, model: 'fixture-model', providerId: 'fixture', endpoint: 'openai-compatible' },
    runtimeConfig: { ...fixture.config, reserveTokens: 0, maxOutputTokens: 128, keepRecentTokens: 600 } as never,
    sessionId: 'signed-summary', catalog,
  });
  const messages = Array.from({ length: 40 }, (_, index) => [
    { role: 'user' as const, content: `read ${index}` },
    { role: 'assistant' as const, content: '', tool_calls: [
      { id: `read-${index}`, type: 'function' as const, function: { name: 'read', arguments: '{}' } },
    ] },
    { role: 'tool' as const, tool_call_id: `read-${index}`, content: `${index}:` + 'x'.repeat(4_000) },
  ]).flat();
  const original = structuredClone(messages);
  const overhead = { systemPrompt: 'main system', tools: [{ name: 'read' }] };
  const attached = withRequestOverhead({ ...wiring, onCompact: () => {} }, overhead)!;
  const projected = outgoingProjection(messages, bridge).messages.map(message => ({ ...message, content: message.content ?? '' }));
  const wireTokens = estimateRequestTokens(projected, overhead);
  const rawTokens = estimateRequestTokens(messages, overhead);
  expect(attached.policy.projectMessages!(messages)).toEqual(projected);
  expect(rawTokens).toBeGreaterThan(40_000);
  expect(wireTokens).toBeLessThan(20_000);
  expect(planCompaction(messages, { ...attached.policy, projectMessages: undefined })).toBeDefined();
  expect(planCompaction(messages, attached.policy)).toBeUndefined();
  const invalidIdentity = { provider: 'fixture', model: 'fixture-model', endpoint: 'openai-compatible' as const,
    ...requestIdentity(overhead), historyDigest: historyDigest(messages), wireHistoryDigest: historyDigest(projected),
    wireMessageCount: projected.length + 1, replayBinding: requestReplayBinding({ provider: 'fixture', model: 'fixture-model', baseUrl,
      endpoint: 'openai-compatible' }) };
  recordSessionUsage('signed-summary', { promptTokens: 60_000, promptMessageCount: messages.length,
    promptIdentity: invalidIdentity, attribution: captureUsageAttribution({ provider: 'fixture', model: 'fixture-model', baseUrl }) },
  { promptMeasured: true });
  expect(attached.policy.measureContextTokens!(messages, attached.policy.promptIdentity)).toBeUndefined();
  // Rejecting an invalid anchor must return to projected pricing too, rather
  // than immediately compressing the much larger raw history.
  expect(planCompaction([...messages], attached.policy)).toBeUndefined();
  expect(planCompaction([...messages], { ...attached.policy, projectMessages: undefined })).toBeDefined();
  // A genuinely oversized projected request still compacts; only the trigger
  // projection changes, while the retained cut keeps its raw-history indexes.
  const oversizedPolicy = { ...attached.policy, contextWindow: wireTokens - 1 };
  const rawPlan = planCompactionCut(messages, oversizedPolicy)!;
  const plan = planCompaction(messages, oversizedPolicy);
  expect(plan?.tokensBefore).toBe(wireTokens);
  expect(plan).toEqual({ ...rawPlan, tokensBefore: wireTokens });
  expect(messages.slice(plan!.cut)).toEqual(original.slice(rawPlan.cut));
  if (bridge) expect(projected.length).toBeGreaterThan(messages.length);
  expect(messages).toEqual(original);
});

it('uses a successful request anchor through the actual compaction and overhead wiring', async () => {
  const provider = { headers: {}, baseUrl, model: 'fixture-model', providerId: 'fixture', endpoint: 'openai-compatible' as const };
  const catalog = [{ id: 'fixture', endpoint: 'openai-compatible' as const, models: [{ id: 'fixture-model', contextWindow: 64000 }] }];
  const overhead = { systemPrompt: 'effective main system', tools: [] };
  const wiring = buildCompactionWiring({ provider, runtimeConfig: { ...fixture.config, reserveTokens: 0, maxOutputTokens: 128 } as never,
    sessionId: 'signed-summary', catalog });
  let accepted: PromptIdentitySnapshot | undefined;
  const attached = withRequestOverhead({ ...wiring, onCompact: () => {} }, overhead, () => overhead, () => accepted)!;
  const messages = [{ role: 'user' as const, content: 'selected history' }];
  expect(attached.policy.measureContextTokens!(messages, attached.policy.promptIdentity)).toBeUndefined();
  const step = createStepFunction({ provider: { ...provider, provider: provider.providerId },
    workspaceRoot: scratch, sessionId: 'signed-summary', catalog, ...overhead,
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 900, completion_tokens: 1 } }), { headers: { 'content-type': 'application/json' } }) });
  const response = await step(messages, undefined, {}, { allowTools: true,
    onRequestSent: sent => { accepted = sent.promptIdentity; } });
  expect(response.stopReason).toBe('stop');
  const identity = attached.policy.promptIdentity!;
  expect(identity).toMatchObject({ provider: 'fixture', model: 'fixture-model', endpoint: 'openai-compatible',
    historyDigest: historyDigest(messages), wireMessageCount: messages.length });
  expect(identity.wireHistoryDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(identity.replayBinding).toMatch(/^[a-f0-9]{64}$/);
  expect(attached.policy.measureContextTokens!(messages, identity)).toBe(900);
  const tail = [{ role: 'assistant' as const, content: 'ok' }, { role: 'user' as const, content: 'next question' }];
  expect(attached.policy.measureContextTokens!([...messages, ...tail], identity)).toBe(900 + estimateTokens(tail));
  // This request never offered any tools, so the false flag does not make it
  // a closing request and must not invent an instruction it will never send.
  const closing = attached.policy.measureContextTokens!([...messages, ...tail], identity, false);
  expect(closing).toBe(900 + estimateTokens(tail));
  // A fresh process has no sent-request identity yet; live schema/system plus
  // the strict persisted prefix proof can still evaluate the recovered anchor.
  accepted = undefined;
  expect(attached.policy.measureContextTokens!([...messages, ...tail], attached.policy.promptIdentity))
    .toBe(900 + estimateTokens(tail));
  expect(attached.policy.measureContextTokens!([{ ...messages[0]!, content: 'edited' }], identity)).toBeUndefined();
  for (const changed of [{ provider: 'other' }, { model: 'other' }, { endpoint: 'other' }, { endpointId: 'other' },
    { replayBinding: 'other' }, { historyDigest: 'other' }, { wireHistoryDigest: 'other' }, { wireMessageCount: 0 }]) {
    expect(attached.policy.measureContextTokens!(messages, { ...identity, ...changed })).toBeUndefined();
  }
  overhead.systemPrompt = 'changed system';
  expect(attached.policy.measureContextTokens!(messages, attached.policy.promptIdentity)).toBeUndefined();
});

it('rejects a tool-enabled anchor for the closing request and estimates its schema-free wire', () => {
  const provider = { headers: {}, baseUrl, model: 'fixture-model', providerId: 'fixture', endpoint: 'openai-compatible' as const };
  const messages = [{ role: 'user' as const, content: 'selected' }];
  const overhead = { systemPrompt: 'effective main system', tools: [{ name: 'read', description: 'x'.repeat(5_000) }] };
  const identity = { provider: provider.providerId, model: provider.model, endpoint: provider.endpoint,
    ...requestIdentity(overhead), historyDigest: historyDigest(messages), wireHistoryDigest: historyDigest(messages),
    wireMessageCount: messages.length, replayBinding: requestReplayBinding({ ...provider, provider: provider.providerId }) };
  recordSessionUsage('signed-summary', { promptTokens: 9_000, promptMessageCount: messages.length, promptIdentity: identity,
    attribution: captureUsageAttribution({ provider: provider.providerId, model: provider.model, baseUrl }) }, { promptMeasured: true });
  const wiring = buildCompactionWiring({ provider, runtimeConfig: fixture.config as never, sessionId: 'signed-summary', catalog: loadCatalog() });
  const attached = withRequestOverhead({ ...wiring, onCompact: () => {} }, overhead)!;
  expect(attached.policy.measureContextTokens!(messages, attached.policy.promptIdentity)).toBe(9_000);
  expect(attached.policy.measureContextTokens!(messages, attached.policy.promptIdentity, false)).toBeUndefined();
  const longer = [...messages, { role: 'assistant' as const, content: 'answer'.repeat(40) },
    { role: 'user' as const, content: 'next'.repeat(40) }];
  const policy = { ...attached.policy, contextWindow: 100, reserveTokens: 0, keepRecentTokens: 1 };
  const plan = planCompaction(longer, policy, false);
  const expected = estimateRequestTokens([...longer, { role: 'user' as const, content: FINAL_STEP_MESSAGE }],
    { ...overhead, tools: [] });
  expect(plan?.tokensBefore).toBe(expected);
});

it.each([-1, 0.5, 20])('rejects an invalid or mismatched wire anchor count (%s)', wireMessageCount => {
  const provider = { headers: {}, baseUrl, model: 'fixture-model', providerId: 'fixture', endpoint: 'openai-compatible' as const };
  const messages = [{ role: 'user' as const, content: 'selected' }];
  const identity = { provider: provider.providerId, model: provider.model, endpoint: provider.endpoint,
    ...requestIdentity({ tools: [] }), historyDigest: historyDigest(messages), wireHistoryDigest: historyDigest(messages),
    wireMessageCount, replayBinding: requestReplayBinding({ ...provider, provider: provider.providerId }) };
  recordSessionUsage('signed-summary', { promptTokens: 900, promptMessageCount: messages.length, promptIdentity: identity,
    attribution: captureUsageAttribution({ provider: provider.providerId, model: provider.model, baseUrl }) });
  const wiring = buildCompactionWiring({ provider, runtimeConfig: fixture.config as never, sessionId: 'signed-summary', catalog: loadCatalog() });
  expect(wiring.policy.measureContextTokens!(messages, identity)).toBeUndefined();
});

it.each(['below', 'equal to', 'above'] as const)('handles actual tool-output removal %s its provider anchor after later turns arrive', relation => {
  const provider = { headers: {}, baseUrl, model: 'fixture-model', providerId: 'fixture', endpoint: 'openai-compatible' as const };
  const messages = [{ role: 'user' as const, content: 'read' }, { role: 'assistant' as const, content: '', tool_calls: [
    { id: 'read-1', type: 'function' as const, function: { name: 'read', arguments: '{}' } },
  ] }, { role: 'tool' as const, tool_call_id: 'read-1', content: 'result '.repeat(1000) }];
  const identity = { provider: provider.providerId, model: provider.model, endpoint: provider.endpoint,
    ...requestIdentity({ tools: [] }), historyDigest: historyDigest(messages),
    wireHistoryDigest: historyDigest(outgoingProjection(messages, false).messages), wireMessageCount: messages.length,
    replayBinding: requestReplayBinding({ ...provider, provider: provider.providerId }) };
  const tail = Array.from({ length: 4 }, (_, index) => [{ role: 'user' as const, content: `next ${index}` },
    { role: 'assistant' as const, content: 'answer' }]).flat();
  const current = [...messages, ...tail];
  const projected = outgoingProjection(current, false);
  const removedTokens = Math.floor((messages[2]!.content.length - projected.messages[2]!.content!.length) / 3.5);
  expect(removedTokens).toBeGreaterThan(0);
  expect(removedTokens).toBeLessThan(3000);
  // The valid fixture pays for its 7000-character result plus request overhead;
  // the other rows deliberately supply stale anchors at the exact boundary.
  const anchorTokens = relation === 'below' ? 3000 : removedTokens - (relation === 'above' ? 1 : 0);
  recordSessionUsage('signed-summary', { promptTokens: anchorTokens, promptMessageCount: messages.length, promptIdentity: identity,
    attribution: captureUsageAttribution({ provider: provider.providerId, model: provider.model, baseUrl }) });
  const wiring = buildCompactionWiring({ provider, runtimeConfig: fixture.config as never, sessionId: 'signed-summary', catalog: loadCatalog() });
  expect(wiring.policy.measureContextTokens!(messages, identity)).toBe(anchorTokens);
  const expected = relation === 'below' ? anchorTokens - removedTokens + estimateTokens(tail) : undefined;
  expect(wiring.policy.measureContextTokens!(current, identity)).toBe(expected);
  expect(wiring.policy.measureContextTokens!(current, identity)).toBe(expected);
  expect(getSessionUsage('signed-summary').lastPromptTokens).toBe(anchorTokens);
});

it.each([
  ['below', 899, 1], ['equal to', 900, undefined], ['above', 901, undefined],
] as const)('checks a supplied rewrite %s its provider anchor independently of the proof producer',
  (_relation, removedTokens, correctedTokens) => {
    const provider = { headers: {}, baseUrl, model: 'fixture-model', providerId: 'fixture', endpoint: 'openai-compatible' as const };
    const messages = [{ role: 'user' as const, content: 'selected' }];
    const identity = { provider: provider.providerId, model: provider.model, endpoint: provider.endpoint,
      ...requestIdentity({ tools: [] }), historyDigest: historyDigest(messages), wireHistoryDigest: historyDigest(messages),
      wireMessageCount: messages.length, replayBinding: requestReplayBinding({ ...provider, provider: provider.providerId }) };
    recordSessionUsage('signed-summary', { promptTokens: 900, promptMessageCount: messages.length, promptIdentity: identity,
      attribution: captureUsageAttribution({ provider: provider.providerId, model: provider.model, baseUrl }) });
    const wiring = buildCompactionWiring({ provider, runtimeConfig: fixture.config as never, sessionId: 'signed-summary', catalog: loadCatalog() });
    const tail = [{ role: 'user' as const, content: 'next' }];
    // Inject a future producer's proof so its own upper bound cannot mask a
    // regression in the evaluator's independent consumption check.
    const proof = vi.spyOn(measurement, 'measuredProjectionPrefix').mockReturnValue({
      wireHistoryDigest: identity.wireHistoryDigest, wireMessageCount: messages.length, rewriteTokensRemoved: removedTokens,
    });
    try {
      expect(wiring.policy.measureContextTokens!([...messages, ...tail], identity))
        .toBe(correctedTokens === undefined ? undefined : correctedTokens + estimateTokens(tail));
      expect(proof).toHaveBeenCalled();
      expect(getSessionUsage('signed-summary').lastPromptTokens).toBe(900);
    } finally {
      proof.mockRestore();
    }
  });

it.each([true, false])('shares calibrated public reasoning tail accounting with the prompt display (declared=%s)', declared => {
  const provider = { headers: {}, baseUrl, model: 'fixture-model', providerId: 'fixture', endpoint: 'openai-compatible' as const };
  const messages = [{ role: 'user' as const, content: 'selected' }];
  const overhead = { systemPrompt: 'system', tools: [] };
  const attribution = captureUsageAttribution({ provider: provider.providerId, model: provider.model, baseUrl });
  const replayBinding = requestReplayBinding({ ...provider, provider: provider.providerId });
  const identity = { provider: provider.providerId, model: provider.model, endpoint: provider.endpoint, endpointId: attribution.endpointId,
    ...requestIdentity(overhead), historyDigest: historyDigest(messages), wireHistoryDigest: historyDigest(messages),
    wireMessageCount: messages.length, replayBinding };
  recordSessionUsage('signed-summary', { promptTokens: 900, promptMessageCount: messages.length, promptIdentity: identity, attribution });
  const reasoningReplayField = declared ? 'reasoning_content' as const : undefined;
  const catalog = [{ id: provider.providerId, baseUrl, endpoint: provider.endpoint, models: [{ id: provider.model, contextWindow: 64000,
    ...(reasoningReplayField ? { compat: { reasoningReplayField } } : {}) }] }];
  expect(resolveRequestShape(catalog, provider.providerId, provider.model, undefined, baseUrl, provider.endpoint).reasoningReplayField)
    .toBe(reasoningReplayField);
  const wiring = buildCompactionWiring({ provider, runtimeConfig: fixture.config as never, sessionId: 'signed-summary', catalog });
  const tail = [{ role: 'assistant' as const, content: 'answer', reasoning: { text: 'r'.repeat(40_000) },
    origin: { provider: provider.providerId, model: provider.model, replayBinding } }];
  const current = [...messages, ...tail];
  const compactTokens = wiring.policy.measureContextTokens!(current, identity);
  const displayed = estimatePrompt(current, overhead, { ...identity, wireHistoryDigest: historyDigest(current), wireMessageCount: current.length },
    getSessionUsage('signed-summary'), { tokens: 14_000, method: 'characters/3.5',
      prefixIdentity: { wireHistoryDigest: identity.wireHistoryDigest, wireMessageCount: messages.length },
      tailContext: { endpoint: provider.endpoint, provider: provider.providerId, model: provider.model, replayBinding, reasoningReplayField } });
  expect(displayed.source).toBe('calibrated');
  expect(compactTokens).toBe(displayed.tokens);
  if (declared) expect(compactTokens).toBeGreaterThan(12_000);
  else expect(compactTokens).toBe(902);
  expect(wiring.policy.measureContextTokens!([...messages, { ...tail[0]!, reasoning: { ...tail[0]!.reasoning, signature: 'opaque' } }], identity))
    .toBeUndefined();
});

it("declines a compaction measurement without the complete prompt identity", () => {
  const deps = runtime(true);
  deps.runPrompt('hello', new AbortController().signal);
  const measure = fixture.compaction!.policy.measureContextTokens!;
  recordSessionUsage('signed-summary', {
    provider: 'fixture', model: 'fixture-model', promptTokens: 100, promptMessageCount: 0,
    promptIdentity: {
      provider: 'fixture', model: 'fixture-model', endpoint: 'test-signed-summary',
      schemaDigest: 'schema', systemDigest: 'system',
    },
    attribution: captureUsageAttribution({ provider: 'fixture', model: 'fixture-model', baseUrl }),
  });

  expect(measure([], undefined)).toBeUndefined();
  expect(measure([], { schemaDigest: 'schema', systemDigest: 'system' })).toBe(100);
});

it('binds a compaction measurement to the measured history and relay', () => {
  const deps = runtime(true);
  deps.runPrompt('hello', new AbortController().signal);
  const measure = fixture.compaction!.policy.measureContextTokens!;
  const messages = [{ role: 'user' as const, content: 'old' }];
  const identity = { provider: 'fixture', model: 'fixture-model', endpoint: 'test-signed-summary',
    schemaDigest: 'schema', systemDigest: 'system', historyDigest: historyDigest(messages) };
  recordSessionUsage('signed-summary', {
    provider: 'fixture', model: 'fixture-model', promptTokens: 100, promptMessageCount: messages.length,
    promptIdentity: identity, attribution: captureUsageAttribution({ provider: 'fixture', model: 'fixture-model', baseUrl }),
  });
  expect(measure(messages, { schemaDigest: 'schema', systemDigest: 'system' })).toBe(100);
  expect(measure([...messages, { role: 'user', content: 'next' }],
    { schemaDigest: 'schema', systemDigest: 'system' })).toBeGreaterThan(100);
  expect(measure([{ ...messages[0]!, content: 'new' }], { schemaDigest: 'schema', systemDigest: 'system' }))
    .toBeUndefined();

  recordSessionUsage('signed-summary', {
    provider: 'fixture', model: 'fixture-model', promptTokens: 100, promptMessageCount: messages.length,
    promptIdentity: identity,
    attribution: captureUsageAttribution({ provider: 'fixture', model: 'fixture-model', baseUrl: `${baseUrl}/other` }),
  });
  expect(measure(messages, { schemaDigest: 'schema', systemDigest: 'system' })).toBeUndefined();
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

it('keeps summary replay independent of foreground output and binds it to the summary model ceiling', () => {
  const deps = runtime(true);
  deps.runPrompt('before reload', new AbortController().signal);
  const original = fixture.compaction!.policy.summaryIdentity;
  const configuration = fixture.configuration!;
  const before = configuration.current;
  configuration.publish(configuration.begin(before.binding), before.config, before.binding);
  deps.runPrompt('unchanged reload', new AbortController().signal);
  expect(fixture.compaction!.policy.summaryIdentity).toBe(original);
  const current = configuration.current;
  configuration.publish(configuration.begin(current.binding), { ...current.config, maxOutputTokens: 256 }, current.binding);
  deps.runPrompt('changed foreground output', new AbortController().signal);
  expect(fixture.compaction!.policy.summaryIdentity).toBe(original);
  const accepted = configuration.current;
  const catalog = structuredClone(accepted.catalog);
  Object.assign(catalog[0]!.models[0]!, { maxTokens: 1_024 });
  configuration.publish(configuration.begin(accepted.binding), accepted.config, accepted.binding, undefined, catalog);
  deps.runPrompt('changed summary model ceiling', new AbortController().signal);
  expect(fixture.compaction!.policy.summaryIdentity).not.toBe(original);
  expect(received).toEqual([]);
});

it('sends independent summary output with a production input segment budget', async () => {
  const provider = { providerId: 'fixture', model: 'fixture-model', endpoint: 'test-signed-summary', baseUrl, headers: {} };
  for (const maxOutputTokens of [256, 1_024]) {
    const wiring = buildCompactionWiring({ provider, runtimeConfig: { ...fixture.config, maxOutputTokens, reserveTokens: 2_000 } as never,
      sessionId: 'signed-summary', catalog: [{ id: 'fixture', endpoint: 'test-signed-summary',
        models: [{ id: 'fixture-model', contextWindow: 40_000, maxTokens: 10_000 }] }] });
    expect(wiring.policy.outputTokens).toBe(maxOutputTokens);
    expect(wiring.policy.segmentTokens).toBe(16_000);
    expect(await wiring.summarize({ messages: [{ role: 'user', content: 'Summarize this work' }], signal: new AbortController().signal }))
      .toContain('SUMMARY_ANSWER');
    expect((received.at(-1)!.body as { inferenceConfig: { maxTokens: number } }).inferenceConfig.maxTokens).toBe(8_192);
  }
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
