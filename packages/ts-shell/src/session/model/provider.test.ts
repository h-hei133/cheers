import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile, type RuntimeConfig } from '../../config/runtimeConfig.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel, decodeSessionModel } from './state.js';
import { projectSessionModel } from './projection.js';
import { runModelCommand } from '../../core/commands/modelCommandRuntime.js';
import { runThinkingCommand } from '../../core/commands/thinkingCommandRuntime.js';
import { runExtendedContextCommand } from '../../core/commands/model/context.js';
import { setSessionServiceTier } from '../../core/commands/model/serviceTier.js';
import { runModelPresetCommand } from '../../core/commands/model/presetCommand.js';
import { modelPicker } from '../../cli/interactive/picker/model.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { loadCatalog, writeCatalogCache } from '../../core/models/catalogStore.js';
import { defaultHookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig, switchActiveSession } from '../../core/shell/runtimeContext.js';
import { createCliProviderRuntimeBridge } from '../../cli/provider/cliProviderRuntimeBridge.js';
import { createProviderStep } from '../../cli/provider/step.js';
import { captureThinkingPreference } from '../../core/models/preference.js';
import * as files from '../store/sessionFileStore.js';

let home: string;
let manager: SessionManager;
let sessionId: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-provider-model-'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('OPENAI_API_KEY', '');
  writeUserRuntimeConfigFile({ provider: 'openai', providerConnections: [], providerCredentials: { openai: {
    apiKey: 'synthetic-profile', baseUrl: 'https://profile.invalid/v1', model: 'base', thinkingEffort: 'low',
  } } }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache([{ id: 'openai', models: [{ id: 'base', reasoning: true },
    { id: 'next', reasoning: true, contextWindow: 32000, serviceTiers: ['default', 'flex'] }] }]);
  manager = new SessionManager(); sessionId = manager.createNew(home).id;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });
const context = () => ({ cwd: home, projectRoot: home, sessionId });
const row = (model = 'next') => `model:${JSON.stringify([null, 'openai', model])}`;
function connection() {
  return { id: 'named', provider: 'openai' as const, authType: 'api-key' as const, apiKey: 'synthetic-named',
    baseUrl: 'https://named.invalid/v1', model: 'named-model', status: 'connected' as const, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
}

it.each(['config', 'env', 'cli'] as const)('selects %s models through the picker and command, publishes, and resumes without inventing a connection', async source => {
  if (source === 'env') vi.stubEnv('OPENAI_API_KEY', 'synthetic-env');
  const options = source === 'cli' ? { apiKey: 'synthetic-cli', baseUrl: 'https://cli.invalid/v1' } : {};
  const shell = createShellRuntimeContext({ cwd: home, originalCwd: home, projectRoot: home, targetPathBase: home,
    rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
    session: manager.getSession(sessionId)!, runtimeConfig: getRuntimeConfig(home) });
  const bridge = createCliProviderRuntimeBridge({ runtimeConfig: () => shell.runtimeConfig, options });
  const command = { ...context(), readConfiguration: () => shell.configuration.current,
    resolveConfigTarget: (config: RuntimeConfig) => resolveProviderCredential({ runtimeConfig: config, cliApiKey: options.apiKey, cliBaseUrl: options.baseUrl }),
    refreshRuntimeConfig: () => refreshShellRuntimeConfig(shell) };
  const global = fs.readFileSync(getUserRuntimeConfigPath());
  const before = bridge.resolveCredentialSnapshot();
  expect(before.credential).toMatchObject({ source, model: 'base' });
  expect(before.credential?.connectionId).toBeUndefined();
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('discovery must not send'));
  const picker = modelPicker(command);
  expect((await picker.load()).find(item => item.id === row())).toMatchObject({ label: 'next', note: 'ready' });
  expect((await picker.apply([row()]))?.note).toContain('Model switched to next');
  expect(readSessionModel(sessionId)).toMatchObject({ connectionScope: 'provider', provider: 'openai', model: 'next', thinkingEffort: 'low' });
  expect(readSessionModel(sessionId)?.connectionId).toBeUndefined();
  expect(bridge.resolveCredentialSnapshot().credential).toEqual({ ...before.credential, model: 'next' });
  expect((await runThinkingCommand(['high'], command)).output).toContain('Reasoning effort: high');
  expect(setSessionServiceTier(command, 'flex')).toContain('Service tier set to flex');
  expect((await runExtendedContextCommand(['on'], command)).output).toContain('32000');
  expect(shell.runtimeConfig.providerCredentials.openai).toMatchObject({ model: 'next', thinkingEffort: 'high', serviceTier: 'flex' });
  expect(shell.runtimeConfig.contextWindow).toBe(32000);
  expect(shell.runtimeConfig.configProvenance.providerCredentials.children?.openai.children?.model.sources).toEqual(['session']);
  expect(shell.runtimeConfig.configProvenance.providerConnections.children).toBeUndefined();
  manager.persistUserPromptBarrier(sessionId, 'retain provider model'); manager.saveInterrupted(sessionId);
  const restarted = new SessionManager(); expect(restarted.tryResume(sessionId)).toMatchObject({ ok: true });
  switchActiveSession(shell, manager.createNew(home));
  expect(bridge.resolveCredentialSnapshot().model).toBe('base');
  switchActiveSession(shell, restarted.getSession(sessionId)!);
  expect(bridge.resolveCredentialSnapshot().credential).toEqual({ ...before.credential, model: 'next' });
  expect(bridge.resolveCredentialSnapshot().thinkingEffort).toBe('high');
  expect((await runModelCommand(['base'], command)).output).toContain('Model switched to base');
  expect(readSessionModel(sessionId)).not.toHaveProperty('serviceTier');
  expect(readSessionModel(sessionId)).not.toHaveProperty('contextWindow');
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
  expect(fetch).not.toHaveBeenCalled();
});

