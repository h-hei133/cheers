import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { modelPicker } from '../model.js';
import { SessionManager } from '../../../../session/SessionManager.js';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../../config/runtimeConfig.js';
import { writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../../session/model/state.js';
import { runConnectCommand, __setOpenAIAccountAuthRunnerForTest } from '../../../../core/commands/connectCommandRuntime.js';
import { modelSignInPicker, modelSignInStatus, modelAccountSignIn, type ModelSignIn } from './auth.js';
import { BUILTIN_PROVIDERS } from '../../../../core/models/catalog.js';
import type { CommandContext } from '../../../../core/commands/types.js';
import { OverlayHost } from '../../overlay.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';

let home: string;
let manager: SessionManager;
let sessionId: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  home = fs.mkdtempSync(path.join('/tmp/cheers-test', 'model-choice-'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('OPENAI_API_KEY', '');
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'a', providerConnections: ['a', 'b'].map(id => ({
    id, provider: 'openai' as const, label: `Relay ${id}`, authType: 'api-key' as const, apiKey: `synthetic-${id}`,
    baseUrl: `https://${id}.example.invalid/v1`, model: 'shared', status: 'connected' as const,
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  })) }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache([{ id: 'openai', models: [{ id: 'shared', reasoning: true }, { id: 'other', reasoning: true }] }]);
  manager = new SessionManager(); sessionId = manager.createNew(home).id;
});
afterEach(() => { __setOpenAIAccountAuthRunnerForTest(undefined); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

const id = (connection = 'b', model = 'shared') => `model:${JSON.stringify([connection, 'openai', model])}`;
const context = () => ({ cwd: home, projectRoot: home, sessionId });

it.each(['subagent', 'summary', 'advisor'] as const)('continues %s assignment after native sign-in with a fresh transaction and unchanged default', async role => {
  const baseline = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...baseline.values, provider: 'anthropic', activeProviderConnectionId: 'default', providerConnections: [{
    id: 'default', provider: 'anthropic', label: 'Default', authType: 'api-key', apiKey: 'synthetic-default',
    model: 'claude-test', status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }] }, baseline);
  writeCatalogCache([{ id: 'openai', models: [{ id: 'gpt-5.4-mini', reasoning: true }] },
    { id: 'anthropic', models: [{ id: 'claude-test', reasoning: true }] }]);
  const original = { connectionScope: 'session' as const, connectionId: 'default', provider: 'anthropic' as const, model: 'claude-test', thinkingEffort: 'high' as const,
    contextWindow: 90000, skillful: false, roles: { subagent: { connectionId: 'default', provider: 'anthropic' as const,
      model: 'claude-test', thinkingEffort: 'low' as const }, summary: { connectionId: 'default', provider: 'anthropic' as const,
      model: 'claude-test', thinkingEffort: 'low' as const }, advisor: { connectionId: 'default', provider: 'anthropic' as const,
      model: 'claude-test', thinkingEffort: 'low' as const } } };
  writeSessionModel(sessionId, original, readSessionModelEdit(sessionId));
  __setOpenAIAccountAuthRunnerForTest(async () => ({ accessToken: 'synthetic-role-account', refreshToken: 'synthetic-role-refresh',
    expiresAt: Date.now() + 3600000, authorizeUrl: 'https://auth.openai.com/authorize', callbackUrl: 'http://localhost:1455/auth/callback' }));
  const signIn = async (provider: import('../../../../config/runtimeConfig.js').RuntimeProvider) => ({
    context: context(), note: (await runConnectCommand(['login', provider, '--account'], context())).output,
  });
  const picker = modelPicker(context(), undefined, undefined, undefined, undefined, signIn); await picker.load();
  const actions = (await picker.inspect!(`role:${role}`))!.next!; await actions.load();
  const browse = (await actions.apply(['choose']))!.next!;
  const missing = (await browse.load()).find(row => row.label === 'gpt-5.4-mini')!;
  const details = (await browse.inspect!(missing.id))!.next!; await details.load();
  const confirmation = (await details.apply(['account']))!.next!; await confirmation.load();
  const returned = (await confirmation.apply(['start']))!.next!; await returned.load();
  expect(readSessionModel(sessionId)).toEqual(original);
  const connection = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values.providerConnections!.find(row => row.provider === 'openai')!;
  expect(returned.initialSelection).toBe(id(connection.id, 'gpt-5.4-mini'));
  const saved = await returned.apply([returned.initialSelection!]);
  expect(saved?.note).toContain(`${role} uses`); expect(saved?.next?.initialSelection).toBe(`role:${role}`);
  expect(readSessionModel(sessionId)).toEqual({ ...original, roles: { ...original.roles,
    [role]: { connectionId: connection.id, provider: 'openai', model: 'gpt-5.4-mini', thinkingEffort: 'low' } } });
});

