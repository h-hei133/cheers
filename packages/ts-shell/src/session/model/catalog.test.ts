import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { getRuntimeConfig, getUserAuthPath, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../config/runtimeConfig.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from './state.js';
import { projectSessionModel } from './projection.js';
import { modelPicker } from '../../cli/interactive/picker/model.js';
import { thinkingPicker } from '../../cli/interactive/picker/thinking.js';
import { readModelCatalog, runModelCommand } from '../../core/commands/modelCommandRuntime.js';
import { runBtwCommand } from '../../core/commands/btwCommandRuntime.js';
import { runCliRuntimeInvocation } from '../../entrypoints/cliRuntimeInvocation.js';
import { checkRealProviderReadiness } from '../../core/shell/providerReadiness.js';
import { createProviderReadinessCliTerminalEvent } from '../../entrypoints/providerReadinessCliSurface.js';
import { runExtendedContextCommand } from '../../core/commands/model/context.js';
import { setSessionServiceTier } from '../../core/commands/model/serviceTier.js';
import { runModelPresetCommand } from '../../core/commands/model/presetCommand.js';
import { writeCatalogCache, loadCatalog } from '../../core/models/catalogStore.js';
import { mergeProviders, type CatalogProvider } from '../../core/models/catalog.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { captureThinkingPreference } from '../../core/models/preference.js';
import { createProviderStep } from '../../cli/provider/step.js';
import { captureSummaryRole } from '../../cli/provider/summary.js';
import { defaultHookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { providerCredentialBaseUrl } from '../../core/auth/account/target.js';
import { runThinkingCommand } from '../../core/commands/thinkingCommandRuntime.js';
import * as files from '../store/sessionFileStore.js';

let home: string;
let sessionId: string;
let server: http.Server;
let baseUrl: string;
const requests: { url: string; authorization?: string; apiKey?: string; body: Record<string, unknown> }[] = [];
beforeEach(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-catalog-target-'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('OPENAI_API_KEY', '');
  requests.length = 0;
  server = http.createServer(async (request, response) => {
    if (request.method === 'GET') {
      requests.push({ url: request.url!, body: {} });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'shared' }] }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({ url: request.url!, authorization: request.headers.authorization, apiKey: request.headers['x-api-key'] as string | undefined,
      body: JSON.parse(Buffer.concat(chunks).toString()) });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(request.url?.startsWith('/b/')
      ? { id: 'fixture', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'Relay B answered.' }], stop_reason: 'end_turn', usage: { input_tokens: 4, output_tokens: 1 } }
      : { choices: [{ message: { role: 'assistant', content: 'Relay A answered.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture address unavailable');
  baseUrl = `http://127.0.0.1:${address.port}`;
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'a', reserveTokens: 0, maxOutputTokens: 100, retryEnabled: false,
    providerConnections: ['a', 'b'].map(id => ({ id, provider: 'openai', authType: 'api-key', apiKey: `synthetic-${id}`,
      model: 'shared', baseUrl: `${baseUrl}/${id}/v1`, thinkingEffort: 'high', status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01' })) }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  catalogue();
  sessionId = new SessionManager().createNew(home).id;
});
afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true });
});
const context = () => ({ cwd: home, projectRoot: home, sessionId });
const row = (connection: string, owner = 'openai') => `model:${JSON.stringify([connection, owner, 'shared'])}`;
function catalogue(extra: object[] = []) {
  writeCatalogCache(mergeProviders([
    { id: 'openai', models: [{ id: 'shared', reasoning: false, contextWindow: 64000, maxTokens: 4000 }] },
    { id: 'relay-a', runtime: 'openai', baseUrl: `${baseUrl}/a/v1`, endpoint: 'openai-compatible', models: [{ id: 'shared', reasoning: true,
      contextWindow: 16000, maxTokens: 100, thinkingLevelMap: { high: 'strong' }, serviceTiers: ['flex'], compat: { maxTokensField: 'max_completion_tokens', supportsTemperature: false } }] },
    { id: 'relay-b', runtime: 'openai', baseUrl: `${baseUrl}/b/v1`, endpoint: 'anthropic-messages', models: [{ id: 'shared', reasoning: true,
      contextWindow: 32000, maxTokens: 200, thinkingLevelMap: { high: null } }] },
  ] as CatalogProvider[], extra));
}
async function send() {
  const config = projectSessionModel(getRuntimeConfig(home), sessionId);
  const resolution = resolveProviderCredential({ runtimeConfig: config, env: {} });
  const step = createProviderStep({ runtimeConfig: config, providerCatalog: loadCatalog(), providerCredentialResolution: resolution,
    providerMode: 'real', agentMode: 'build', workspaceRoot: home, sessionId, ...captureThinkingPreference(home, resolution.thinkingEffort) }, new Map(), {});
  return step([{ role: 'user', content: 'Check this relay metadata.' }], new AbortController().signal, {}, { allowTools: false });
}

function nativeSelection(auth: 'account' | 'api-key') {
  const origin = 'https://generativelanguage.googleapis.com';
  const compatible = `${origin}/v1beta/openai`;
  writeUserRuntimeConfigFile({ provider: 'google', activeProviderConnectionId: 'native', reserveTokens: 0, retryEnabled: false,
    providerConnections: [{ id: 'native', provider: 'google', model: 'shared', thinkingEffort: null, status: 'connected',
      authType: auth === 'account' ? 'account-auth' : 'api-key',
      ...(auth === 'account' ? { accountAuth: { google: { type: 'google-gemini-account' as const, accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh',
        expiresAt: Date.now() + 60000, clientId: 'synthetic-client', scopes: ['https://www.googleapis.com/auth/cloud-platform'], quotaProject: 'synthetic-project' } } }
        : { apiKey: 'synthetic-api', baseUrl: compatible }), createdAt: '2026-01-01', updatedAt: '2026-01-01' }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache([{ id: 'google', baseUrl: compatible, models: [{ id: 'shared', reasoning: true, contextWindow: 16000, thinkingLevelMap: { high: 'strong' } }] },
    { id: 'native-catalog', runtime: 'google', baseUrl: origin, models: [{ id: 'shared', reasoning: true, contextWindow: 32000, thinkingLevelMap: { high: null } }] }]);
  writeSessionModel(sessionId, { connectionId: 'native', connectionScope: 'session', provider: 'google', model: 'shared', thinkingEffort: null }, readSessionModelEdit(sessionId));
  const config = projectSessionModel(getRuntimeConfig(home), sessionId);
  const resolution = resolveProviderCredential({ runtimeConfig: config, env: {} });
  expect(resolution.blocked).toBeUndefined();
  expect(resolution.credential?.connectionId).toBe('native');
  expect(providerCredentialBaseUrl(loadCatalog(), resolution)).toBe(auth === 'account' ? origin : compatible);
  return auth === 'account' ? 32000 : 16000;
}

it.each((['model', 'thinking', 'thinking-picker'] as const).flatMap(route => (['account', 'api-key'] as const).map(auth => ({ route, auth }))))(
  'checks issuer effort capability for $auth through $route', async ({ route, auth }) => {
  nativeSelection(auth);
  const files = [getUserRuntimeConfigPath(), getUserAuthPath()];
  const bytes = files.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined);
  const before = readSessionModelEdit(sessionId);
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No remote request is admitted by this fixture.'));
  let output: string | undefined;
  if (route === 'model') output = (await runModelCommand(['shared', '--effort', 'high'], context())).output;
  else if (route === 'thinking') output = (await runThinkingCommand(['high'], context())).output;
  else {
    const picker = thinkingPicker(context());
    const levels = await picker.load();
    expect(levels.find(level => level.id === 'high')?.disabled).toBe(auth === 'account');
    expect(levels.find(level => level.id === 'low')?.disabled).toBe(false);
    output = (await picker.apply(['high']))?.note;
  }
  if (auth === 'account') {
    expect(output).toContain('does not support');
    expect(readSessionModelEdit(sessionId)).toEqual(before);
  } else {
    expect(output).toContain('Model switched');
    expect(readSessionModel(sessionId)?.thinkingEffort).toBe('high');
  }
  expect(files.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined)).toEqual(bytes);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['account', 'api-key'] as const)('saves the exact issuer window for %s', async auth => {
  const window = nativeSelection(auth);
  const files = [getUserRuntimeConfigPath(), getUserAuthPath()];
  const bytes = files.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined);
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No remote request is admitted by this fixture.'));
  expect((await runExtendedContextCommand(['on'], context())).output).toContain(`(${window} tokens)`);
  expect(readSessionModel(sessionId)?.contextWindow).toBe(window);
  expect((await runExtendedContextCommand(['status'], context())).output).toContain(`on (${window} tokens)`);
  expect(files.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined)).toEqual(bytes);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['model', 'thinking'] as const)('accepts issuer-supported effort through %s despite incompatible relay metadata', async route => {
  nativeSelection('account');
  writeCatalogCache(loadCatalog().map(provider => ({ ...provider, models: provider.models.map(model => ({ ...model,
    thinkingLevelMap: { high: provider.id === 'native-catalog' ? 'strong' : null } })) })));
  const bytes = [getUserRuntimeConfigPath(), getUserAuthPath()].map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined);
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No remote request is admitted by this fixture.'));
  const output = route === 'model' ? (await runModelCommand(['shared', '--effort', 'high'], context())).output
    : (await runThinkingCommand(['high'], context())).output;
  expect(output).toContain('Model switched');
  expect(readSessionModel(sessionId)?.thinkingEffort).toBe('high');
  expect([getUserRuntimeConfigPath(), getUserAuthPath()].map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined)).toEqual(bytes);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['hook', 'lock'] as const)('refuses an issuer catalogue change during the %s before saving', async stage => {
  nativeSelection('account');
  const before = readSessionModelEdit(sessionId);
  const documents = [getUserRuntimeConfigPath(), getUserAuthPath()];
  const bytes = documents.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined);
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No remote request is admitted by this fixture.'));
  const replace = () => writeCatalogCache(loadCatalog().map(provider => provider.id === 'native-catalog'
    ? { ...provider, models: provider.models.map(model => ({ ...model, contextWindow: 64000 })) } : provider));
  let output: string;
  if (stage === 'hook') {
    vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
      if (event.eventName === 'PreModelSwitch') replace();
      return undefined;
    });
    output = (await runThinkingCommand(['low'], context())).output;
    expect(output).toContain('conflict');
  } else {
    const lock = files.withFileLock;
    vi.spyOn(files, 'withFileLock').mockImplementation((file, action, options) => lock(file, () => {
      if (file.endsWith('state.lock')) replace();
      return action();
    }, options));
    output = (await runExtendedContextCommand(['on'], context())).output;
    expect(output).toContain('unverified');
  }
  expect(readSessionModelEdit(sessionId)).toEqual(before);
  expect(documents.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined)).toEqual(bytes);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['account', 'api-key'] as const)('browses and selects the exact issuer catalogue for %s', async auth => {
  const window = nativeSelection(auth);
  const files = [getUserRuntimeConfigPath(), getUserAuthPath()];
  const bytes = files.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined);
  const before = readSessionModelEdit(sessionId);
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No remote request is admitted by this fixture.'));
  const picker = modelPicker(context());
  const rows = await picker.load();
  const id = row('native', auth === 'account' ? 'native-catalog' : 'google');
  expect(rows.find(item => item.id === id)).toMatchObject({ note: 'active' });
  expect(rows.filter(item => item.note === 'active').map(item => item.id)).toEqual([id]);
  expect(rows.find(item => item.id === id)?.disabled).not.toBe(true);
  expect(picker.detail?.(id)).toContain(`Context: ${window} tokens`);
  expect(picker.detail?.(row('native', 'google'))).toContain(`Context: ${window} tokens`);
  expect(readSessionModelEdit(sessionId)).toEqual(before);
  expect((await picker.apply([id]))?.note).toContain('Connection: native');
  expect((await runExtendedContextCommand(['on'], context())).output).toContain(`(${window} tokens)`);
  expect(files.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined)).toEqual(bytes);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['pending', 'error'] as const)('keeps the explicit issuer setup row for a %s incomplete account', async status => {
  nativeSelection('account');
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const native = edit.values.providerConnections![0]!;
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: [{ ...native, status,
    baseUrl: 'https://generativelanguage.googleapis.com', accountAuth: { google: { ...native.accountAuth!.google!, quotaProject: '' } } }] }, edit);
  const documents = [getUserRuntimeConfigPath(), getUserAuthPath()];
  const bytes = documents.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined);
  const before = readSessionModelEdit(sessionId);
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No remote request is admitted by this fixture.'));
  const picker = modelPicker(context());
  const rows = await picker.load();
  expect(rows.find(item => item.id === row('native', 'native-catalog'))).toMatchObject({ disabled: true,
    note: status === 'pending' ? 'setup pending' : 'setup error' });
  expect(picker.detail?.(row('native', 'native-catalog'))).toContain('Context: 32000 tokens');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
  expect(documents.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined)).toEqual(bytes);
  expect(fetch).not.toHaveBeenCalled();
});

