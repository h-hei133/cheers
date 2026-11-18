import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cacheRefreshFor } from "./cache.js";
import { getSessionUsage, recordSessionUsage, resetSessionUsage } from '../../observability/usageTelemetry.js';
import { costModel } from '../../core/commands/cost/model.js';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { createCacheWarmingRunner } from '../../turn/cacheWarm.js';
import { sendSentRequest } from '../../provider/request/sentRequest.js';

let server: http.Server;
let url: string;
let requests: http.IncomingHttpHeaders[];
beforeEach(async () => {
  requests = [];
  server = http.createServer((request, response) => {
    requests.push(request.headers);
    request.resume();
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content: "x" }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 1 } }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  cleanupAdvisorHarnesses();
  vi.restoreAllMocks();
  resetSessionUsage('cache-prices');
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

it('retains the captured cache destination and prices without changing foreground context', async () => {
  const setup = createAdvisorHarness(false, false);
  const sessionId = setup.session.id;
  const prices = { promptPerMTok: 3, completionPerMTok: 6 };
  const cache = cacheRefreshFor({ sessionId, runtimeConfig: {} as never,
    provider: { providerId: 'fixture', model: 'fixture' }, baseUrl: url, rates: prices,
    isCurrent: () => true, renewHeaders: async () => ({}),
  });
  const identity = { provider: 'main', model: 'm', endpoint: 'openai-compatible' };
  recordSessionUsage(sessionId, { provider: 'main', model: 'm', promptTokens: 400, promptIdentity: identity });
  expect(getSessionUsage(sessionId).lastPromptTokens).toBe(400);
  const key = getSessionUsage(sessionId).lastBucketKey;
  prices.promptPerMTok = 99;
  const usage = await cache.refresh!(captured(), new AbortController().signal);
  expect(usage).toMatchObject({ prompt_tokens: 100, completion_tokens: 1 });
  expect(readBoundSessionState(setup.manager, setup.session).state.usage).toMatchObject({ turnsCount: 2 });
  expect(getSessionUsage(sessionId)).toMatchObject({ lastBucketKey: key, lastPromptTokens: 400,
    lastPromptIdentity: identity });
  expect(getSessionUsage(sessionId).recentRequests).toHaveLength(1);
  const bucket = costModel(getSessionUsage(sessionId), []).buckets.find(item => item.provider === 'fixture');
  expect(bucket).toMatchObject({ rateBasis: 'captured', rates: { promptPerMTok: 3 }, promptTokens: 100, completionTokens: 1 });
  expect(bucket?.estimate.usd).toBeCloseTo(0.000306);
  resetSessionUsage(sessionId);
});

function captured(headers: Record<string, string> = {}) {
  return { url, headers, requestHeaders: { "x-gateway-request": "captured" }, body: '{"messages":[],"max_tokens":4096}' };
}

it.each(["cancel", "context"])("does not dispatch after %s during credential renewal", async change => {
  let finish!: (headers: Record<string, string>) => void;
  let current = true;
  const controller = new AbortController();
  const renewHeaders = vi.fn(() => new Promise<Record<string, string>>(resolve => { finish = resolve; }));
  const cache = cacheRefreshFor({ sessionId: "fixture", runtimeConfig: {} as never,
    provider: { providerId: "fixture", model: "fixture" }, isCurrent: () => current, renewHeaders,
  });
  const result = cache.refresh!(captured(), controller.signal);
  if (change === "cancel") controller.abort(); else current = false;
  finish({ authorization: "synthetic" });
  expect(await result).toBeUndefined();
  expect(renewHeaders).toHaveBeenCalledOnce();
  expect(requests).toEqual([]);
});

it('refuses an expired cache window before and after credential renewal', async () => {
  let clock = 1000; vi.spyOn(Date, 'now').mockImplementation(() => clock);
  let finish!: (headers: Record<string, string>) => void;
  const renewHeaders = vi.fn(() => new Promise<Record<string, string>>(resolve => { finish = resolve; }));
  const cache = cacheRefreshFor({ sessionId: 'cache-deadline', runtimeConfig: {} as never,
    provider: { providerId: 'fixture', model: 'fixture' }, isCurrent: () => true, renewHeaders });
  const controller = new AbortController();
  const pending = cache.refresh(captured(), controller.signal, 2000);
  clock = 2001; finish({});
  expect(await pending).toBeUndefined();
  expect(await cache.refresh(captured(), controller.signal, 2000)).toBeUndefined();
  expect(renewHeaders).toHaveBeenCalledOnce();
  expect(requests).toEqual([]);
});

it('refuses a cache refresh after transport preparation crosses its final dispatch deadline', async () => {
  let clock = 1000; vi.spyOn(Date, 'now').mockImplementation(() => clock);
  let finish!: () => void;
  const transport = vi.fn(async (url: RequestInfo | URL, init: RequestInit, beforeDispatch: () => void) => {
    await new Promise<void>(resolve => { finish = resolve; });
    beforeDispatch();
    return fetch(url, init);
  });
  const unsent = vi.fn(); const dispatched = vi.fn();
  const policy = { reserve: () => ({ dispatch: dispatched, confirmUnsent: unsent, settle: vi.fn() }) };
  const pending = sendSentRequest(captured(), new AbortController().signal, fetch, {
    deadline: 2000, provider: 'fixture', model: 'fixture', transport, policy: policy as never });
  await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce());
  clock = 2001; finish();
  expect(await pending).toBeUndefined();
  expect(dispatched).not.toHaveBeenCalled();
  expect(unsent).toHaveBeenCalledOnce();
  expect(requests).toEqual([]);
});

