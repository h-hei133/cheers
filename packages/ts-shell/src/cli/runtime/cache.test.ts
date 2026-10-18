import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cacheRefreshFor } from "./cache.js";
import { getSessionUsage, recordSessionUsage, resetSessionUsage } from '../../observability/usageTelemetry.js';
import { costModel } from '../../core/commands/cost/model.js';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { readBoundSessionState } from '../../session/store/bound.js';

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
  recordSessionUsage(sessionId, { provider: 'main', model: 'm', promptTokens: 400 });
  const key = getSessionUsage(sessionId).lastBucketKey;
  prices.promptPerMTok = 99;
  const usage = await cache.refresh!(captured(), new AbortController().signal);
  expect(usage).toMatchObject({ prompt_tokens: 100, completion_tokens: 1 });
  expect(readBoundSessionState(setup.manager, setup.session).state.usage).toMatchObject({ turnsCount: 2 });
  expect(getSessionUsage(sessionId)).toMatchObject({ lastBucketKey: key, lastPromptTokens: 400 });
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
