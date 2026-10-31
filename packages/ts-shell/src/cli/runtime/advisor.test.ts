import { accountWire, accountCompletion } from '../../test-utils/account.js';
import { accountToken, observeOAuthRenewal } from '../../test-utils/oauth.js';
import fs from 'node:fs';
import http from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses, advisorResult } from '../../test-utils/advisor.js';
import { getRuntimeConfig, getUserAuthPath, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../config/runtimeConfig.js';
import { ConfigState } from '../../config/state.js';
import { configurationAdmission, configurationBinding, refreshConfiguration } from '../../core/shell/configuration.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { loadCatalog, writeCatalogCache } from '../../core/models/catalogStore.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { runModelPresetCommand } from '../../core/commands/model/presetCommand.js';
import { projectSessionModel } from '../../session/model/projection.js';
import { readSessionModelEdit, writeSessionModel } from '../../session/model/state.js';
import { runCliRuntimeInvocation } from '../../entrypoints/cliRuntimeInvocation.js';
import { writeGoal, readGoalEdit } from '../../planning/goal/store.js';
import { goalRequestPolicy } from '../../planning/goal/budget.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { runAdvisorCommand } from '../../advisor/command.js';
import type { SubagentRunInput, SubagentRunResult } from '../../core/subagents/runner.js';
import { advisorFor, advisorCheckpointFor } from './advisor.js';
import * as authorization from '../../provider/request/authorization.js';
import * as accounts from '../../core/auth/account/renewal.js';
import * as modelState from '../../session/model/state.js';
import { modelPicker } from '../interactive/picker/model.js';

const servers: http.Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  cleanupAdvisorHarnesses();
});

const oldAccount = { type: 'openai-chatgpt-account' as const, accessToken: 'synthetic-old', refreshToken: 'synthetic-refresh', expiresAt: 1, accountId: 'b' };
const freshAccount = { ...oldAccount, accessToken: accountToken('synthetic-fresh', 'b'), refreshToken: 'synthetic-rotated', expiresAt: Date.now() + 3600000 };

