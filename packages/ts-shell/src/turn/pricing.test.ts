import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CatalogModel, CatalogProvider } from '../core/models/catalog.js';
import { loadCatalogSnapshot, userCatalogPath } from '../core/models/catalogStore.js';
import { costModel } from '../core/commands/cost/model.js';
import { getSessionUsage, resetSessionUsage } from '../observability/usageTelemetry.js';
import { createStepFunction } from './step.js';
import { createTurnRequest } from './request.js';
import { EventChannel } from './stream.js';
import type { QueryEvent } from '../core/query/runtime/events.js';
import { InMemoryTraceStore } from '../observability/tracing/span.js';
import { runTraceScope } from '../observability/tracing/context.js';
import { declareEndpoint, endpointShape } from '../provider/endpoints/index.js';

let workspace: string;
let sessionId: string;
let server: http.Server;
let baseUrl: string;
let replies: unknown[];
let requests: string[];
let beforeReply: (() => Promise<void>) | undefined;

beforeEach(async () => {
  const root = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(root, { recursive: true });
  workspace = fs.mkdtempSync(path.join(root, 'request-pricing-'));
  sessionId = path.basename(workspace);
  vi.stubEnv('HOME', workspace); vi.stubEnv('USERPROFILE', workspace); vi.stubEnv('CHEERS_TEST_ROOT', workspace);
  vi.stubEnv('CHEERS_PROVIDER_PROXY', 'off');
  replies = []; requests = []; beforeReply = undefined;
  server = http.createServer(async (request, response) => {
    for await (const _chunk of request) { /* Consume the dispatched request. */ }
    requests.push(request.url!);
    await beforeReply?.();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(replies.shift()));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  resetSessionUsage(sessionId);
  vi.unstubAllEnvs();
  fs.rmSync(workspace, { recursive: true, force: true });
});

function pricedStep(cost: NonNullable<CatalogModel['cost']>, endpoint = 'openai-compatible',
  overrides: Partial<Parameters<typeof createStepFunction>[0]> = {}) {
  const catalog: CatalogProvider[] = [{ id: 'fixture', label: 'Fixture', runtime: 'openai-compatible', auth: 'none',
    endpoint, baseUrl, models: [{ id: 'meter', contextWindow: 2_000_000, maxTokens: 4096, cost }] }];
  return createStepFunction({ provider: { provider: 'fixture', model: 'meter', endpoint, baseUrl, headers: {} },
    workspaceRoot: workspace, sessionId, systemPrompt: '', tools: [], catalog, reserveTokens: 0,
    retry: { enabled: false }, ...overrides });
}

function compatible(usage: Record<string, unknown>) {
  return { choices: [{ message: { content: 'Recorded.' }, finish_reason: 'stop' }], usage };
}

function native(usage: Record<string, unknown>) {
  return { content: [{ type: 'text', text: 'Recorded.' }], stop_reason: 'end_turn', usage };
}

async function send(step: ReturnType<typeof createStepFunction>) {
  const result = await step([{ role: 'user', content: 'Measure this request.' }], undefined, {}, { allowTools: false });
  expect(result).toMatchObject({ text: 'Recorded.', stopReason: 'stop' });
  return result;
}

it.each(['openai-compatible', 'anthropic-messages', 'copilot-messages'])(
  'selects prices from this request input at N/N+1, including cache, through %s', async endpoint => {
    const rates = { promptPerMTok: 1, completionPerMTok: 2, cacheReadPerMTok: 0.1, cacheWritePerMTok: 1.25,
      tiers: [{ inputTokensAbove: 100, promptPerMTok: 5, completionPerMTok: 10, cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25 }] };
    const inclusive = endpoint === 'openai-compatible';
    replies = [40, 41].map((ordinary, index) => inclusive
      ? compatible({ prompt_tokens: ordinary + 60, completion_tokens: index === 0 ? 1_000_000 : 0,
        prompt_tokens_details: { cached_tokens: 60 } })
      : native({ input_tokens: ordinary, output_tokens: index === 0 ? 1_000_000 : 0,
        cache_read_input_tokens: 40, cache_creation_input_tokens: 20 }));
    const step = pricedStep(rates, endpoint);
    await send(step); await send(step);
    expect(requests).toHaveLength(2);
    const report = costModel(getSessionUsage(sessionId), []);
    expect(report.recordedTurns).toBe(2);
    expect(report.buckets).toHaveLength(2);
    const base = report.buckets.find(bucket => bucket.rates.promptPerMTok === 1);
    const tier = report.buckets.find(bucket => bucket.rates.promptPerMTok === 5);
    expect(base).toMatchObject({ rateBasis: 'captured', turnsCount: 1, promptTokens: 40, completionTokens: 1_000_000,
      cacheReadTokens: inclusive ? 60 : 40, cacheWriteTokens: inclusive ? 0 : 20,
      rates: { promptPerMTok: 1, completionPerMTok: 2, cacheReadPerMTok: 0.1, cacheWritePerMTok: 1.25 } });
    expect(tier).toMatchObject({ rateBasis: 'captured', turnsCount: 1, promptTokens: 41, completionTokens: 0,
      cacheReadTokens: inclusive ? 60 : 40, cacheWriteTokens: inclusive ? 0 : 20,
      rates: { promptPerMTok: 5, completionPerMTok: 10, cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25 } });
    expect(base?.estimate.usd).toBeCloseTo(inclusive ? 2.000046 : 2.000069, 10);
    expect(tier?.estimate.usd).toBeCloseTo(inclusive ? 0.000235 : 0.00035, 10);
  },
);

it('keeps two short requests at base prices even when their cumulative input exceeds the threshold', async () => {
  const rates = { promptPerMTok: 1, completionPerMTok: 2,
    tiers: [{ inputTokensAbove: 100, promptPerMTok: 5, completionPerMTok: 10 }] };
  replies = [compatible({ prompt_tokens: 60, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } }),
    compatible({ prompt_tokens: 60, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } })];
  const step = pricedStep(rates);
  await send(step); await send(step);
  const report = costModel(getSessionUsage(sessionId), []);
  expect(requests).toHaveLength(2);
  expect(report.buckets).toHaveLength(1);
  expect(report.buckets[0]).toMatchObject({ promptTokens: 120, turnsCount: 2, rates: { promptPerMTok: 1, completionPerMTok: 2 } });
  expect(report.estimate.usd).toBeCloseTo(0.00012, 10);
});