it('refuses to label duplicate issuer catalogue owners active', async () => {
  nativeSelection('account');
  const catalog = loadCatalog();
  writeCatalogCache([...catalog, { ...catalog.find(provider => provider.id === 'native-catalog')!, id: 'native-duplicate', label: 'Native duplicate' }]);
  const before = readSessionModelEdit(sessionId);
  const documents = [getUserRuntimeConfigPath(), getUserAuthPath()];
  const bytes = documents.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined);
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No remote request is admitted by this fixture.'));
  const picker = modelPicker(context());
  const rows = await picker.load();
  for (const owner of ['native-catalog', 'native-duplicate']) {
    expect(rows.find(item => item.id === row('native', owner))).toMatchObject({ disabled: true, note: 'model catalogue endpoint is ambiguous' });
  }
  expect((await picker.apply([row('native', 'native-catalog')]))?.note).toContain('unavailable');
  expect(rows.filter(item => item.note === 'active').map(item => item.id)).toEqual(['model:current']);
  expect(picker.detail?.('model:current')).toContain('Model capabilities: unverified');
  expect(picker.detail?.('model:current')).not.toContain('Context: 16000 tokens');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
  expect(documents.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined)).toEqual(bytes);
  expect(fetch).not.toHaveBeenCalled();
});