async function fixture(account: boolean | 'environment' | 'scope' | 'main' | 'main-environment' | 'main-scope' = false) {
  const setup = createAdvisorHarness(false, false);
  vi.stubEnv('OPENAI_API_KEY', '');
  const callbacks: { main?: () => void; publish?: () => void; afterPublish?: () => void; accepted?: boolean; retainPublication?: boolean } = {};
  const mainOwner = typeof account === 'string' && account.startsWith('main');
  const mainModel = mainOwner ? 'gpt-5.4' : 'main';
  const requests: Array<{ path: string; credential?: string; model: string; effort?: string; tools?: unknown[]; messages: unknown[] }> = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({ path: request.url!, credential: request.headers.authorization, model: body.model, effort: body.reasoning?.effort ?? body.reasoning_effort, tools: body.tools, messages: body.input ?? body.messages });
    if (body.model === mainModel) callbacks.main?.();
    if (body.stream === true && Array.isArray(body.input)) {
      expect(body).not.toHaveProperty('max_output_tokens');
      response.writeHead(200, { 'content-type': 'text/event-stream' }); response.end(accountCompletion('Advisor fixture answer')); return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Advisor fixture answer' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 } }));
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  if (account) accountWire(`http://127.0.0.1:${address.port}`, `/${mainOwner ? 'a' : 'b'}/v1/codex/responses`);
  const advisorModel = account && !mainOwner ? 'gpt-5.4' : 'namespace/advisor';
  const environment = account === 'environment' || account === 'main-environment';
  if (environment) { vi.stubEnv('DELEGATED_TEST_ACCESS', oldAccount.accessToken); vi.stubEnv('DELEGATED_TEST_REFRESH', oldAccount.refreshToken); }
  const storedAccount = environment ? { ...oldAccount, accessToken: '${DELEGATED_TEST_ACCESS}', refreshToken: '${DELEGATED_TEST_REFRESH}' } : oldAccount;
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'a', ...(account ? {} : { maxOutputTokens: 10 }), reserveTokens: 100,
    ...(account === 'scope' || account === 'main-scope' ? { pathRules: [{ path: setup.root, settings: { reserveTokens: 100 } }] } : {}),
    retryEnabled: false, retryMaxRetries: 0, providerRetryMaxRetries: 0, cacheWarming: 'off',
    providerConnections: ['a', 'b'].map(id => ({ id, provider: 'openai', model: id === 'b' ? advisorModel : mainModel,
      ...(account && id === (mainOwner ? 'a' : 'b') ? { authType: 'account-auth' as const, accountAuth: { openai: storedAccount } }
        : { authType: 'api-key' as const, apiKey: `synthetic-${id}` }),
      baseUrl: account && id === (mainOwner ? 'a' : 'b') ? 'https://chatgpt.com/backend-api' : `http://127.0.0.1:${address.port}/${id}/v1`, status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01' })) },
  readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache([{ id: 'openai', models: [{ id: mainModel, reasoning: true, contextWindow: 32000, maxTokens: account ? 8192 : 10 },
    { id: advisorModel, reasoning: true, contextWindow: 32000, maxTokens: account ? 8192 : 10 }] }]);
  const command = { cwd: setup.root, projectRoot: setup.root, sessionId: setup.session.id };
  expect((await runModelPresetCommand(['save', 'work', '--profile', `default=a/${mainModel}@low`, `advisor=b/${advisorModel}@high`], command)).output).toContain('saved');
  expect((await runModelPresetCommand(['apply', 'work', '--all'], command)).output).toContain('all roles applied');
  const config = projectSessionModel(getRuntimeConfig(setup.root), setup.session.id);
  const binding = { projectRoot: setup.root, session: setup.session };
  const configuration = new ConfigState(config, configurationBinding(binding), loadCatalog());
  const context = { ...binding, cwd: setup.root, configuration } as ShellRuntimeContext;
  const reports: string[] = [];
  const renderer = { renderLine: (text: string) => reports.push(text) };
  const advisor = advisorFor(context, setup.manager, renderer);
  writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'set', objective: 'Advisor fixture' });
  return { ...setup, requests, command, context, renderer, advisor, reports, callbacks, mainModel };
}

async function invoke(setup: Awaited<ReturnType<typeof fixture>>, signal = setup.signal) {
  const config = projectSessionModel(getRuntimeConfig(setup.root), setup.session.id);
  const run = await runCliRuntimeInvocation({ sessionId: setup.session.id, workspaceRoot: setup.root, prompt: 'Review fixture',
    agentMode: 'build', permissionScope: 'ask', signal, maxTurns: 1, runtimeConfig: config, providerCatalog: loadCatalog(),
    providerCredentialResolution: resolveProviderCredential({ runtimeConfig: config, env: {} }), providerModeEnv: 'real',
    requestPolicy: goalRequestPolicy(setup.manager, setup.session),
    admission: configurationAdmission(setup.context),
    checkpoint: advisorCheckpointFor(setup.context, setup.manager, setup.renderer, setup.sourcePromptEntryId),
    onCredentialPersisted: () => {
      setup.callbacks.publish?.();
      if (setup.callbacks.retainPublication) return setup.callbacks.accepted;
      const applied = refreshConfiguration(setup.context).status === 'applied';
      setup.callbacks.afterPublish?.();
      return applied && setup.callbacks.accepted !== false;
    },
    escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: 'deny', respondedAt: Date.now() }),
  }, { checkProviderReadiness: async () => ({ ok: true }), tools: () => new Map() });
  for await (const _event of run.events) { /* Exercise the actual main turn and delegated request. */ }
}