it('selects the highest unsorted tier and inherits missing rates only from the captured base', async () => {
  const rates = { promptPerMTok: 1, completionPerMTok: 2, cacheReadPerMTok: 0.1, cacheWritePerMTok: 1.25,
    tiers: [
      { inputTokensAbove: 200, promptPerMTok: 7, cacheReadPerMTok: 0 },
      { inputTokensAbove: 100, promptPerMTok: 3, completionPerMTok: 30, cacheReadPerMTok: 0.3, cacheWritePerMTok: 3.75 },
    ] };
  replies = [native({ input_tokens: 50, output_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 51 })];
  await send(pricedStep(rates, 'anthropic-messages'));
  const report = costModel(getSessionUsage(sessionId), []);
  expect(report.buckets).toHaveLength(1);
  expect(report.buckets[0]).toMatchObject({ rateBasis: 'captured',
    rates: { promptPerMTok: 7, completionPerMTok: 2, cacheReadPerMTok: 0, cacheWritePerMTok: 1.25 } });
  expect(report.estimate.usd).toBeCloseTo(0.00043375, 10);
});

it('keeps an in-flight request on its captured tier and inherited base when the original schedule changes', async () => {
  const tier = { inputTokensAbove: 100, promptPerMTok: 3, cacheReadPerMTok: 0.3 };
  const rates = { promptPerMTok: 1, completionPerMTok: 2, cacheReadPerMTok: 0.1, cacheWritePerMTok: 1.25, tiers: [tier] };
  replies = [0, 1].map(() => compatible({ prompt_tokens: 200, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 100 } }));
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  beforeReply = () => held;
  const step = pricedStep(rates);
  const pending = step([], undefined, {}, { allowTools: false });
  try {
    await vi.waitFor(() => expect(requests).toHaveLength(1), { timeout: 1500, interval: 10 });
    tier.promptPerMTok = 30; tier.cacheReadPerMTok = 3;
    rates.completionPerMTok = 20; rates.cacheWritePerMTok = 12.5;
  } finally { release(); }
  expect(await pending).toMatchObject({ stopReason: 'stop' });
  beforeReply = undefined;
  await send(step);
  const report = costModel(getSessionUsage(sessionId), []);
  expect(requests).toHaveLength(2);
  expect(report.buckets).toHaveLength(2);
  expect(report.buckets.find(bucket => bucket.rates.promptPerMTok === 3)).toMatchObject({ turnsCount: 1,
    rates: { promptPerMTok: 3, completionPerMTok: 2, cacheReadPerMTok: 0.3, cacheWritePerMTok: 1.25 } });
  expect(report.buckets.find(bucket => bucket.rates.promptPerMTok === 30)).toMatchObject({ turnsCount: 1,
    rates: { promptPerMTok: 30, completionPerMTok: 20, cacheReadPerMTok: 3, cacheWritePerMTok: 12.5 } });
  expect(report.estimate.usd).toBeCloseTo(0.003674, 10);
});