it.each((['account', 'api-key'] as const).flatMap(auth => (['connection', 'catalogue'] as const).flatMap(target =>
  (['session', 'profile'] as const).map(scope => ({ auth, target, scope })))))('saves and applies $scope issuer preset using $auth $target targets', async ({ auth, target, scope }) => {
  const window = nativeSelection(auth);
  writeCatalogCache(loadCatalog().map(provider => ({ ...provider, models: provider.models.map(model => ({ ...model,
    thinkingLevelMap: { high: provider.id === 'native-catalog' || auth === 'api-key' ? 'strong' : null } })) })));
  const documents = [getUserRuntimeConfigPath(), getUserAuthPath()];
  const bytes = documents.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined);
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No remote request is admitted by this fixture.'));
  const owner = target === 'connection' ? 'native' : auth === 'account' ? 'native-catalog' : 'google';
  const saved = await runModelPresetCommand(['save', 'issuer', ...(scope === 'profile' ? ['--profile'] : []), `default=${owner}/shared@high`, `summary=${owner}/shared@high`], context());
  expect(saved.output).toContain("Model preset 'issuer' saved");
  expect((await runModelPresetCommand(['validate', 'issuer'], context())).output).toContain('is valid');
  expect((await runModelPresetCommand(['apply', 'issuer', '--all'], context())).output).toContain('all roles applied');
  expect(readSessionModel(sessionId)).toMatchObject({ connectionId: 'native', thinkingEffort: 'high',
    roles: { summary: { connectionId: 'native', provider: 'google', model: 'shared', thinkingEffort: 'high' } } });
  const summary = captureSummaryRole({ config: projectSessionModel(getRuntimeConfig(home), sessionId), catalog: loadCatalog(), workspaceRoot: home });
  expect(summary?.limits.contextWindow).toBe(window);
  expect(documents.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined)).toEqual(bytes);
  expect(fetch).not.toHaveBeenCalled();
});

