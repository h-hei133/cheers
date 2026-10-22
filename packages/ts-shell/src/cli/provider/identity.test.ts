import http from 'node:http';
import { createHash } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { runBtwCommand } from '../../core/commands/btwCommandRuntime.js';
import type { CatalogProvider } from '../../core/models/catalog.js';
import type { PreparedRequest, RequestPolicy } from '../../core/agent/request/model.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { writeGoal, readGoalEdit } from '../../planning/goal/store.js';
import { goalRequestPolicy } from '../../planning/goal/budget.js';
import { resetCredentialBackoffForTests } from '../../provider/request/backoff.js';
import { createProviderStep, delegatedSteps, type ProviderStepHost } from './step.js';
import { requestCompactionSummary } from '../../core/query/compaction/summarize.js';
import { sendSentRequest } from '../../provider/request/sentRequest.js';

const servers: http.Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  resetCredentialBackoffForTests();
  cleanupAdvisorHarnesses();
});

async function wire() {
  const requests: { readonly owner: string; readonly body: unknown }[] = [];
  let started!: () => void;
  const firstRequest = new Promise<void>(resolve => { started = resolve; });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const first = requests.length === 0;
    requests.push({ owner: request.url!, body: JSON.parse(Buffer.concat(chunks).toString()) });
    if (first) { started(); await held; }
    response.writeHead(first ? 429 : 200, { 'content-type': 'application/json', 'retry-after': '60' });
    response.end(first ? '{}' : JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Identity fixture answer' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 } }));
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture address unavailable');
  return { requests, firstRequest, release, baseUrl: `http://127.0.0.1:${address.port}` };
}

function observingPolicy(current: RequestPolicy, reserved: PreparedRequest[]): RequestPolicy {
  return { ...current,
    reserve: request => { reserved.push(request); return current.reserve(request); },
    ...(current.withAdmission ? { withAdmission: (admit: () => void) => observingPolicy(current.withAdmission!(admit), reserved) } : {}),
    ...(current.withCompletionReserve ? { withCompletionReserve: (tokens: () => number) =>
      observingPolicy(current.withCompletionReserve!(tokens), reserved) } : {}) };
}

it.each(['main', 'delegated', 'side'] as const)('%s attributes requests and late 429s to the captured credential generation', async kind => {
  const setup = createAdvisorHarness(false, false);
  writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'set', objective: 'Captured request identity' });
  const fixture = await wire();
  const reserved: PreparedRequest[] = [];
  const policy = goalRequestPolicy(setup.manager, setup.session)!;
  const requestPolicy = observingPolicy(policy, reserved);
  const catalog: readonly CatalogProvider[] = [{ id: 'openai', label: 'Fixture', runtime: 'openai', auth: 'api-key',
    endpoint: 'openai-compatible', baseUrl: fixture.baseUrl, models: [{ id: 'fixture', contextWindow: 10000, maxTokens: 10 }] }];
  const send = async (owner: 'a' | 'b', apiKey = `synthetic-${owner}`) => {
    const config = { ...getRuntimeConfig(setup.root), provider: 'openai' as const, activeProviderConnectionId: owner,
      sessionConnection: { id: owner, provider: 'openai' as const }, maxOutputTokens: 10, reserveTokens: 0,
      retryEnabled: false, providerRetryMaxRetries: 0, providerConnections: ['a', 'b'].map(id => ({ id, label: id,
        provider: 'openai' as const, authType: 'api-key' as const, status: 'connected' as const, model: 'fixture',
        apiKey: id === owner ? apiKey : `synthetic-${id}`, baseUrl: `${fixture.baseUrl}/${id}/v1`, createdAt: '2026-01-01', updatedAt: '2026-01-01' })) };
    const resolution = resolveProviderCredential({ runtimeConfig: config, env: {} });
    if (kind === 'side') return (await runBtwCommand(['Identity fixture'], { cwd: setup.root, sessionId: setup.session.id,
      runtimeConfig: config, readConfiguration: () => ({ config, catalog }) as never, resolveConfigTarget: () => resolution, requestPolicy })).output;
    const request: ProviderStepHost = { providerMode: 'real', providerCredentialResolution: resolution, runtimeConfig: config,
      providerCatalog: catalog, agentMode: 'build', workspaceRoot: setup.root, sessionId: setup.session.id, requestPolicy };
    const step = kind === 'main' ? createProviderStep(request, new Map(), {})
      : delegatedSteps(request, new Map(), {})({ connectionId: owner, provider: 'openai', model: 'fixture' });
    return (await step([{ role: 'user', content: 'Identity fixture' }], setup.signal, {},
      { allowTools: false, ...(kind === 'delegated' ? { agentMode: 'plan' as const } : {}) })).text;
  };

  const late = send('a');
  await fixture.firstRequest;
  expect(await send('b')).toContain('Identity fixture answer');
  fixture.release();
  expect(await late).not.toContain('Identity fixture answer');
  expect(await send('a')).not.toContain('Identity fixture answer');
  expect(fixture.requests).toHaveLength(2);
  expect(await send('b')).toContain('Identity fixture answer');
  expect(await send('a', 'synthetic-a-rotated')).toContain('Identity fixture answer');
  expect(fixture.requests.map(request => request.owner)).toEqual(['/a/v1/chat/completions', '/b/v1/chat/completions', '/b/v1/chat/completions', '/a/v1/chat/completions']);
  const generation = (key: string) => createHash('sha256').update(key).digest('hex').slice(0, 16);
  expect(reserved.map(request => [request.credentialId, request.credentialGeneration, request.purpose])).toEqual(
    [['a', 'synthetic-a'], ['b', 'synthetic-b'], ['b', 'synthetic-b'], ['a', 'synthetic-a-rotated']]
      .map(([id, key]) => [`openai:${id}`, generation(key!), kind === 'side' ? 'side-question' : kind === 'delegated' ? 'subagent' : 'turn']));
  const ledger = decodeRequestLedger(readBoundSessionState(setup.manager, setup.session).state.requestLedger)!;
  const scope = ledger.scopes[readGoalEdit(setup.manager, setup.session).goal!.id]!;
  expect(scope).toMatchObject({ inputTokens: 12, outputTokens: 3 });
  expect(Object.values(scope.pending)).toMatchObject([{ credentialId: 'openai:a', credentialGeneration: generation('synthetic-a'), dispatched: true }]);
});