it.each((['subagent', 'summary', 'advisor'] as const).flatMap(role =>
  (['account', 'configure'] as const).map(route => ({ role, route }))))(
  'retains the $role $route result and a usable parent when session state becomes unreadable during sign-in', async ({ role, route }) => {
    writeUserRuntimeConfigFile({ provider: 'anthropic', activeProviderConnectionId: 'default', providerConnections: [{
      id: 'default', provider: 'anthropic', authType: 'api-key', apiKey: 'synthetic-default', model: 'default-model',
      status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01',
    }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    const target = { connectionId: 'default', provider: 'anthropic' as const, model: 'default-model', thinkingEffort: 'low' as const };
    writeSessionModel(sessionId, { connectionScope: 'session', ...target, thinkingEffort: 'high',
      roles: { subagent: target, summary: target, advisor: target } }, readSessionModelEdit(sessionId));
    writeCatalogCache([{ id: 'anthropic', models: [{ id: 'default-model', reasoning: true }] },
      { id: 'openai', models: [{ id: 'gpt-5.4-mini', reasoning: true }] }]);
    __setOpenAIAccountAuthRunnerForTest(async () => ({ accessToken: 'synthetic-role-access', refreshToken: 'synthetic-role-refresh',
      expiresAt: Date.now() + 3600000, authorizeUrl: 'https://auth.openai.com/authorize', callbackUrl: 'http://localhost:1455/auth/callback' }));
    const original = readSessionModel(sessionId)!, statePath = readSessionModelEdit(sessionId).statePath;
    const stateBytes = fs.readFileSync(statePath), before = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
    let notice: string | undefined;
    const authenticate: ModelSignIn = async (provider, key) => {
      const args = key ? ['login', provider, `--api-key=${key.apiKey}`, `--model=${key.model}`, `--label=${key.label}`,
        ...(key.baseUrl ? [`--base-url=${key.baseUrl}`] : [])] : ['login', provider, '--account'];
      const result = await runConnectCommand(args, context(), undefined, { activate: false });
      notice = result.output.split('\n').filter(line => !line.startsWith('Saved key:')).join('\n');
      fs.writeFileSync(statePath, '{unreadable');
      return { context: context(), note: notice };
    };
    const signIn = vi.fn(authenticate);
    const models = modelPicker(context(), undefined, undefined, undefined, undefined, signIn); await models.load();
    const actions = (await models.inspect!(`role:${role}`))!.next!; await actions.load();
    const browse = (await actions.apply(['choose']))!.next!;
    const missing = (await browse.load()).find(row => row.label === 'gpt-5.4-mini')!;
    const details = (await browse.inspect!(missing.id))!.next!; await details.load();
    const child = (await details.apply([route]))!.next!; await child.load();
    const result = route === 'account' ? await child.apply(['start']) : await child.input!.apply('synthetic-role-key');
    expect(result?.note).toBe(notice); expect(signIn).toHaveBeenCalledTimes(1);
    const returned = result!.next!, rows = await returned.load();
    expect(returned.initialSelection).toBe(`role:${role}`);
    expect(returned.status!([], '')).toBe(modelSignInStatus(notice!));
    const modelsAfterFailure = rows.filter(row => row.id.startsWith('model:'));
    expect(modelsAfterFailure.length).toBeGreaterThan(0); expect(modelsAfterFailure.every(row => row.disabled)).toBe(true);
    expect(fs.readFileSync(statePath, 'utf8')).toBe('{unreadable');
    const saved = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
    const connection = saved.providerConnections!.find(row => row.provider === 'openai')!;
    expect(connection).toMatchObject({ status: 'connected', autoSelect: false });
    expect(saved.activeProviderConnectionId).toBe(before.activeProviderConnectionId); expect(saved.provider).toBe(before.provider);
    expect(saved.providerCredentials).toEqual(before.providerCredentials);
    expect(saved.providerConnections!.find(row => row.id === 'default')).toEqual(before.providerConnections![0]);
    expect(result?.note).not.toContain('synthetic-role-');
    expect(route === 'account' ? await child.apply(['start']) : await child.input!.apply('synthetic-role-key')).toBeUndefined();
    expect(signIn).toHaveBeenCalledTimes(1);
    fs.writeFileSync(statePath, stateBytes);
    const retry = (await returned.inspect!(`role:${role}`))!.next!; await retry.load();
    const fresh = (await retry.apply(['choose']))!.next!; await fresh.load();
    const assigned = await fresh.apply([id(connection.id, 'gpt-5.4-mini')]);
    expect(assigned?.note).toContain(`${role} uses`);
    expect(readSessionModel(sessionId)).toEqual({ ...original, roles: { ...original.roles,
      [role]: { connectionId: connection.id, provider: 'openai', model: 'gpt-5.4-mini', thinkingEffort: 'low' } } });
    expect(readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values).toEqual(saved);
  });

it.each(['success', 'failure', 'cancel'] as const)('returns a native account %s to the precise model and refreshes real connection state', async outcome => {
  const baseline = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...baseline.values, provider: 'openai', activeProviderConnectionId: undefined,
    providerConnections: [], providerCredentials: {} }, baseline);
  writeCatalogCache([{ id: 'openai', models: [{ id: 'gpt-5.4', reasoning: true }, { id: 'gpt-5.4-mini', reasoning: true }] }]);
  const controller = new AbortController(); let starts = 0;
  __setOpenAIAccountAuthRunnerForTest(async () => {
    starts++;
    expect(readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values.providerConnections?.[0]?.status).toBe('pending');
    if (outcome === 'cancel') controller.abort();
    if (outcome !== 'success') throw new DOMException('synthetic-only-failure', 'AbortError');
    return { accessToken: 'synthetic-account-only', refreshToken: 'synthetic-refresh-only', expiresAt: Date.now() + 3600000,
      authorizeUrl: 'https://auth.openai.com/authorize', callbackUrl: 'http://localhost:1455/auth/callback', accountId: 'synthetic' };
  });
  const signIn = async (provider: import('../../../../config/runtimeConfig.js').RuntimeProvider) => {
    const result = await runConnectCommand(['login', provider, '--account'], { ...context(), runCancellable: operation => operation(controller.signal) });
    return { context: context(), note: result.output };
  };
  const picker = modelPicker(context(), undefined, undefined, undefined, undefined, signIn); const rows = await picker.load();
  const model = rows.find(row => row.label === 'gpt-5.4-mini')!;
  const details = (await picker.inspect!(model.id))!.next!;
  expect((await details.load()).map(row => row.id)).toContain('account');
  const confirmation = (await details.apply(['account']))!.next!;
  expect(confirmation.initialSelection).toBe('cancel');
  expect(await confirmation.apply(['start'])).toBeUndefined();
  await confirmation.load();
  const result = await confirmation.apply(['start']);
  const connections = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values.providerConnections!;
  const returned = result!.next!; const refreshed = await returned.load();
  expect(returned.initialSelection).toBe(`model:${JSON.stringify([connections[0]!.id, 'openai', 'gpt-5.4-mini'])}`);
  expect(returned.status?.([], '')).toBe(modelSignInStatus(result!.note!));
  expect(result!.note).not.toContain('synthetic-account-only');
  expect(result!.note).not.toContain('synthetic-refresh-only');
  expect(refreshed.find(row => row.id === returned.initialSelection)?.disabled).toBe(outcome === 'success' ? undefined : true);
  expect(connections[0]!.status).toBe(outcome === 'success' ? 'connected' : 'error');
  expect(result!.note).toContain(outcome === 'success' ? 'pending -> connected' : 'pending -> error');
  expect(readSessionModel(sessionId)).toBeUndefined();
  expect(starts).toBe(1); expect(await confirmation.apply(['start'])).toBeUndefined();
});

it('cancels model sign-in through real Escape and the default cancel action without authenticating or writing', async () => {
  const signIn = vi.fn(); const picker = modelSignInPicker(context(), 'openai', signIn, current => modelPicker(current));
  const original = fs.readFileSync(getUserRuntimeConfigPath());
  await picker.load(); expect((await picker.apply(['cancel']))?.next?.title).toBe('Model');
  expect(await picker.apply(['start'])).toBeUndefined();
  const overlay = new OverlayHost(() => {}); overlay.open(modelSignInPicker(context(), 'openai', signIn, current => modelPicker(current)));
  await new Promise(resolve => setTimeout(resolve, 0)); overlay.handleKey(parseKeyEvent('\x1b'), vi.fn());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(stripAnsi(overlay.render(110, 30).join('\n'))).toContain('All models'); overlay.close();
  expect(signIn).not.toHaveBeenCalled(); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(original);
});

it('retains configuration publication failure in the visible authentication result and invalidates dismissed confirmations', async () => {
  expect(modelSignInStatus('Account connected.\nConnection ID: fixture\nConfiguration application outcome is unverified.'))
    .toBe('Configuration application outcome is unverified. Account connected.');
  const signIn = vi.fn(); const picker = modelSignInPicker(context(), 'openai', signIn, current => modelPicker(current));
  const overlay = new OverlayHost(() => {}); overlay.open(picker);
  await new Promise(resolve => setTimeout(resolve, 0)); overlay.close();
  expect(await picker.apply(['start'])).toBeUndefined(); expect(signIn).not.toHaveBeenCalled();
});

it('returns a saved native connection with its unverified publication visible and no session activation', async () => {
  const baseline = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...baseline.values, provider: 'openai', activeProviderConnectionId: undefined,
    providerConnections: [], providerCredentials: {} }, baseline);
  writeCatalogCache([{ id: 'openai', models: [{ id: 'gpt-5.4-mini', reasoning: true }] }]);
  __setOpenAIAccountAuthRunnerForTest(async () => ({ accessToken: 'synthetic-unpublished-account', refreshToken: 'synthetic-unpublished-refresh',
    expiresAt: Date.now() + 3600000, authorizeUrl: 'https://auth.openai.com/authorize', callbackUrl: 'http://localhost:1455/auth/callback' }));
  const pinned = { ...context(), runtimeConfig: getRuntimeConfig(home), refreshRuntimeConfig: () => { throw new Error('synthetic-publication-error'); } };
  const signIn = async (provider: import('../../../../config/runtimeConfig.js').RuntimeProvider) => ({
    context: pinned, note: (await runConnectCommand(['login', provider, '--account'], pinned)).output,
  });
  const picker = modelPicker(pinned, undefined, undefined, undefined, undefined, signIn);
  const model = (await picker.load()).find(row => row.label === 'gpt-5.4-mini')!;
  const details = (await picker.inspect!(model.id))!.next!; await details.load();
  const confirmation = (await details.apply(['account']))!.next!; await confirmation.load();
  const result = (await confirmation.apply(['start']))!;
  expect(result.note).toContain('Configuration application outcome is unverified.');
  expect(result.next!.status!([], '')).toMatch(/^Configuration application outcome is unverified\./);
  expect((await result.next!.load()).find(row => row.id === result.next!.initialSelection)?.disabled).toBe(true);
  expect(readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values.providerConnections![0]!.status).toBe('connected');
  expect(readSessionModel(sessionId)).toBeUndefined(); expect(result.note).not.toContain('synthetic-publication-error');
});

