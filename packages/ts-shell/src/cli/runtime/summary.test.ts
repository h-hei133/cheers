import { accountWire, accountCompletion } from '../../test-utils/account.js';
import { accountToken, observeOAuthRenewal } from '../../test-utils/oauth.js';
import fs from 'node:fs';
import http from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../config/runtimeConfig.js';
import { ConfigState } from '../../config/state.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { loadCatalog, writeCatalogCache } from '../../core/models/catalogStore.js';
import { runModelPresetCommand } from '../../core/commands/model/presetCommand.js';
import { projectSessionModel } from '../../session/model/projection.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../session/model/state.js';
import { condenseContext } from '../../session/compaction.js';
import { createCliSessionRuntime } from './cliSessionRuntimeFactory.js';
import type { SessionRuntimeDependencies } from '../../core/shell/sessionRuntime.js';
import type { CliRuntimeInvocationInput } from '../../entrypoints/cliRuntimeInvocation.js';
import type { CompactionSetup } from '../../turn/session.js';
import { readGoalEdit, writeGoal } from '../../planning/goal/store.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import * as attempts from '../../provider/request/attempt.js';
import { credentialIdentityFor } from '../../core/auth/account/pool.js';
import { compactionOperationsPath } from '../../session/compactionOperation.js';
import { getSessionUsage, recordSessionUsage, totalTokens } from '../../observability/usageTelemetry.js';
import { costModel } from '../../core/commands/cost/model.js';
import { modelPicker } from '../interactive/picker/model.js';

const observed = vi.hoisted(() => ({ deps: undefined as SessionRuntimeDependencies | undefined, compaction: undefined as CompactionSetup | undefined }));
// Exercise the production composition and real summary engine without starting UI/scheduling loops.
vi.mock('./goalScheduling.js', () => ({ installGoalScheduler: () => undefined, schedulerForContext: () => undefined }));
vi.mock('../../core/shell/sessionRuntime.js', () => ({ ShellSessionRuntime: class {
  constructor(deps: SessionRuntimeDependencies) { observed.deps = deps; }
  getPermissionScope() { return 'ask'; }
  getAgentMode() { return 'plan'; }
  getCurrentRunController() { return null; }
} }));
vi.mock('./cliRuntimeInvocationBridge.js', () => ({ streamCliRuntimePrompt: (input: CliRuntimeInvocationInput) => {
  observed.compaction = input.prepareProviderResources?.(input.providerCredentialResolution).compaction;
  return { events: [] };
} }));
const servers: http.Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  cleanupAdvisorHarnesses();
});