it.each((['data', 'text'] as const).flatMap(route => (['account', 'api-key'] as const).map(auth => ({ route, auth }))))(
  'lists the exact $auth catalogue through the $route reader', async ({ route, auth }) => {
  const origin = 'https://generativelanguage.googleapis.com';
  const config = { ...getRuntimeConfig(home), provider: 'google' as const, activeProviderConnectionId: 'native', providerCredentials: {},
    providerConnections: [{ id: 'native', provider: 'google' as const, model: auth === 'account' ? 'native-model' : 'compatible-only',
      authType: auth === 'account' ? 'account-auth' as const : 'api-key' as const,
      ...(auth === 'account' ? { accountAuth: { google: { type: 'google-gemini-account' as const, accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh',
        expiresAt: Date.now() + 60000, clientId: 'synthetic-client', scopes: ['https://www.googleapis.com/auth/cloud-platform'], quotaProject: 'synthetic-project' } } } : { apiKey: 'synthetic-api', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' }),
      createdAt: '2026-01-01', updatedAt: '2026-01-01' }] };
  writeCatalogCache([{ id: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: [{ id: 'compatible-only' }] },
    { id: 'native-catalog', runtime: 'google', baseUrl: origin, models: [{ id: 'native-model' }] },
    { id: 'other-catalog', runtime: 'google', baseUrl: 'https://other.invalid', models: [{ id: 'other-model' }] }]);
  const resolved = resolveProviderCredential({ runtimeConfig: config, env: {} });
  expect(resolved.blocked).toBeUndefined();
  expect(providerCredentialBaseUrl(loadCatalog(), resolved)).toBe(auth === 'account' ? origin : 'https://generativelanguage.googleapis.com/v1beta/openai');
  const files = [getUserRuntimeConfigPath(), getUserAuthPath()];
  const bytes = files.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined);
  if (route === 'data') {
    const listed = (await readModelCatalog(false, sessionId, config)).models;
    if (auth === 'account') expect(listed).toEqual(['native-model']);
    else { expect(listed).toContain('compatible-only'); expect(listed).not.toContain('native-model'); }
  } else {
    const output = (await runModelCommand(['list'], { ...context(), runtimeConfig: config })).output;
    expect(output).toContain(`* ${auth === 'account' ? 'native-model' : 'compatible-only'} (active)`);
    expect(output).not.toContain(auth === 'account' ? 'compatible-only' : 'native-model');
  }
  const explicit = (await runModelCommand(['list', 'other-catalog'], { ...context(), runtimeConfig: config })).output;
  expect(explicit).toContain('- other-model');
  expect(explicit).not.toContain('(active)');
  expect(requests).toHaveLength(0);
  expect(files.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined)).toEqual(bytes);
});