it.each(['session', 'workspace'] as const)('does not reopen a model after the sign-in host changes %s identity', async change => {
  const original: CommandContext = context();
  const picker = modelSignInPicker(original, 'openai', async () => ({ note: 'Authentication result retained', context: {
    ...original, ...(change === 'session' ? { sessionId: 'other' } : { cwd: `${home}/other`, projectRoot: `${home}/other` }) } }), current => modelPicker(current));
  await picker.load(); const result = await picker.apply(['start']);
  expect(result).toEqual({ note: 'Authentication result retained' });
});

it('does not reopen after the original sign-in admission changes during authentication', async () => {
  let blocked = false, release!: (value: { context: CommandContext; note: string }) => void;
  const pending = new Promise<{ context: CommandContext; note: string }>(resolve => { release = resolve; });
  const original: CommandContext = { ...context(), admission: () => blocked ? 'The session selection was cancelled.' : undefined };
  const picker = modelSignInPicker(original, 'openai', () => pending, current => modelPicker(current));
  await picker.load();
  const started = picker.apply(['start']);
  blocked = true;
  release({ context: original, note: 'Authentication result retained' });
  expect(await started).toEqual({ note: 'Authentication result retained' });
});

it('does not reopen after the original sign-in signal is cancelled during authentication', async () => {
  const controller = new AbortController();
  let release!: (value: { context: CommandContext; note: string }) => void;
  const pending = new Promise<{ context: CommandContext; note: string }>(resolve => { release = resolve; });
  const original: CommandContext = { ...context(), signal: controller.signal };
  const picker = modelSignInPicker(original, 'openai', () => pending, current => modelPicker(current));
  await picker.load();
  const started = picker.apply(['start']);
  controller.abort();
  release({ context: original, note: 'Authentication result retained' });
  expect(await started).toEqual({ note: 'Authentication result retained' });
});