it.each([false, true])('uses the automatic advisor role with explicit override %s only after enable', async explicit => {
  const setup = await fixture(); const global = fs.readFileSync(getUserRuntimeConfigPath());
  expect(setup.advisor.view().status).toBe('off');
  await invoke(setup);
  expect(setup.requests.map(row => row.model)).toEqual(['main']);
  if (explicit) await runAdvisorCommand(['configure', 'a/namespace/advisor'], setup.command, setup.advisor, false);
  expect((await runAdvisorCommand(['on'], setup.command, setup.advisor, false)).kind).toBe('local');
  await invoke(setup);
  const selected = explicit ? { path: '/a/v1/chat/completions', credential: 'Bearer synthetic-a', effort: 'low' }
    : { path: '/b/v1/chat/completions', credential: 'Bearer synthetic-b', effort: 'high' };
  expect(setup.requests).toHaveLength(3);
  expect(setup.requests[2]).toMatchObject({ ...selected, model: 'namespace/advisor' });
  expect(setup.requests[2].tools ?? []).toEqual([]);
  expect(setup.advisor.view().notes).toHaveLength(1);
  expect(setup.advisor.view().notes[0]).toMatchObject({ target: explicit ? 'a/namespace/advisor' : 'b/namespace/advisor@high' });
  expect(setup.advisor.view().notes[0].targetIdentity).toMatch(/^[a-f0-9]{64}$/);
  const scope = readGoalEdit(setup.manager, setup.session).goal!.id;
  expect(decodeRequestLedger(readBoundSessionState(setup.manager, setup.session).state.requestLedger)!.scopes[scope]).toMatchObject({ inputTokens: 12, outputTokens: 3, pending: {} });
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
});

it('sends the role effort saved by the model panel and provider default without changing the main effort', async () => {
  const setup = await fixture(); setup.advisor.setEnabled(true);
  const before = modelState.readSessionModel(setup.session.id)!;
  for (const level of ['low', 'auto'] as const) {
    const picker = modelPicker(setup.command); await picker.load();
    const role = (await picker.inspect!('role:advisor'))!.next!; await role.load();
    const thinking = (await role.apply(['thinking']))!.next!; await thinking.load();
    expect((await thinking.apply([level]))?.note).toContain('advisor uses');
    expect(modelState.readSessionModel(setup.session.id)).toEqual({ ...before, roles: { ...before.roles,
      advisor: { ...before.roles!.advisor!, thinkingEffort: level === 'auto' ? null : level } } });
    await invoke(setup);
  }
  expect(setup.requests.map(row => [row.model, row.effort])).toEqual([
    ['main', 'low'], ['namespace/advisor', 'low'], ['main', 'low'], ['namespace/advisor', undefined],
  ]);
});

it('configure without a target clears an explicit override and stays off until enabled', async () => {
  const setup = await fixture();
  await runAdvisorCommand(['configure', 'a/namespace/advisor'], setup.command, setup.advisor, false);
  await runAdvisorCommand(['configure', '--every', '2'], setup.command, setup.advisor, false);
  expect(setup.advisor.view()).toMatchObject({ enabled: false, config: { every: 2 } });
  expect(setup.advisor.view().config?.target).toBeUndefined();
  expect(setup.requests).toHaveLength(0);
});

it.each(['deleted', 'reused', 'scope', 'effort'] as const)('refuses a %s advisor binding without sending a substitute', async change => {
  const setup = await fixture();
  const publication = setup.context.configuration.current;
  const config = { ...publication.config,
    ...(change === 'scope' ? { allowedModels: ['openai/main'] } : {}),
    providerConnections: change === 'deleted' ? publication.config.providerConnections.filter(item => item.id !== 'b')
      : publication.config.providerConnections.map(item => item.id === 'b' && change === 'reused' ? { ...item, provider: 'google' as const } : item) };
  const catalog = change === 'effort' ? publication.catalog.map(provider => ({ ...provider,
    models: provider.models.map(model => model.id === 'namespace/advisor' ? { ...model, reasoning: false } : model) })) : publication.catalog;
  const ticket = setup.context.configuration.begin(publication.binding);
  expect(setup.context.configuration.publish(ticket, config, publication.binding, undefined, catalog).status).toBe('applied');
  setup.advisor.setEnabled(true);
  const runner = vi.fn(async () => advisorResult());
  await setup.advisor.capture(setup.boundary('Unavailable role'), runner, setup.signal);
  expect(runner).not.toHaveBeenCalled();
  expect(setup.advisor.view()).toMatchObject({ status: 'unavailable', notes: [] });
  expect(setup.advisor.view().pending).toBeUndefined();
  expect(setup.requests).toHaveLength(0);
});