async function fixture(summaryModel = 'namespace/summary') {
  const setup = createAdvisorHarness(false, false);
  vi.stubEnv('OPENAI_API_KEY', '');
  const requests: Array<{ path: string; credential?: string; model: string; effort?: string; messages: unknown[]; body: Record<string, unknown> }> = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({ path: request.url!, credential: request.headers.authorization, model: body.model, effort: body.reasoning_effort, messages: body.messages, body });
    if (body.stream === true && Array.isArray(body.input)) {
      response.writeHead(200, { 'content-type': 'text/event-stream' }); response.end(accountCompletion('Summary fixture answer')); return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Condensed fixture history.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 } }));
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'a', maxOutputTokens: 100, reserveTokens: 100,
    contextWindow: 4000, cacheWarming: 'off', retryEnabled: false,
    modelTokenBudgets: { 'openai/main': { keepRecentTokens: 100 } },
    providerConnections: ['a', 'b'].map(id => ({ id, provider: 'openai', authType: 'api-key', apiKey: `synthetic-${id}`,
      model: 'main', baseUrl: `http://127.0.0.1:${address.port}/${id}/v1`, status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01' })) },
  readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache([{ id: 'openai', models: [{ id: 'main', reasoning: true, contextWindow: 4000, maxTokens: 100 },
    { id: summaryModel, reasoning: true, contextWindow: 32000, maxTokens: 100, cost: { promptPerMTok: 2, completionPerMTok: 4 } }] }]);
  const context = { cwd: setup.root, projectRoot: setup.root, sessionId: setup.session.id };
  expect((await runModelPresetCommand(['save', 'work', '--profile', 'default=a/main@low', `summary=b/${summaryModel}@high`], context)).output).toContain('saved');
  expect((await runModelPresetCommand(['apply', 'work', '--all'], context)).output).toContain('all roles applied');
  for (let index = 0; index < 12; index++) {
    if (index % 2 === 0) setup.manager.persistUserPromptBarrier(setup.session.id, `${index}:${'x'.repeat(2000)}`);
    else setup.manager.addTurn(setup.session.id, { role: 'assistant', content: `${index}:${'y'.repeat(2000)}` });
  }
  return { ...setup, requests, context };
}

function runtime(setup: Awaited<ReturnType<typeof fixture>>) {
  const config = projectSessionModel(getRuntimeConfig(setup.root), setup.session.id);
  const identity = { projectRoot: setup.root, session: setup.session };
  const configuration = new ConfigState(config, configurationBinding(identity), loadCatalog());
  const context = { ...identity, cwd: setup.root, configuration, get runtimeConfig() { return configuration.current.config; } };
  createCliSessionRuntime({ runtimeContext: context, sessionManager: setup.manager,
    providerRuntimeBridge: { resolveCredentialSnapshot: () => resolveProviderCredential({ runtimeConfig: context.runtimeConfig, env: {} }) },
    renderer: { renderLine: vi.fn(), emit: vi.fn() }, options: {}, approvalTrustPolicy: {},
    approvalModeState: { get: () => undefined }, getReadline: () => null,
  } as never);
  return { deps: observed.deps!, context };
}

it.each([false, true])('uses the exact relay request shape for summaries (independent role: %s)', async role => {
  const setup = await fixture();
  if (!role) {
    const edit = readSessionModelEdit(setup.session.id);
    writeSessionModel(setup.session.id, { ...edit.selection!, roles: undefined }, edit);
  }
  const config = getRuntimeConfig(setup.root);
  const connection = config.providerConnections.find(item => item.id === (role ? 'b' : 'a'))!;
  writeCatalogCache([...loadCatalog(), { id: 'relay-summary', label: 'Summary relay', runtime: 'openai', auth: 'api-key', baseUrl: connection.baseUrl,
    models: [{ id: role ? 'namespace/summary' : 'main', contextWindow: 32000, maxTokens: 100, reasoning: true,
      thinkingLevelMap: { high: 'strong' }, compat: { maxTokensField: 'max_completion_tokens', systemRole: 'developer', supportsTemperature: false } }] }]);
  const { deps } = runtime(setup);
  expect(await deps.summarizeAbandonedTurns!(setup.manager.getSession(setup.session.id)!.turns)).toContain('Condensed fixture history.');
  expect(setup.requests).toHaveLength(1);
  expect(setup.requests[0]).toMatchObject({ path: `/${role ? 'b' : 'a'}/v1/chat/completions`, body: { max_completion_tokens: 100 } });
  expect(setup.requests[0].body).not.toHaveProperty('max_tokens');
  expect(setup.requests[0].body).not.toHaveProperty('temperature');
  if (role) expect(setup.requests[0].effort).toBe('strong');
});

it.each([false, true])('refuses duplicate relay claims before compaction sends (independent role: %s)', async role => {
  const setup = await fixture();
  if (!role) {
    const edit = readSessionModelEdit(setup.session.id);
    writeSessionModel(setup.session.id, { ...edit.selection!, roles: undefined }, edit);
  }
  const connection = getRuntimeConfig(setup.root).providerConnections.find(item => item.id === (role ? 'b' : 'a'))!;
  writeCatalogCache([...loadCatalog(), ...['alias-one', 'alias-two'].map(id => ({ id, label: id, runtime: 'openai' as const, auth: 'api-key' as const,
    baseUrl: connection.baseUrl, models: [{ id: role ? 'namespace/summary' : 'main', contextWindow: 32000, maxTokens: 100, reasoning: true }] }))]);
  const { deps } = runtime(setup);
  const before = structuredClone(setup.manager.getSession(setup.session.id)!.turns);
  const result = await Promise.resolve().then(() => deps.compactHistory!(setup.session.id, setup.signal)).catch(() => ({ status: 'failed' }));
  expect(result).toMatchObject({ status: 'failed' });
  expect(setup.requests).toHaveLength(0);
  expect(setup.manager.getSession(setup.session.id)!.turns).toEqual(before);
});

it.each(['manual', 'automatic', 'branch', 'prefix'])('routes %s summaries to the exact role while preserving the main window and shared ledger', async kind => {
  const setup = await fixture(); const global = fs.readFileSync(getUserRuntimeConfigPath());
  recordSessionUsage(setup.session.id, { provider: 'openai', model: 'main', promptTokens: 400, completionTokens: 1 });
  const history = structuredClone(getSessionUsage(setup.session.id).recentRequests);
  const { deps } = runtime(setup);
  const prepare = vi.spyOn(attempts, 'prepareRequestAttempt');
  writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'set', objective: 'Condense fixture' });
  const messages = setup.manager.getSession(setup.session.id)!.turns;
  if (kind === 'manual') expect(await deps.compactHistory!(setup.session.id, setup.signal)).toMatchObject({ status: 'compacted' });
  else if (kind === 'branch') expect(await deps.summarizeAbandonedTurns!(messages)).toContain('Condensed fixture history.');
  else {
    deps.runPrompt('Continue', setup.signal);
    const compaction = observed.compaction!;
    expect(compaction.policy.contextWindow).toBe(4000);
    expect(compaction.policy.keepRecentTokens).toBe(100);
    if (kind === 'prefix') expect(await compaction.summarizeTurnPrefix!(messages, setup.signal)).toContain('Condensed fixture history.');
    else expect(await condenseContext({ messages, ...compaction, signal: setup.signal, operation: { sessionId: setup.session.id } })).toMatchObject({ status: 'condensed' });
  }
  const count = kind === 'manual' || kind === 'automatic' ? 2 : 1;
  expect(setup.requests).toHaveLength(count);
  for (const request of setup.requests) expect(request).toMatchObject({ path: '/b/v1/chat/completions', model: 'namespace/summary', effort: 'high', credential: 'Bearer synthetic-b' });
  const credential = credentialIdentityFor('openai', { connectionId: 'b', apiKey: 'synthetic-b' });
  expect(prepare.mock.calls.map(([request]) => request.credential)).toEqual(Array.from({ length: count }, () => credential));
  const goal = readGoalEdit(setup.manager, setup.session).goal!.id;
  expect(decodeRequestLedger(readBoundSessionState(setup.manager, setup.session).state.requestLedger)!.scopes[goal]).toMatchObject({ inputTokens: 4 * count, outputTokens: count, pending: {} });
  expect(readSessionModel(setup.session.id)).toMatchObject({ connectionId: 'a', model: 'main', roles: { summary: { connectionId: 'b', thinkingEffort: 'high' } } });
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
  expect(totalTokens(getSessionUsage(setup.session.id))).toBe(401 + 5 * count);
  const saved = readBoundSessionState(setup.manager, setup.session).state.usage!;
  expect(Object.values(saved.byModel).find(bucket => bucket.attribution?.model === 'namespace/summary'))
    .toMatchObject({ attribution: { provider: 'openai', rates: { promptPerMTok: 2, completionPerMTok: 4 } },
      promptTokens: 4 * count, completionTokens: count, turnsCount: count });
  expect(costModel(getSessionUsage(setup.session.id), []).buckets.find(bucket => bucket.model === 'namespace/summary')?.estimate.usd)
    .toBeCloseTo(0.000012 * count);
  if (kind !== 'manual') {
    expect(getSessionUsage(setup.session.id).lastPromptTokens).toBe(400);
    expect(getSessionUsage(setup.session.id).recentRequests).toEqual(history);
  }
});