it('writes only an explicitly requested global provider model and retains its credential', async () => {
  expect((await runModelCommand(['next', '--global'], context())).output).toContain('Global default stored at');
  const saved = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
  expect(saved.providerConnections).toEqual([]);
  expect(saved.activeProviderConnectionId).toBeUndefined();
  expect(saved.providerCredentials?.openai).toMatchObject({ model: 'next', apiKey: 'synthetic-profile', baseUrl: 'https://profile.invalid/v1' });
  expect(resolveProviderCredential({ runtimeConfig: getRuntimeConfig(home) }).model).toBe('next');
});

it.each(['command', 'picker'] as const)('keeps the actual CLI provider effort through the %s when the global provider differs', async route => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, providerCredentials: {
    openai: { ...edit.values.providerCredentials!.openai, thinkingEffort: 'high' },
    google: { apiKey: 'synthetic-google', model: 'base', thinkingEffort: 'low' },
  } }, edit);
  writeCatalogCache([{ id: 'google', models: [{ id: 'next', reasoning: true }] }]);
  const command = { ...context(), resolveConfigTarget: (config: RuntimeConfig) => resolveProviderCredential({ runtimeConfig: config, cliProvider: 'google', env: {} }) };
  if (route === 'command') expect((await runModelCommand(['next'], command)).output).toContain('Reasoning effort: low');
  else {
    const picker = modelPicker(command); await picker.load();
    expect((await picker.apply([`model:${JSON.stringify([null, 'google', 'next'])}`]))?.note).toContain('Reasoning effort: low');
  }
  expect(readSessionModel(sessionId)).toMatchObject({ connectionScope: 'provider', provider: 'google', model: 'next', thinkingEffort: 'low' });
  expect(command.resolveConfigTarget(projectSessionModel(getRuntimeConfig(home), sessionId))).toMatchObject({ provider: 'google', model: 'next', thinkingEffort: 'low' });
});