it.each(['remove', 'change-back', 'configuration'] as const)('a %s during review fences dispatch admission and publication', async change => {
  const setup = await fixture(); setup.advisor.setEnabled(true);
  let finish!: (result: SubagentRunResult) => void;
  let start!: () => void; const started = new Promise<void>(resolve => { start = resolve; });
  let captured!: SubagentRunInput;
  const running = setup.advisor.capture(setup.boundary('Bound review'), input => { captured = input; start(); return new Promise(resolve => { finish = resolve; }); }, setup.signal);
  await started;
  const edit = readSessionModelEdit(setup.session.id); const original = edit.selection!;
  if (change === 'configuration') setup.context.configuration.recordDisplay({ theme: 'light' });
  else {
    writeSessionModel(setup.session.id, { ...original, roles: {} }, edit);
    if (change === 'change-back') writeSessionModel(setup.session.id, original, readSessionModelEdit(setup.session.id));
  }
  expect(captured.admission?.()).toContain('changed');
  finish(advisorResult('Late advice')); await running;
  expect(setup.advisor.view().notes).toHaveLength(0);
  expect(setup.advisor.view().pending).toBeUndefined();
  expect(setup.requests).toHaveLength(0);
});

it('a published note cannot be applied after the role revision changes', async () => {
  const setup = await fixture(); setup.advisor.setEnabled(true); await invoke(setup);
  const note = setup.advisor.view().notes[0]!;
  const edit = readSessionModelEdit(setup.session.id);
  writeSessionModel(setup.session.id, { ...edit.selection!, roles: {} }, edit);
  expect(() => setup.advisor.apply(note.id)).toThrow(/stale/);
  await invoke(setup);
  expect(setup.requests.map(row => row.model)).toEqual(['main', 'namespace/advisor', 'main']);
  expect(setup.advisor.view().status).toBe('unavailable');
});

it('manual review refuses an old provider closure after a same-role connection reload', async () => {
  const setup = await fixture(); setup.advisor.setEnabled(true); await invoke(setup);
  const publication = setup.context.configuration.current;
  const config = { ...publication.config, providerConnections: publication.config.providerConnections.map(connection => connection.id === 'b'
    ? { ...connection, apiKey: 'synthetic-b-renewed', baseUrl: connection.baseUrl!.replace('/b/', '/changed/') } : connection) };
  const ticket = setup.context.configuration.begin(publication.binding);
  expect(setup.context.configuration.publish(ticket, config, publication.binding).status).toBe('applied');
  const output = await runAdvisorCommand(['review'], setup.command, setup.advisor, false);
  expect(output.kind).toBe('local');
  expect(setup.requests).toHaveLength(2);
  expect(setup.advisor.view().status).toBe('error');
  expect(setup.advisor.view().pending).toBeUndefined();
  expect(setup.advisor.view().notes).toHaveLength(1);
});

it('reports a publication change during the main request and resumes advice on a fresh turn', async () => {
  const setup = await fixture(); setup.advisor.setEnabled(true);
  setup.callbacks.main = () => { setup.context.configuration.recordDisplay({ theme: 'light' }); setup.callbacks.main = undefined; };
  await invoke(setup);
  expect(setup.requests.map(row => row.model)).toEqual(['main']);
  expect(setup.advisor.view().checkpoints).toHaveLength(0);
  expect(setup.reports.join('\n')).toContain('Advisor checkpoint skipped because its request configuration changed.');
  await invoke(setup);
  expect(setup.requests.map(row => row.model)).toEqual(['main', 'main', 'namespace/advisor']);
  expect(setup.advisor.view().notes).toHaveLength(1);
});