it.each(['deleted', 'provider-reused', 'scope', 'effort', 'window', 'output', 'thinking-output'])('refuses a %s summary target without sending to the parent or changing history', async change => {
  const setup = await fixture(); const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  if (['effort', 'window', 'output', 'thinking-output'].includes(change)) {
    const catalog = loadCatalog().map(provider => ({ ...provider,
      ...(change === 'thinking-output' ? { endpoint: 'anthropic-messages' } : {}),
      models: provider.models.map(model => model.id === 'namespace/summary'
      ? { ...model, ...(change === 'effort' ? { reasoning: false } : change === 'window' ? { contextWindow: 500 } : change === 'output' ? { maxTokens: 50 } : {}) } : model) }));
    writeCatalogCache(catalog);
  } else writeUserRuntimeConfigFile({ ...edit.values,
    ...(change === 'scope' ? { allowedModels: ['openai/main'] } : {}),
    providerConnections: change === 'deleted' ? edit.values.providerConnections!.filter(item => item.id !== 'b')
      : edit.values.providerConnections!.map(item => item.id === 'b' && change === 'provider-reused' ? { ...item, provider: 'google' as const } : item),
  }, edit);
  const { deps } = runtime(setup); const before = structuredClone(setup.manager.getSession(setup.session.id)!.turns);
  const result = await Promise.resolve().then(() => deps.compactHistory!(setup.session.id, setup.signal)).catch(() => ({ status: 'failed' }));
  expect(result).toMatchObject({ status: 'failed' });
  expect(setup.requests).toEqual([]);
  expect(setup.manager.getSession(setup.session.id)!.turns).toEqual(before);
  if (change === 'window') {
    expect(fs.existsSync(compactionOperationsPath(setup.session.id))).toBe(false);
    expect(await deps.compactHistory!(setup.session.id, setup.signal)).toMatchObject({ status: 'failed', reason: expect.stringContaining('Summary request refused') });
    expect(setup.requests).toEqual([]);
  }
});