it.each(['config', 'env', 'cli'] as const)('sends the selected %s model, effort and tier to its actual HTTP endpoint', async source => {
  const requests: { url: string; authorization?: string; body: Record<string, unknown> }[] = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({ url: request.url!, authorization: request.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString()) });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Provider selection received.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Fixture address unavailable');
    const baseUrl = `http://127.0.0.1:${address.port}/v1`;
    const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    writeUserRuntimeConfigFile({ ...edit.values, maxOutputTokens: 100, reserveTokens: 0, retryEnabled: false,
      providerCredentials: { openai: { ...edit.values.providerCredentials!.openai, baseUrl } } }, edit);
    if (source === 'env') vi.stubEnv('OPENAI_API_KEY', 'synthetic-env');
    const resolveConfigTarget = (config: RuntimeConfig) => resolveProviderCredential({ runtimeConfig: config,
      ...(source === 'cli' ? { cliApiKey: 'synthetic-cli', cliBaseUrl: baseUrl } : {}) });
    const command = { ...context(), resolveConfigTarget };
    expect((await runModelCommand(['next', '--effort', 'high'], command)).output).toContain('Model switched to next');
    expect(setSessionServiceTier(command, 'flex')).toContain('Service tier set to flex');
    const config = projectSessionModel(getRuntimeConfig(home), sessionId);
    const resolution = resolveConfigTarget(config);
    const step = createProviderStep({ providerMode: 'real', providerCredentialResolution: resolution, runtimeConfig: config,
      ...captureThinkingPreference(home, resolution.thinkingEffort),
      providerCatalog: loadCatalog(), agentMode: 'build', workspaceRoot: home, sessionId }, new Map(), {});
    expect((await step([{ role: 'user', content: 'Check the selected provider model.' }], new AbortController().signal, {}, { allowTools: false })).text).toContain('Provider selection received.');
    expect(requests).toEqual([{ url: '/v1/chat/completions', authorization: `Bearer synthetic-${source === 'config' ? 'profile' : source}`,
      body: expect.objectContaining({ model: 'next', reasoning_effort: 'high', service_tier: 'flex' }) }]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

it('retains a provider credential namespace when a named connection is added and refuses fallback after credential removal', async () => {
  await runModelCommand(['next'], context());
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, activeProviderConnectionId: 'named', providerConnections: [connection()] }, edit);
  const selected = projectSessionModel(getRuntimeConfig(home), sessionId);
  expect(resolveProviderCredential({ runtimeConfig: selected, env: {} }).credential).toMatchObject({ source: 'config', apiKey: 'synthetic-profile', model: 'next' });
  const changed = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...changed.values, providerCredentials: { openai: { model: 'base' } } }, changed);
  expect(resolveProviderCredential({ runtimeConfig: projectSessionModel(getRuntimeConfig(home), sessionId), env: {} }).credential).toBeUndefined();
  const picker = modelPicker(context()); await picker.load();
  expect((await picker.apply([`model:${JSON.stringify(['named', 'openai', 'next'])}`]))?.note).toContain('Connection: named');
  expect(resolveProviderCredential({ runtimeConfig: projectSessionModel(getRuntimeConfig(home), sessionId), env: {} }).credential?.connectionId).toBe('named');
});

it.each(['env', 'cli'] as const)('keeps legacy %s credential resolution when publishing tier and context preferences', async source => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, activeProviderConnectionId: 'named', providerCredentials: {},
    providerConnections: [{ ...connection(), apiKey: undefined }] }, edit);
  if (source === 'env') vi.stubEnv('OPENAI_API_KEY', 'synthetic-env');
  writeSessionModel(sessionId, { connectionId: 'named', provider: 'openai', model: 'next' }, readSessionModelEdit(sessionId));
  const command = { ...context(), resolveConfigTarget: (config: RuntimeConfig) => resolveProviderCredential({ runtimeConfig: config,
    ...(source === 'cli' ? { cliApiKey: 'synthetic-cli' } : {}) }) };
  expect(setSessionServiceTier(command, 'flex')).toContain('Service tier set to flex');
  expect((await runExtendedContextCommand(['on'], command)).output).toContain('32000');
  expect(readSessionModel(sessionId)).toMatchObject({ connectionId: 'named', serviceTier: 'flex', contextWindow: 32000 });
  expect(readSessionModel(sessionId)?.connectionScope).toBeUndefined();
  expect(command.resolveConfigTarget(projectSessionModel(getRuntimeConfig(home), sessionId)).credential?.source).toBe(source);
});

it('refuses a global provider save when a hook introduces a named default owner', async () => {
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') {
      const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
      writeUserRuntimeConfigFile({ ...edit.values, providerConnections: [connection()] }, edit);
    }
    return undefined;
  });
  expect((await runModelCommand(['next', '--global'], context())).output).toContain('conflict');
  expect(readSessionModel(sessionId)).toBeUndefined();
  expect(readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values.providerCredentials?.openai?.model).toBe('base');
});

it.each(['tier', 'context'] as const)('refuses %s preferences when the current CLI model differs from the saved provider selection', async kind => {
  await runModelCommand(['next'], context());
  const baseline = readSessionModelEdit(sessionId);
  const command = { ...context(), resolveConfigTarget: (config: RuntimeConfig) => resolveProviderCredential({ runtimeConfig: config, cliModel: 'base' }) };
  const output = kind === 'tier' ? setSessionServiceTier(command, 'flex') : (await runExtendedContextCommand(['on'], command)).output;
  expect(output).toContain('differs from the current request');
  expect(readSessionModelEdit(sessionId)).toEqual(baseline);
});