it.each(['credential-missing', 'pending', 'error'] as const)('offers native sign-in for an existing %s builtin account connection without changing its old state', async state => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const previous = { id: 'account-broken', provider: 'openai' as const, authType: 'account-auth' as const, model: 'gpt-5.4-mini',
    status: state === 'credential-missing' ? 'connected' as const : state, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
  writeUserRuntimeConfigFile({ ...edit.values, activeProviderConnectionId: undefined, providerConnections: [previous], providerCredentials: {} }, edit);
  writeCatalogCache([{ id: 'openai', models: [{ id: 'gpt-5.4-mini', reasoning: true }] }]);
  __setOpenAIAccountAuthRunnerForTest(async () => ({ accessToken: 'synthetic-reconnect-account', refreshToken: 'synthetic-reconnect-refresh',
    expiresAt: Date.now() + 3600000, authorizeUrl: 'https://auth.openai.com/authorize', callbackUrl: 'http://localhost:1455/auth/callback' }));
  const signIn = async (provider: import('../../../../config/runtimeConfig.js').RuntimeProvider) => ({
    context: context(), note: (await runConnectCommand(['login', provider, '--account'], context())).output,
  });
  const picker = modelPicker(context(), undefined, undefined, undefined, undefined, signIn);
  const model = (await picker.load()).find(row => row.id === id('account-broken', 'gpt-5.4-mini'))!;
  expect(model).toMatchObject({ disabled: true, focusable: true });
  const details = (await picker.inspect!(model.id))!.next!;
  expect((await details.load()).some(row => row.id === 'account')).toBe(true);
  const confirmation = (await details.apply(['account']))!.next!; await confirmation.load();
  const result = (await confirmation.apply(['start']))!; await result.next!.load();
  const connections = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values.providerConnections!;
  expect(connections.find(row => row.id === previous.id)).toEqual(previous);
  expect(result.next!.initialSelection).toBe(id(connections[0]!.id, 'gpt-5.4-mini'));
  expect(readSessionModel(sessionId)).toBeUndefined();
});