it.each(['main', 'main-environment', 'main-scope'] as const)('keeps the current checkpoint eligible after a verified %s account renewal and produces a usable advisor note', async kind => {
  const setup = await fixture(kind); setup.advisor.setEnabled(true);
  const renew = observeOAuthRenewal(freshAccount);
  await invoke(setup);
  expect(renew.mock.calls.filter(([input]) => input.credential.accountAuth)).toHaveLength(1);
  expect(setup.requests.map(row => row.model)).toEqual(['gpt-5.4', 'namespace/advisor']);
  expect(setup.requests[0]).toMatchObject({ credential: `Bearer ${freshAccount.accessToken}`, effort: 'low' });
  expect(setup.requests[1]).toMatchObject({ credential: 'Bearer synthetic-b', effort: 'high', tools: undefined });
  expect(setup.advisor.view().notes).toHaveLength(1);
  const note = setup.advisor.view().notes[0]!;
  expect(setup.advisor.apply(note.id).noteId).toBe(note.id);
  expect(setup.reports.join('\n')).not.toContain('checkpoint skipped');
  expect(getRuntimeConfig(setup.root).providerConnections.find(row => row.id === 'a')?.accountAuth?.openai).toMatchObject({ ...freshAccount, expiresAt: expect.any(Number) });
  const scope = readGoalEdit(setup.manager, setup.session).goal!.id;
  expect(decodeRequestLedger(readBoundSessionState(setup.manager, setup.session).state.requestLedger)!.scopes[scope])
    .toMatchObject({ inputTokens: 8, outputTokens: 2, pending: {} });
});

it('keeps a renewed auth-only profile checkpoint eligible without creating a settings source', async () => {
  const setup = await fixture('main');
  const settings = JSON.parse(fs.readFileSync(getUserRuntimeConfigPath(), 'utf8'));
  const auth = JSON.parse(fs.readFileSync(getUserAuthPath(), 'utf8'));
  auth.providerConnections = auth.providerConnections.map((record: { id: string; provider: string }) => {
    const owned = settings.modelPreferences.connections.find((item: { id: string; provider: string }) => item.id === record.id && item.provider === record.provider);
    const { id: _id, provider: _provider, ...defaults } = owned;
    return { ...record, ...defaults };
  });
  // No model defaults: a credential-only save should not add a source file.
  for (const record of auth.providerConnections) delete record.model;
  fs.writeFileSync(getUserAuthPath(), JSON.stringify(auth), { mode: 0o600 });
  fs.unlinkSync(getUserRuntimeConfigPath());
  const config = projectSessionModel(getRuntimeConfig(setup.root), setup.session.id);
  setup.context.configuration = new ConfigState(config, configurationBinding(setup.context), loadCatalog());
  setup.advisor = advisorFor(setup.context, setup.manager, setup.renderer);
  setup.advisor.setEnabled(true);
  observeOAuthRenewal(freshAccount);
  await invoke(setup);
  expect(setup.requests.map(row => row.model)).toEqual(['gpt-5.4', 'namespace/advisor']);
  expect(setup.advisor.view().notes).toHaveLength(1);
  expect(fs.existsSync(getUserRuntimeConfigPath())).toBe(false);
});

it.each(['settings', 'catalog', 'model', 'main-request'] as const)('does not accept unrelated %s changes with a main-account renewal', async kind => {
  const setup = await fixture('main'); setup.advisor.setEnabled(true);
  observeOAuthRenewal(freshAccount);
  const change = () => {
    if (kind === 'model') { const edit = readSessionModelEdit(setup.session.id); writeSessionModel(setup.session.id, { ...edit.selection!, roles: {} }, edit); }
    else if (kind === 'catalog') writeCatalogCache(loadCatalog().map(provider => ({ ...provider, models: provider.models.map(model => ({ ...model, contextWindow: 64000 })) })));
    else if (kind === 'main-request') setup.context.configuration.recordDisplay({ theme: 'light' });
    else { const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath()); writeUserRuntimeConfigFile({ ...edit.values, temperature: 0.2 }, edit); }
  };
  if (kind === 'main-request') setup.callbacks.main = change;
  else setup.callbacks.publish = change;
  await invoke(setup);
  expect(setup.requests.filter(row => row.model === 'namespace/advisor')).toHaveLength(0);
  expect(setup.advisor.view().notes).toHaveLength(0);
  expect(setup.advisor.view().pending).toBeUndefined();
  expect(getRuntimeConfig(setup.root).providerConnections.find(row => row.id === 'a')?.accountAuth?.openai).toMatchObject({ ...freshAccount, expiresAt: expect.any(Number) });
});

