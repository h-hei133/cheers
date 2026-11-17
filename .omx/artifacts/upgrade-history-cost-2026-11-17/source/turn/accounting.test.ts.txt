import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runCostCommand } from '../core/commands/costCommandRuntime.js';
import type { CatalogProvider } from '../core/models/catalog.js';
import type { QueryEvent } from '../core/query/runtime/events.js';
import { turnCacheMissNotice } from '../observability/cacheWaste.js';
import { getSessionUsage, resetSessionUsage } from '../observability/usageTelemetry.js';
import { SessionManager } from '../session/SessionManager.js';
import { writeSessionUsage } from '../session/store/usage.js';
import type { ProviderUsage } from './completion.js';
import { createTurnRequest } from './request.js';
import { createStepFunction } from './step.js';
import { EventChannel } from './stream.js';

let workspace: string;
let sessionId: string;
let server: http.Server | undefined;

beforeEach(() => {
  const root = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(root, { recursive: true });
  workspace = fs.mkdtempSync(path.join(root, 'accounting-'));
  sessionId = path.basename(workspace);
  vi.stubEnv('HOME', workspace); vi.stubEnv('USERPROFILE', workspace); vi.stubEnv('CHEERS_TEST_ROOT', workspace);
  resetSessionUsage(sessionId);
});

afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server!.close(() => resolve()));
    server = undefined;
  }
  resetSessionUsage(sessionId);
  vi.unstubAllEnvs();
  fs.rmSync(workspace, { recursive: true, force: true });
});

it.each([
  { name: 'omitted reads', usage: { prompt_tokens: 12_000, completion_tokens: 1 }, read: false, writes: 0, extra: undefined },
  { name: 'measured zero', usage: { prompt_tokens: 12_000, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 0 } }, read: true, writes: 0, extra: 0.009 },
  { name: 'write-only evidence', usage: { prompt_tokens: 0, completion_tokens: 1, cache_creation_input_tokens: 10_000 }, read: false, writes: 10_000, extra: undefined },
  { name: 'measured mixed writes', usage: { prompt_tokens: 2_000, completion_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 8_000 }, read: true, writes: 8_000, extra: 0.011 },
  { name: 'unpriced writes', usage: { prompt_tokens: 0, completion_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 10_000 }, read: true, writes: 10_000, extra: undefined, unpriced: true },
] satisfies { name: string; usage: ProviderUsage; read: boolean; writes: number; extra: number | undefined; unpriced?: boolean }[])(
  'retains $name through dispatched requests, durable state and the cost command', async scenario => {
    const usages: ProviderUsage[] = [
      { prompt_tokens: 10_000, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 8_000 } }, scenario.usage,
    ];
    let posts = 0;
    server = http.createServer(async (request, response) => {
      for await (const _chunk of request) { /* Consume the actual request before replying. */ }
      if (request.method !== 'POST') { response.writeHead(405); response.end(); return; }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: 'Recorded.' }, finish_reason: 'stop' }], usage: usages[posts++] }));
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
    const prices = { promptPerMTok: 1, completionPerMTok: 2, cacheReadPerMTok: 0.1,
      ...(!('unpriced' in scenario && scenario.unpriced) ? { cacheWritePerMTok: 1.25 } : {}) };
    const catalog: CatalogProvider[] = [{ id: 'fixture', runtime: 'openai', endpoint: 'openai-compatible', baseUrl,
      models: [{ id: 'meter', cost: prices }] }];
    const manager = new SessionManager(); manager.createNewWithId(sessionId, workspace);
    const step = createStepFunction({ provider: { provider: 'openai', model: 'meter', baseUrl, headers: {} },
      workspaceRoot: workspace, sessionId, systemPrompt: '', tools: [], catalog, retry: { enabled: false } });
    const request = createTurnRequest({ step, sessionId, maxSteps: 3 }, { stepCount: 0 }, new EventChannel<QueryEvent>());
    for (let turn = 0; turn < 2; turn++) {
      const result = await request([{ role: 'user', content: `Measure request ${turn}.` }], undefined, { requestId: String(turn) });
      expect(result).toMatchObject({ text: 'Recorded.', stopReason: 'stop' });
    }
    expect(posts).toBe(2);
    expect(getSessionUsage(sessionId).recentRequests.at(-1)).toMatchObject({ kind: 'request',
      cacheReadReported: scenario.read, cacheWriteTokens: scenario.writes });
    writeSessionUsage(sessionId);
    const saved = new SessionManager().resume(sessionId, workspace).usage!;
    expect(saved.recentRequests).toEqual(getSessionUsage(sessionId).recentRequests);
    const result = await runCostCommand([], { cwd: workspace, sessionId,
      readConfiguration: () => ({ catalog: [], config: {} as never }) });
    const cache = result.report!.facts.cache as { usage: { requestCount: number }; waste: { totals: { missedCost: number; missCount: number } } };
    expect(cache.usage.requestCount).toBe(scenario.read ? 2 : 1);
    const notice = turnCacheMissNotice(saved.recentRequests, () => undefined);
    if (scenario.extra === undefined) {
      expect(cache.waste.totals.missCount).toBe(0);
      expect(notice).toBeUndefined();
    } else {
      expect(cache.waste.totals).toMatchObject({ missCount: 1 });
      expect(cache.waste.totals.missedCost).toBeCloseTo(scenario.extra, 8);
      expect(notice).toContain('Estimated cache miss');
      expect(result.output).toContain('estimated overlap');
    }
  },
);