it('excludes a custom relay address from builtin account sign-in even when its catalogue uses the canonical provider id', async () => {
  const builtin = BUILTIN_PROVIDERS.find(provider => provider.id === 'openai')!;
  expect(modelAccountSignIn(builtin, 'gpt-5.4-mini', builtin.baseUrl + '/')).toBe(true);
  expect(modelAccountSignIn(builtin, 'gpt-5.4-mini', 'https://relay.example.invalid/v1')).toBe(false);
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, activeProviderConnectionId: undefined, providerConnections: [{ ...edit.values.providerConnections![0]!,
    id: 'relay-error', status: 'error', model: 'gpt-5.4-mini' }] }, edit);
  writeCatalogCache([{ id: 'openai', models: [{ id: 'gpt-5.4-mini', reasoning: true }] }]);
  const picker = modelPicker(context(), undefined, undefined, undefined, undefined, vi.fn());
  const model = (await picker.load()).find(row => row.id === id('relay-error', 'gpt-5.4-mini'))!;
  const details = (await picker.inspect!(model.id))!.next!;
  expect((await details.load()).map(row => row.id)).toEqual(['back', 'configure']);
});

it('rejects an expired model sign-in confirmation and does not offer native account login for a custom relay', async () => {
  const signIn = vi.fn(); const picker = modelSignInPicker(context(), 'openai', signIn, current => modelPicker(current));
  await picker.load(); writeCatalogCache([{ id: 'openai', models: [{ id: 'changed' }] }]);
  expect((await picker.apply(['start']))?.note).toContain('expired'); expect(signIn).not.toHaveBeenCalled();
  const catalog = [{ id: 'custom', runtime: 'openai' as const, baseUrl: 'https://custom.example.invalid/v1', models: [{ id: 'gpt-5.4' }] }];
  writeCatalogCache(catalog);
  const models = modelPicker(context(), undefined, undefined, undefined, undefined, signIn); const rows = await models.load();
  const detail = (await models.inspect!(rows.find(row => row.label === 'gpt-5.4')!.id))!.next!;
  expect((await detail.load()).some(row => row.id === 'account')).toBe(false);
});