it('uses the newly persisted main token for an advisor sharing the same account without a second exchange', async () => {
  const setup = await fixture('main'); setup.advisor.setEnabled(true);
  // Use the installed model: a refresh cannot shrink its reviewed output ceiling.
  const coding = setup.context.configuration.current.catalog.find(provider => provider.id === 'openai')!
    .models.find(model => model.id === 'gpt-5.3-codex')!;
  expect(coding.contextWindow).toBeGreaterThan(coding.maxTokens!);
  await runAdvisorCommand(['configure', 'a/gpt-5.3-codex'], setup.command, setup.advisor, false);
  await runAdvisorCommand(['on'], setup.command, setup.advisor, false);
  const renew = observeOAuthRenewal(freshAccount);
  await invoke(setup);
  expect(renew).toHaveBeenCalledOnce();
  expect(setup.requests.map(row => [row.path, row.credential, row.model])).toEqual([
    ['/a/v1/codex/responses', `Bearer ${freshAccount.accessToken}`, 'gpt-5.4'],
    ['/a/v1/codex/responses', `Bearer ${freshAccount.accessToken}`, 'gpt-5.3-codex'],
  ]);
  expect(setup.advisor.view().notes).toHaveLength(1);
});

it.each(['missing-receipt', 'missing-retained', 'publication-declined', 'declined-retained', 'omitted-retained'] as const)('does not accept a main renewal checkpoint when %s', async kind => {
  const setup = await fixture('main'); setup.advisor.setEnabled(true);
  observeOAuthRenewal(freshAccount);
  if (kind.startsWith('missing-')) {
    const renew = accounts.renewStoredAccount;
    vi.spyOn(accounts, 'renewStoredAccount').mockImplementation(async input => {
      const { rotation: _receipt, ...result } = await renew(input);
      return result;
    });
    if (kind === 'missing-retained') { setup.callbacks.retainPublication = true; setup.callbacks.accepted = true; }
  } else {
    setup.callbacks.accepted = kind === 'omitted-retained' ? undefined : false;
    setup.callbacks.retainPublication = kind === 'declined-retained' || kind === 'omitted-retained';
  }
  await invoke(setup);
  expect(setup.requests.map(row => row.model)).toEqual(['gpt-5.4']);
  expect(setup.requests[0]).toMatchObject({ credential: `Bearer ${freshAccount.accessToken}` });
  expect(setup.advisor.view().notes).toHaveLength(0);
  expect(setup.reports.join('\n')).toContain('checkpoint skipped');
});

it('continues the main request when the checkpoint model reader fails just after credential publication', async () => {
  const setup = await fixture('main'); setup.advisor.setEnabled(true);
  observeOAuthRenewal(freshAccount);
  const published = vi.fn(); setup.callbacks.publish = published;
  setup.callbacks.afterPublish = () => {
    vi.spyOn(modelState, 'readSessionModelEdit').mockImplementationOnce(() => { throw new Error('Fixture model reader unavailable'); });
  };
  await invoke(setup);
  expect(published).toHaveBeenCalledOnce();
  expect(setup.requests.map(row => row.model)).toEqual(['gpt-5.4']);
  expect(setup.requests[0]).toMatchObject({ credential: `Bearer ${freshAccount.accessToken}` });
  expect(setup.advisor.view().notes).toHaveLength(0);
  expect(setup.reports.join('\n')).toContain('checkpoint skipped');
});