it('refuses a cache refresh whose source retires during transport preparation', async () => {
  let current = true; let finish!: () => void;
  const transport = vi.fn(async (url: RequestInfo | URL, init: RequestInit, beforeDispatch: () => void) => {
    await new Promise<void>(resolve => { finish = resolve; }); beforeDispatch(); return fetch(url, init);
  });
  const unsent = vi.fn(); const dispatched = vi.fn();
  const policy = { reserve: () => ({ dispatch: dispatched, confirmUnsent: unsent, settle: vi.fn() }) };
  const pending = sendSentRequest(captured(), new AbortController().signal, fetch, {
    provider: 'fixture', model: 'fixture', transport, policy: policy as never, isCurrent: () => current } as never);
  await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce()); current = false; finish();
  expect(await pending).toBeUndefined(); expect(dispatched).not.toHaveBeenCalled();
  expect(unsent).toHaveBeenCalledOnce(); expect(requests).toEqual([]);
});

it.each([
  [{ "X-Api-Key": "old" }, { Authorization: "Bearer renewed" }, "x-api-key"],
  [{ Authorization: "Bearer old", "chatgpt-account-id": "old-account" }, { "x-api-key": "renewed" }, "authorization"],
] as const)("replaces prior authorization while retaining request metadata", async (original, renewed, obsolete) => {
  const cache = cacheRefreshFor({ sessionId: "fixture", runtimeConfig: {} as never,
    provider: { providerId: "fixture", model: "fixture" }, isCurrent: () => true, renewHeaders: async () => renewed,
  });
  expect(await cache.refresh!(captured(original), new AbortController().signal)).toEqual({ prompt_tokens: 100, completion_tokens: 1 });
  expect(requests).toHaveLength(1);
  expect(requests[0]![obsolete]).toBeUndefined();
  expect(requests[0]!["chatgpt-account-id"]).toBeUndefined();
  for (const [name, value] of Object.entries(renewed)) expect(requests[0]![name.toLowerCase()]).toBe(value);
  expect(requests[0]!["x-gateway-request"]).toBe("captured");
});

it("rejects a captured endpoint that differs from the prepared transport", async () => {
  const renewHeaders = vi.fn(async () => ({}));
  const cache = cacheRefreshFor({ sessionId: "fixture", runtimeConfig: {} as never,
    provider: { providerId: "fixture", model: "fixture" }, isCurrent: () => true, renewHeaders,
  });
  const sent = { ...captured(), endpoint: "anthropic-messages" };
  expect(cache.canRefresh!(sent)).toBe(false);
  expect(await cache.refresh!(sent, new AbortController().signal)).toBeUndefined();
  expect(renewHeaders).not.toHaveBeenCalled();
  expect(requests).toEqual([]);
});

it('records one captured tier charge for one HTTP refresh through the real cache runner', async () => {
  server.removeAllListeners('request');
  server.on('request', (request, response) => {
    requests.push(request.headers); request.resume();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content: 'x' }, finish_reason: 'stop' }], usage: {
      prompt_tokens: 100, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 0 },
    } }));
  });
  vi.stubEnv('CHEERS_TEST_ROOT', '/tmp/cheers-test');
  const setup = createAdvisorHarness(false, false);
  const sessionId = setup.session.id;
  const tier = { inputTokensAbove: 99, promptPerMTok: 9, completionPerMTok: 18 };
  const prices = { promptPerMTok: 3, completionPerMTok: 6, cacheReadPerMTok: 0.3, tiers: [tier] };
  const cache = cacheRefreshFor({ sessionId, runtimeConfig: {} as never,
    provider: { providerId: 'fixture', model: 'fixture' }, baseUrl: url, rates: prices,
    isCurrent: () => true, renewHeaders: async () => ({}),
  });
  let clock = Date.now();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const runner = createCacheWarmingRunner({ mode: 'streaming', cost: prices,
    ...cache, now: () => clock });
  try {
    runner.noteRequest(100_000, { ...captured(), sentAt: clock, cache: { retention: 'short', ttlMs: 300_000 } });
    const due = runner.status().nextRefreshAt!;
    expect(due - clock).toBe(270_000);
    tier.promptPerMTok = 99; tier.completionPerMTok = 198;
    clock = due;
    vi.advanceTimersByTime(270_000);
    // The real HTTP transport starts after credential renewal resumes.
    vi.useRealTimers();
    await vi.waitFor(() => expect(runner.status().nextRefreshAt).toBe(due + 270_000), { timeout: 2500, interval: 10 });
    expect(requests).toHaveLength(1);
    expect(getSessionUsage(sessionId)).toMatchObject({ turnsCount: 1 });
    expect(readBoundSessionState(setup.manager, setup.session).state.usage).toMatchObject({ turnsCount: 1 });
    const report = costModel(getSessionUsage(sessionId), []);
    expect(report.buckets).toHaveLength(1);
    expect(report.buckets[0]).toMatchObject({ rateBasis: 'captured', turnsCount: 1, promptTokens: 100, completionTokens: 1,
      rates: { promptPerMTok: 9, completionPerMTok: 18, cacheReadPerMTok: 0.3 } });
    expect(report.estimate.usd).toBeCloseTo(0.000918, 10);
  } finally {
    vi.useRealTimers();
    await runner.reset();
    resetSessionUsage(sessionId);
  }
});