it('shows and sends exact relay metadata through both generic and relay-specific catalogue rows', async () => {
  const global = fs.readFileSync(getUserRuntimeConfigPath());
  const picker = modelPicker(context());
  const rows = await picker.load();
  for (const owner of ['openai', 'relay-a']) {
    expect(rows.find(item => item.id === row('a', owner))?.disabled).not.toBe(true);
    expect(picker.detail?.(row('a', owner))).toContain('Context: 16000 tokens');
  }
  expect(rows.find(item => item.id === row('b'))?.disabled).toBe(true);
  expect(picker.detail?.(row('b'))).toContain('Context: 32000 tokens');
  expect(requests).toHaveLength(0);
  expect((await readModelCatalog(false, sessionId, getRuntimeConfig(home))).models).toEqual(['shared']);
  expect((await runModelCommand(['list'], context())).output).not.toContain('gpt-5.3');
  expect((await picker.apply([row('a', 'relay-a')]))?.note).toContain('Connection: a');
  expect(setSessionServiceTier(context(), 'flex')).toContain('Service tier set to flex');
  expect((await runExtendedContextCommand(['on'], context())).output).toContain('16000');
  expect((await send()).text).toContain('Relay A answered.');
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ url: '/a/v1/chat/completions', authorization: 'Bearer synthetic-a', body: {
    model: 'shared', reasoning_effort: 'strong', max_completion_tokens: 100, service_tier: 'flex',
  } });
  expect(requests[0].body).not.toHaveProperty('temperature');
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
});