it.each(['anthropic-messages', 'copilot-messages'])(
  'retains usage with unknown tier prices when %s omits native cache input', async endpoint => {
    const rates = { promptPerMTok: 1, completionPerMTok: 2,
      tiers: [{ inputTokensAbove: 100, promptPerMTok: 5, completionPerMTok: 10 }] };
    replies = [native({ input_tokens: 200, output_tokens: 1, cache_read_input_tokens: 12 })];
    const result = await send(pricedStep(rates, endpoint));
    const usage = getSessionUsage(sessionId);
    expect(result.promptMeasurement).toBeUndefined();
    expect(usage.lastPromptTokens).toBeUndefined();
    expect(usage.recentRequests.at(-1)?.kind).toBe('usage-gap');
    const report = costModel(usage, []);
    expect(requests).toHaveLength(1);
    expect(report.buckets).toHaveLength(1);
    expect(report.buckets[0]).toMatchObject({ rateBasis: 'captured', rateSource: 'unknown', turnsCount: 1,
      promptTokens: 200, completionTokens: 1, cacheReadTokens: 12,
      rates: { promptPerMTok: null, completionPerMTok: null, cacheReadPerMTok: null, cacheWritePerMTok: null } });
    expect(report.estimate).toMatchObject({ usd: null, coverage: 'partial' });
  },
);

it('keeps tier prices unknown when Responses sanitizes an explicitly invalid cache count', async () => {
  const rates = { promptPerMTok: 1, completionPerMTok: 2, cacheReadPerMTok: 0.1,
    tiers: [{ inputTokensAbove: 100, promptPerMTok: 5, completionPerMTok: 10 }] };
  replies = [{ status: 'completed', model: 'meter', output: [{ id: 'answer', type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: 'Recorded.' }] }],
    usage: { input_tokens: 200, output_tokens: 1, input_tokens_details: { cached_tokens: -1 } } }];
  const result = await send(pricedStep(rates, 'openai-responses'));
  const usage = getSessionUsage(sessionId);
  expect(result.promptMeasurement).toBeUndefined();
  expect(usage.lastPromptTokens).toBeUndefined();
  expect(usage.recentRequests.at(-1)?.kind).toBe('usage-gap');
  const report = costModel(usage, []);
  expect(report.buckets[0]).toMatchObject({ rateBasis: 'captured', rateSource: 'unknown', promptTokens: 0,
    completionTokens: 1, totalTokens: 201, allocationIncomplete: true });
  expect(report.estimate).toMatchObject({ usd: null, coverage: 'partial' });
});

it('preserves usable models when the optional catalogue supplies invalid prices', async () => {
  const cost = { promptPerMTok: 1, tiers: [{ inputTokensAbove: 100 }, { inputTokensAbove: 100 }] };
  const file = userCatalogPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const original = JSON.stringify({ providers: { fixture: { runtime: 'openai-compatible', auth: 'none',
    endpoint: 'openai-compatible', baseUrl, models: [{ id: 'meter', contextWindow: 2_000_000, maxTokens: 4096, cost }] } } });
  fs.writeFileSync(file, original);
  const snapshot = loadCatalogSnapshot();
  replies = [compatible({ prompt_tokens: 101, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 0 } })];
  await send(pricedStep(cost, 'openai-compatible', { catalog: snapshot.providers }));
  expect(requests).toHaveLength(1);
  expect(costModel(getSessionUsage(sessionId), []).estimate).toMatchObject({ usd: null, coverage: 'partial' });
  expect(snapshot.diagnostics).toEqual([`${path.basename(file)} contains invalid prices; affected model prices are unavailable.`]);
  expect(fs.readFileSync(file, 'utf8')).toBe(original);
});

it('uses the metering mode from preparation when the endpoint declaration changes before reservation', async () => {
  const endpoint = `prepare-input-${sessionId}`;
  const protocol = { ...endpointShape('openai-compatible'), usageInput: undefined as 'inclusive' | 'exclusive' | undefined };
  declareEndpoint(endpoint, protocol);
  replies = [compatible({ prompt_tokens: 101, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 0 } })];
  const settle = vi.fn();
  const step = pricedStep({ promptPerMTok: 1, tiers: [{ inputTokensAbove: 100, promptPerMTok: 5 }] }, endpoint, {
    requestPolicy: { reserve: () => ({ id: 'prepared', dispatch() {}, confirmUnsent() {}, settle }) },
  });
  const result = await step([{ role: 'user', content: 'Measure this request.' }], undefined, {}, {
    allowTools: false, onPreparedContext: () => { protocol.usageInput = 'inclusive'; },
  });
  expect(result).toMatchObject({ text: 'Recorded.', stopReason: 'stop' });
  expect(requests).toHaveLength(1);
  expect(settle).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 101, outputTokens: 1, complete: false }));
  expect(costModel(getSessionUsage(sessionId), []).buckets[0]?.rateSource).toBe('unknown');
});

