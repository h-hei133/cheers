import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import type { CatalogProvider } from '../core/models/catalog.js';
import { costModel } from '../core/commands/cost/model.js';
import { getSessionUsage, recordSessionUsage, resetSessionUsage, totalTokens } from '../observability/usageTelemetry.js';
import { createStepFunction } from './step.js';
import { ModelAdmissionError } from '../core/agent/request/model.js';

const sessionId = 'actual-relay-accounting';
let server: http.Server | undefined;
afterEach(async () => {
  resetSessionUsage(sessionId);
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
});

it.each(['success', 'missing-usage', 'http-error', 'malformed', 'cancel'])('keeps the parent context intact across a delegated %s request', async scenario => {
  recordSessionUsage(sessionId, { provider: 'openai', model: 'same', promptTokens: 9000, promptMessageCount: 0,
    promptIdentity: { provider: 'openai', model: 'same', endpoint: 'openai-compatible' } });
  const foreground = structuredClone(getSessionUsage(sessionId));
  const received: string[] = [];
  server = http.createServer((request, response) => {
    received.push(request.url!); request.resume();
    response.writeHead(scenario === 'http-error' ? 503 : 200, { 'content-type': 'application/json' });
    if (scenario === 'cancel') { response.flushHeaders(); return; }
    response.end(scenario === 'malformed' ? '{' : JSON.stringify({ choices: [{ message: { content: 'auxiliary answer' }, finish_reason: 'stop' }],
      ...(scenario === 'success' ? { usage: { prompt_tokens: 10, completion_tokens: 2 } } : {}) }));
  });
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const step = createStepFunction({ provider: { headers: {}, provider: 'openai', model: 'same', baseUrl },
    workspaceRoot: process.cwd(), sessionId, systemPrompt: '', tools: [], contextWindow: 1000, reserveTokens: 0, maxOutputTokens: 10,
    catalog: [{ id: 'openai', baseUrl, models: [{ id: 'same', contextWindow: 1000, maxTokens: 10, cost: { promptPerMTok: 2, completionPerMTok: 4 } }] }],
    retry: { enabled: false } });
  const controller = new AbortController();
  let accepted!: () => void; const headers = new Promise<void>(resolve => { accepted = resolve; });
  const pending = step([{ role: 'user', content: 'independent prompt' }], controller.signal, {}, { allowTools: false, agentMode: 'plan', onRequestSent: accepted });
  if (scenario === 'cancel') {
    await headers;
    expect(getSessionUsage(sessionId).lastPromptTokens).toBe(9000);
    controller.abort();
  }
  const result = await pending;
  expect(result.stopReason).toBe(scenario === 'success' || scenario === 'missing-usage' ? 'stop' : scenario === 'cancel' ? 'aborted' : 'error');
  expect(received).toHaveLength(1);
  expect(getSessionUsage(sessionId)).toMatchObject({ lastPromptTokens: 9000, lastPromptMessageCount: 0,
    lastPromptIdentity: foreground.lastPromptIdentity, lastBucketKey: foreground.lastBucketKey, recentRequests: foreground.recentRequests });
  expect(totalTokens(getSessionUsage(sessionId))).toBe(scenario === 'success' ? 9012 : 9000);
});

it('retains foreground billing when reported usage breaches the reserved budget', async () => {
  const step = createStepFunction({ provider: { headers: {}, provider: 'fixture', model: 'm', baseUrl: 'https://provider.invalid' },
    workspaceRoot: process.cwd(), sessionId, systemPrompt: '', tools: [],
    fetchImpl: (async () => Response.json({ choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 2 } })) as typeof fetch,
    requestPolicy: { reserve: () => ({ id: 'fixture', dispatch() {}, confirmUnsent() {}, settle() { throw new ModelAdmissionError('breach', 'persisted'); } }) },
  });
  const result = await step([], undefined, {}, { allowTools: false });
  expect(result).toMatchObject({ stopReason: 'error', admissionFailure: 'breach' });
  expect(totalTokens(getSessionUsage(sessionId))).toBe(12);
  expect(getSessionUsage(sessionId).turnsCount).toBe(1);
});

it('attributes late HTTP responses to the exact relay and prices captured before dispatch', async () => {
  const observed: string[] = [];
  let arrived!: () => void;
  const incoming = new Promise<void>(resolve => { arrived = resolve; });
  let finish!: () => void;
  const release = new Promise<void>(resolve => { finish = resolve; });
  server = http.createServer(async (request, response) => {
    observed.push(request.url!);
    request.resume();
    if (observed.length === 1) { arrived(); await release; }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } }));
  });
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const firstPrice = { promptPerMTok: 1, completionPerMTok: 2 };
  const secondPrice = { promptPerMTok: 3, completionPerMTok: 4 };
  const catalog: CatalogProvider[] = [
    { id: 'relay-a', runtime: 'openai', label: 'A', baseUrl: `${origin}/a`, models: [{ id: 'same', cost: firstPrice }] },
    { id: 'relay-b', runtime: 'openai', label: 'B', baseUrl: `${origin}/b`, models: [{ id: 'same', cost: secondPrice }] },
  ];
  const step = (suffix: string) => createStepFunction({ provider: { headers: {}, provider: 'openai', model: 'same', baseUrl: `${origin}/${suffix}` },
    workspaceRoot: process.cwd(), sessionId, systemPrompt: '', tools: [], catalog });
  const pending = step('a')([], undefined, {}, { allowTools: false });
  await incoming;
  firstPrice.promptPerMTok = 99;
  expect(await step('b')([], undefined, {}, { allowTools: false })).toMatchObject({ stopReason: 'stop' });
  finish();
  expect(await pending).toMatchObject({ stopReason: 'stop' });
  const result = costModel(getSessionUsage(sessionId), catalog);
  expect(observed).toEqual(['/a/chat/completions', '/b/chat/completions']);
  expect(result.buckets).toHaveLength(2);
  expect(result.buckets.map(bucket => bucket.rates.promptPerMTok).sort()).toEqual([1, 3]);
  expect(result.estimate.usd).toBe(4);
});
