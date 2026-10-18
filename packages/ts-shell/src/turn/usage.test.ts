import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import type { CatalogProvider } from '../core/models/catalog.js';
import { costModel } from '../core/commands/cost/model.js';
import { getSessionUsage, resetSessionUsage } from '../observability/usageTelemetry.js';
import { createStepFunction } from './step.js';

const sessionId = 'actual-relay-accounting';
let server: http.Server | undefined;
afterEach(async () => {
  resetSessionUsage(sessionId);
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
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