it('uses another protocol and its output ceiling after explicitly choosing a compatible effort', async () => {
  expect((await runModelCommand(['shared', '--effort', 'auto'], context())).output).toContain('Model switched');
  const picker = modelPicker(context()); await picker.load();
  expect((await picker.apply([row('b', 'relay-b')]))?.note).toContain('Connection: b');
  expect(setSessionServiceTier(context(), 'flex')).toContain('does not advertise flex');
  expect((await runExtendedContextCommand(['on'], context())).output).toContain('32000');
  expect((await send()).text).toContain('Relay B answered.');
  expect(requests[0]).toMatchObject({ url: '/b/v1/messages', apiKey: 'synthetic-b', body: { model: 'shared', max_tokens: 100 } });
  const thinking = thinkingPicker(context());
  expect((await thinking.load()).find(item => item.id === 'high')?.disabled).toBe(true);
  expect((await thinking.apply(['high']))?.note).toContain('does not support');
  expect(readSessionModel(sessionId)?.thinkingEffort).toBeNull();
});

it('binds thinking choices and selection hooks to the displayed relay catalogue revision', async () => {
  const thinking = thinkingPicker(context()); await thinking.load();
  catalogue([{ id: 'relay-a', models: [{ id: 'shared', reasoning: false }] }]);
  const before = readSessionModelEdit(sessionId);
  expect((await thinking.apply(['high']))?.note).toContain('expired');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
  catalogue();
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') catalogue([{ id: 'relay-a', models: [{ id: 'shared', maxTokens: 50 }] }]);
    return undefined;
  });
  expect((await runModelCommand(['shared'], context())).output).toContain('conflict');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
  expect(requests).toHaveLength(0);
});

it('validates preset roles and summary limits against their own relay metadata', async () => {
  expect((await runModelPresetCommand(['save', 'work', '--profile', 'default=a/shared@high', 'summary=a/shared@high'], context())).output).toContain('saved');
  expect((await runModelPresetCommand(['apply', 'work', '--all'], context())).output).toContain('all roles applied');
  const config = projectSessionModel(getRuntimeConfig(home), sessionId);
  const summary = captureSummaryRole({ config, catalog: loadCatalog(), workspaceRoot: home });
  expect(summary?.limits).toMatchObject({ contextWindow: 16000, maxOutputTokens: 100 });
  expect((await summary?.resolve())?.shape).toMatchObject({ thinkingLevelName: 'strong', maxTokensField: 'max_completion_tokens', supportsTemperature: false });
  expect((await runModelPresetCommand(['save', 'invalid', '--profile', 'default=a/shared@high', 'summary=b/shared@high'], context())).output).toContain('unsupported');
  expect(requests).toHaveLength(0);
});

it('edits summary effort using the exact relay capability while preserving the default relay effort', async () => {
  writeCatalogCache(loadCatalog().map(provider => provider.id === 'relay-b' ? { ...provider, endpoint: 'openai-compatible' } : provider));
  expect((await runModelPresetCommand(['save', 'work', '--profile', 'default=a/shared@high', 'summary=b/shared@auto'], context())).output).toContain('saved');
  expect((await runModelPresetCommand(['apply', 'work', '--all'], context())).output).toContain('all roles applied');
  const before = readSessionModel(sessionId)!;
  const picker = modelPicker(context()); await picker.load();
  const role = (await picker.inspect!('role:summary'))!.next!; await role.load();
  const thinking = (await role.apply(['thinking']))!.next!;
  expect((await thinking.load()).map(row => row.id)).toEqual(['auto', 'low', 'medium']);
  expect(await thinking.apply(['high'])).toBeUndefined();
  expect((await thinking.apply(['low']))?.note).toContain('summary uses');
  expect(readSessionModel(sessionId)).toEqual({ ...before, roles: { ...before.roles,
    summary: { ...before.roles!.summary!, thinkingEffort: 'low' } } });
  const config = projectSessionModel(getRuntimeConfig(home), sessionId);
  expect(resolveProviderCredential({ runtimeConfig: config, env: {} }).thinkingEffort).toBe('high');
  expect((await captureSummaryRole({ config, catalog: loadCatalog(), workspaceRoot: home })!.resolve()).shape.thinkingLevelName).toBe('low');
  expect(requests).toHaveLength(0);
});