it.each(['summary', 'cache'] as const)('%s requests retain the captured credential and purpose', async kind => {
  const setup = createAdvisorHarness(false, false);
  writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'set', objective: 'Auxiliary attribution' });
  const reserved: PreparedRequest[] = [];
  const requestPolicy = observingPolicy(goalRequestPolicy(setup.manager, setup.session)!, reserved);
  const generation = createHash('sha256').update('synthetic-fixture').digest('hex').slice(0, 16);
  const fetchImpl = (async () => Response.json({ choices: [{ message: { content: kind === 'summary' ? 'summary' : 'answer' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 4, completion_tokens: 1 } })) as typeof fetch;
  if (kind === 'summary') {
    await requestCompactionSummary({ provider: { headers: {}, baseUrl: 'https://provider.invalid', model: 'fixture',
      providerId: 'openai', credentialId: 'openai:fixture', credentialGeneration: generation },
      messages: [{ role: 'user', content: 'summarize' }], fetchImpl, requestPolicy });
  } else {
    await sendSentRequest({ url: 'https://provider.invalid/chat/completions', headers: {},
      body: '{"messages":[],"max_tokens":4096}', endpoint: 'openai-compatible' }, undefined, fetchImpl, {
      provider: 'openai', model: 'fixture', policy: requestPolicy,
      credential: { credentialId: 'openai:fixture', generation },
    });
  }
  expect(reserved).toHaveLength(1);
  expect(reserved[0]).toMatchObject({ credentialId: 'openai:fixture', credentialGeneration: generation,
    purpose: kind === 'summary' ? 'compaction' : 'cache-refresh' });
  const scope = decodeRequestLedger(readBoundSessionState(setup.manager, setup.session).state.requestLedger)!
    .scopes[readGoalEdit(setup.manager, setup.session).goal!.id]!;
  expect(scope).toMatchObject({ inputTokens: 4, outputTokens: 1, pending: {} });
});