it.each([true, 'environment', 'scope'] as const)('prepares an expired independent account (%s) only for an eligible review and publishes a usable note for the renewed target', async kind => {
  const setup = await fixture(kind);
  const renew = observeOAuthRenewal(freshAccount);
  await invoke(setup);
  expect(renew.mock.calls.filter(([input]) => input.credential.accountAuth)).toHaveLength(0);
  setup.advisor.configure({ every: 2, mode: 'turn', timeoutMs: 10000 }); setup.advisor.setEnabled(true);
  await invoke(setup);
  expect(renew.mock.calls.filter(([input]) => input.credential.accountAuth)).toHaveLength(0);
  await invoke(setup);
  expect(renew.mock.calls.filter(([input]) => input.credential.accountAuth)).toHaveLength(1);
  expect(setup.requests.map(row => row.model)).toEqual(['main', 'main', 'main', 'gpt-5.4']);
  expect(setup.requests.at(-1)).toMatchObject({ credential: `Bearer ${freshAccount.accessToken}`, effort: 'high' });
  expect(getRuntimeConfig(setup.root).providerConnections.find(row => row.id === 'b')?.accountAuth?.openai).toMatchObject({ ...freshAccount, expiresAt: expect.any(Number) });
  expect(setup.advisor.view().status).toBe('reviewed');
  const note = setup.advisor.view().notes[0]!;
  expect(setup.advisor.apply(note.id).noteId).toBe(note.id);
});

it.each(['settings', 'catalog', 'model'] as const)('an unrelated %s change inside credential publication cannot be adopted by preparation', async kind => {
  const setup = await fixture(true); setup.advisor.setEnabled(true);
  observeOAuthRenewal(freshAccount);
  setup.callbacks.publish = () => {
    if (kind === 'model') { const edit = readSessionModelEdit(setup.session.id); writeSessionModel(setup.session.id, { ...edit.selection!, roles: {} }, edit); }
    else if (kind === 'catalog') writeCatalogCache(loadCatalog().map(provider => ({ ...provider, models: provider.models.map(model => ({ ...model, contextWindow: 64000 })) })));
    else { const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath()); writeUserRuntimeConfigFile({ ...edit.values, temperature: 0.2 }, edit); }
  };
  await invoke(setup);
  expect(setup.requests.map(row => row.model)).toEqual(['main']);
  expect(setup.advisor.view().notes).toHaveLength(0); expect(setup.advisor.view().pending).toBeUndefined();
});

it.each(['cancel', 'configuration'] as const)('persists started renewal but refuses advisor dispatch after %s', async kind => {
  const setup = await fixture(true); setup.advisor.setEnabled(true); const controller = new AbortController();
  observeOAuthRenewal(freshAccount, () => {
    if (kind === 'cancel') controller.abort(); else setup.context.configuration.recordDisplay({ theme: 'light' });
  });
  await invoke(setup, controller.signal);
  // A cancelled exchange may settle after its caller; the retained claim must then clear.
  await vi.waitFor(() => expect(setup.advisor.view().pending).toBeUndefined());
  expect(setup.requests.map(row => row.model)).toEqual(['main']);
  expect(getRuntimeConfig(setup.root).providerConnections.find(row => row.id === 'b')?.accountAuth?.openai).toMatchObject({ ...freshAccount, expiresAt: expect.any(Number) });
  expect(setup.advisor.view().notes).toHaveLength(0);
});

it('an old manual runner fails before account preparation after a configuration publication', async () => {
  const setup = await fixture(true);
  const renew = vi.spyOn(authorization, 'renewAccountAuthIfExpiring').mockResolvedValue({ renewed: false });
  setup.advisor.configure({ every: 2, mode: 'turn', timeoutMs: 10000 }); setup.advisor.setEnabled(true);
  await invoke(setup);
  setup.context.configuration.recordDisplay({ theme: 'light' });
  await setup.advisor.reviewLatest();
  expect(renew.mock.calls.filter(([input]) => input.credential.accountAuth)).toHaveLength(0);
  expect(setup.requests.map(row => row.model)).toEqual(['main']);
  expect(setup.advisor.view()).toMatchObject({ notes: [], status: 'error' });
});