it('rejects duplicate endpoint catalogue claims before selection or HTTP dispatch', async () => {
  catalogue([{ id: 'duplicate', runtime: 'openai', baseUrl: `${baseUrl}/a/v1`, models: [{ id: 'shared' }] }]);
  const picker = modelPicker(context());
  expect((await picker.load()).find(item => item.id === row('a'))?.disabled).toBe(true);
  expect((await runModelCommand(['shared'], context())).output).toContain('multiple catalogue entries');
  await expect(send()).rejects.toThrow('multiple entries');
  expect(requests).toHaveLength(0);
  expect(readSessionModel(sessionId)).toBeUndefined();
});

it.each([false, true])('refuses ambiguous metadata before real readiness or side requests (default address: %s)', async useDefault => {
  if (useDefault) {
    writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: undefined, providerConnections: [], providerCredentials: { openai: { apiKey: 'synthetic-default', model: 'shared' } }, maxOutputTokens: 100, reserveTokens: 0 }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  }
  catalogue([{ id: 'openai', baseUrl: `${baseUrl}/a/v1` },
    { id: 'duplicate', runtime: 'openai', baseUrl: `${baseUrl}/a/v1`, models: [{ id: 'shared' }] }]);
  const config = getRuntimeConfig(home);
  const resolution = resolveProviderCredential({ runtimeConfig: config, env: {} });
  if (useDefault) { expect(resolution.baseUrl).toBeUndefined(); expect(resolution.credential?.baseUrl).toBeUndefined(); }
  const readiness = vi.fn(checkRealProviderReadiness);
  const result = await runCliRuntimeInvocation({ sessionId, workspaceRoot: home, prompt: 'No request may be sent.',
    signal: new AbortController().signal, maxTurns: 1, agentMode: 'build', runtimeConfig: config, providerCatalog: loadCatalog(),
    providerModeEnv: 'real', providerCredentialResolution: resolution,
    escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: 'deny', respondedAt: Date.now() }),
  }, { checkProviderReadiness: readiness, createReadinessTerminalEvent: createProviderReadinessCliTerminalEvent, tools: () => new Map() });
  const events = []; for await (const event of result.events) events.push(event);
  expect(JSON.stringify(events)).toContain('multiple model catalogue entries');
  expect(readiness).not.toHaveBeenCalled();
  expect((await runBtwCommand(['No request may be sent.'], context())).output).toContain('multiple model catalogue entries');
  expect((await readModelCatalog(false, sessionId, config)).models).toEqual([]);
  expect((await runModelCommand(['list'], context())).output).toContain('multiple catalogue entries');
  expect(requests).toHaveLength(0);
});

it('uses default-address relay metadata consistently from picker and commands through main and side requests', async () => {
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: undefined, providerConnections: [], providerCredentials: { openai: { apiKey: 'synthetic-default', model: 'shared' } },
    maxOutputTokens: 100, reserveTokens: 0, retryEnabled: false }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  catalogue([{ id: 'openai', baseUrl: `${baseUrl}/a/v1` }]);
  const picker = modelPicker(context());
  const rows = await picker.load();
  expect(picker.detail?.('model:' + JSON.stringify([null, 'openai', 'shared']))).toContain('Context: 16000 tokens');
  expect(rows.find(item => item.id === 'model:' + JSON.stringify([null, 'relay-a', 'shared']))?.disabled).not.toBe(true);
  expect(picker.detail?.('model:' + JSON.stringify([null, 'relay-a', 'shared']))).toContain('Context: 16000 tokens');
  expect((await runModelCommand(['shared', '--effort', 'high'], context())).output).toContain('Model switched');
  expect((await send()).text).toContain('Relay A answered.');
  expect((await runBtwCommand(['Use the same relay.'], context())).output).toContain('Relay A answered.');
  expect(requests.map(request => request.url)).toEqual(['/a/v1/chat/completions', '/a/v1/chat/completions']);
  expect(requests[0].body).toMatchObject({ reasoning_effort: 'strong', max_completion_tokens: 100 });
  expect(requests[0].body).not.toHaveProperty('temperature');
  expect(requests[1].body).toMatchObject({ max_completion_tokens: 100 });
});