it('retains tier charges from legal usage on an HTTP 200 failed completion', async () => {
  const rates = { promptPerMTok: 1, completionPerMTok: 2, cacheReadPerMTok: 0.1, cacheWritePerMTok: 1.25,
    tiers: [{ inputTokensAbove: 100, promptPerMTok: 5, completionPerMTok: 10, cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25 }] };
  replies = [{ status: 'failed', model: 'meter', output: [], error: { code: 'server_error', message: 'Synthetic completion failure.' },
    usage: { input_tokens: 101, output_tokens: 3, input_tokens_details: { cached_tokens: 50 } } }];
  const result = await pricedStep(rates, 'openai-responses')([], undefined, {}, { allowTools: false });
  expect(result.stopReason).toBe('error');
  expect(requests).toHaveLength(1);
  const report = costModel(getSessionUsage(sessionId), []);
  expect(report.recordedTurns).toBe(1);
  expect(report.buckets[0]).toMatchObject({ rateBasis: 'captured', promptTokens: 51, completionTokens: 3, cacheReadTokens: 50,
    rates: { promptPerMTok: 5, completionPerMTok: 10, cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25 } });
  expect(report.estimate.usd).toBeCloseTo(0.00031, 10);
});

it.each(['missing-native', 'inclusive-top-level'] as const)('uses the captured input qualification before arming cache warming for %s', async scenario => {
  const missing = scenario === 'missing-native';
  replies = [missing ? native({ input_tokens: 100_000, output_tokens: 1 }) : compatible({
    prompt_tokens: 200_000, completion_tokens: 1, cache_read_input_tokens: 50_000,
  })];
  const noteRequest = vi.fn();
  const store = new InMemoryTraceStore();
  const request = createTurnRequest({ sessionId, maxSteps: 3,
    step: pricedStep({ promptPerMTok: 1, completionPerMTok: 2, cacheReadPerMTok: 0.1,
      tiers: [{ inputTokensAbove: 200_000, promptPerMTok: 5 }] }, missing ? 'anthropic-messages' : 'openai-compatible'),
    cacheWarming: { noteRequest, noteSettled() {}, stop() {}, async reset() { return 'reset'; }, status() { return { mode: 'streaming' }; } },
  }, { stepCount: 0 }, new EventChannel<QueryEvent>());
  const result = await runTraceScope(store, { sessionId, workspaceRoot: workspace }, { name: 'session.run' }, () =>
    request([{ role: 'user', content: 'Measure the input.' }], undefined, {}));
  expect(result).toMatchObject({ stopReason: 'stop' });
  expect(requests).toHaveLength(1);
  const span = store.snapshot().find(entry => entry.name === 'provider.request')!;
  if (missing) {
    expect(noteRequest).not.toHaveBeenCalled();
    expect(span.attributes.usage).toBe('partial');
    expect(span.attributes.inputCount).toBeUndefined();
  } else {
    expect(noteRequest).toHaveBeenCalledWith(200_000, expect.any(Object));
    expect(span.attributes.inputCount).toBe(200_000);
  }
});

it('preserves a captured unknown input mode when a retained endpoint changes after dispatch', async () => {
  const endpoint = `unknown-input-${sessionId}`;
  const protocol = { ...endpointShape('openai-compatible'), usageInput: undefined as 'inclusive' | 'exclusive' | undefined };
  declareEndpoint(endpoint, protocol);
  replies = [compatible({ prompt_tokens: 101, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 0 } })];
  beforeReply = async () => { protocol.usageInput = 'inclusive'; };
  const noteRequest = vi.fn(), store = new InMemoryTraceStore();
  const request = createTurnRequest({ sessionId, maxSteps: 3, step: pricedStep({ promptPerMTok: 1, completionPerMTok: 2,
    tiers: [{ inputTokensAbove: 100, promptPerMTok: 5 }] }, endpoint),
    cacheWarming: { noteRequest, noteSettled() {}, stop() {}, async reset() { return 'reset'; }, status() { return { mode: 'streaming' }; } },
  }, { stepCount: 0 }, new EventChannel<QueryEvent>());
  expect(await runTraceScope(store, { sessionId, workspaceRoot: workspace }, { name: 'session.run' }, () =>
    request([], undefined, {}))).toMatchObject({ stopReason: 'stop' });
  expect(requests).toHaveLength(1);
  expect(noteRequest).not.toHaveBeenCalled();
  expect(store.snapshot().find(entry => entry.name === 'provider.request')?.attributes).toMatchObject({ usage: 'partial' });
  expect(costModel(getSessionUsage(sessionId), []).buckets[0]?.rateSource).toBe('unknown');
});