it('does not reuse a completed summary after the role effort changes', async () => {
  const setup = await fixture(); const messages = setup.manager.getSession(setup.session.id)!.turns;
  runtime(setup).deps.runPrompt('Continue', setup.signal);
  const first = observed.compaction!;
  expect(await condenseContext({ messages, ...first, signal: setup.signal, operation: { sessionId: setup.session.id } })).toMatchObject({ status: 'condensed' });
  expect(await condenseContext({ messages, ...first, signal: setup.signal, operation: { sessionId: setup.session.id } })).toMatchObject({ status: 'condensed' });
  expect(setup.requests).toHaveLength(2);
  const selection = readSessionModel(setup.session.id)!;
  const picker = modelPicker(setup.context); await picker.load();
  const role = (await picker.inspect!('role:summary'))!.next!; await role.load();
  const thinking = (await role.apply(['thinking']))!.next!; await thinking.load();
  expect((await thinking.apply(['low']))?.note).toContain('summary uses');
  expect(readSessionModel(setup.session.id)).toEqual({ ...selection, roles: { ...selection.roles,
    summary: { ...selection.roles!.summary!, thinkingEffort: 'low' } } });
  runtime(setup).deps.runPrompt('Continue', setup.signal);
  const revised = observed.compaction!;
  expect(await condenseContext({ messages, ...revised, signal: setup.signal, operation: { sessionId: setup.session.id } })).toMatchObject({ status: 'condensed' });
  expect(setup.requests.map(request => request.effort)).toEqual(['high', 'high', 'low', 'low']);
});

it('renews the summary account once and refuses append across the resulting configuration publication', async () => {
  const setup = await fixture('gpt-5.4'); const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const old = { type: 'openai-chatgpt-account' as const, accessToken: 'synthetic-old', refreshToken: 'synthetic-refresh', expiresAt: 1, accountId: 'b' };
  const fresh = { ...old, accessToken: accountToken('synthetic-fresh', 'b'), refreshToken: 'synthetic-rotated', expiresAt: Date.now() + 3600000 };
  writeUserRuntimeConfigFile({ ...edit.values, maxOutputTokens: undefined, providerConnections: edit.values.providerConnections!.map(connection => connection.id === 'b'
    ? { ...connection, baseUrl: 'https://chatgpt.com/backend-api', authType: 'account-auth', apiKey: undefined, accountAuth: { openai: old } } : connection) }, edit);
  const address = new URL(edit.values.providerConnections!.find(connection => connection.id === 'b')!.baseUrl!);
  accountWire(address.origin, '/b/v1/codex/responses');
  const renewal = observeOAuthRenewal(fresh);
  const { deps } = runtime(setup);
  const history = setup.manager.getSession(setup.session.id)!.turns;
  expect(await deps.compactHistory!(setup.session.id, setup.signal)).toMatchObject({ status: 'failed', reason: expect.stringContaining('Configuration changed') });
  expect(setup.manager.getSession(setup.session.id)!.turns).toEqual(history);
  expect(renewal).toHaveBeenCalledOnce();
  expect(setup.requests.map(request => request.credential)).toEqual([`Bearer ${fresh.accessToken}`, `Bearer ${fresh.accessToken}`]);
  const stored = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
  expect(stored.providerConnections!.find(connection => connection.id === 'b')?.accountAuth?.openai).toMatchObject({ ...fresh, expiresAt: expect.any(Number) });
  expect(stored.providerConnections!.find(connection => connection.id === 'a')).toEqual(edit.values.providerConnections![0]);
  expect(stored.activeProviderConnectionId).toBe('a');
});