it.each(['tier', 'context'] as const)('refuses a legacy %s preference if the actual environment credential changes under the session lock', async kind => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, activeProviderConnectionId: 'named', providerCredentials: {},
    providerConnections: [{ ...connection(), apiKey: undefined }] }, edit);
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-env');
  writeSessionModel(sessionId, { connectionId: 'named', provider: 'openai', model: 'next' }, readSessionModelEdit(sessionId));
  const before = readSessionModelEdit(sessionId);
  const lock = files.withFileLock;
  vi.spyOn(files, 'withFileLock').mockImplementation((file, run, options) => lock(file, () => {
    if (file === before.statePath.replace(/state\.json$/, 'state.lock')) vi.stubEnv('OPENAI_API_KEY', 'synthetic-changed');
    return run();
  }, options));
  const output = kind === 'tier' ? setSessionServiceTier(context(), 'flex') : (await runExtendedContextCommand(['on'], context())).output;
  expect(output).toContain('write outcome is unverified');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it.each([{ connections: [] }, { connections: ['named'] }])('cannot use provider credentials to bypass a declared pool %j', async pool => {
  await runModelCommand(['next'], context());
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: [connection()], accountPool: { openai: pool } }, edit);
  const selected = projectSessionModel(getRuntimeConfig(home), sessionId);
  expect(resolveProviderCredential({ runtimeConfig: selected, cliApiKey: 'synthetic-cli', env: { OPENAI_API_KEY: 'synthetic-env' } }).blocked)
    .toBe(pool.connections.length === 0 ? 'pool-empty' : 'pool-required');
  const before = readSessionModelEdit(sessionId);
  expect((await runModelCommand(['base'], context())).output).toContain('blocked');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it.each(['credential', 'endpoint', 'pool', 'session', 'catalog', 'environment'] as const)('refuses a provider selection when %s changes during its hook', async change => {
  const before = readSessionModelEdit(sessionId);
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName !== 'PreModelSwitch') return undefined;
    const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    if (change === 'credential' || change === 'endpoint') writeUserRuntimeConfigFile({ ...edit.values, providerCredentials: { openai: {
      ...edit.values.providerCredentials!.openai, [change === 'credential' ? 'apiKey' : 'baseUrl']: 'synthetic-replaced',
    } } }, edit);
    else if (change === 'pool') writeUserRuntimeConfigFile({ ...edit.values, accountPool: { openai: { connections: [] } } }, edit);
    else if (change === 'session') writeSessionModel(sessionId, { connectionScope: 'provider', provider: 'openai', model: 'competing' }, before);
    else if (change === 'catalog') writeCatalogCache([{ id: 'openai', models: [{ id: 'next', reasoning: false }] }]);
    else vi.stubEnv('OPENAI_API_KEY', 'synthetic-new-env');
    return undefined;
  });
  expect((await runModelCommand(['next'], context())).output).toMatch(/blocked|conflict/);
  if (change === 'session') expect(readSessionModel(sessionId)?.model).toBe('competing');
  else expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it('rejects an expired provider picker before hooks and rejects a conflicting CLI model before saving', async () => {
  const picker = modelPicker(context()); await picker.load();
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-new-env');
  const hook = vi.spyOn(defaultHookDispatcher, 'dispatch');
  expect((await picker.apply([row()]))?.note).toContain('expired');
  expect(hook).not.toHaveBeenCalled();
  expect((await runModelCommand(['next'], { ...context(), resolveConfigTarget: config => resolveProviderCredential({ runtimeConfig: config, cliModel: 'base' }) })).output).toContain('overrides change its target');
  expect(readSessionModel(sessionId)).toBeUndefined();
});

it('reports a missing provider credential without manufacturing a saved connection or preset', async () => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, providerCredentials: {} }, edit);
  const global = fs.readFileSync(getUserRuntimeConfigPath());
  expect((await runModelCommand(['next'], context())).output).toContain('blocked');
  expect((await modelPicker(context()).load()).find(item => item.id === row())?.disabled).toBe(true);
  expect(readSessionModel(sessionId)).toBeUndefined();
  writeSessionModel(sessionId, { connectionScope: 'provider', provider: 'openai', model: 'next' }, readSessionModelEdit(sessionId));
  expect((await runModelPresetCommand(['save', 'provider'], context())).output).toContain('require a named connection');
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
});

it('decodes provider addresses explicitly and rejects ambiguous or implicit missing connections', () => {
  const target = { connectionScope: 'provider', provider: 'openai', model: 'next' };
  expect(decodeSessionModel(target)).toEqual(target);
  expect(decodeSessionModel({ ...target, connectionId: 'named' })).toBeUndefined();
  expect(decodeSessionModel({ provider: 'openai', model: 'next' })).toBeUndefined();
  expect(decodeSessionModel({ ...target, connectionScope: 'session' })).toBeUndefined();
});
