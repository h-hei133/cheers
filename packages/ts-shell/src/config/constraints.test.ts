import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserAuthPath, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile, type RuntimeConfigFile, type RuntimeProvider } from './runtimeConfig.js';
import { constrainRuntimeConfig, inspectConfigConstraints } from './constraints.js';
import { resolveProviderCredential } from '../core/shell/providerCredentials.js';
import { loadCatalog, userCatalogPath } from '../core/models/catalogStore.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig } from '../core/shell/runtimeContext.js';
import { configurationAdmission } from '../core/shell/configuration.js';
import { SessionManager } from '../session/SessionManager.js';
import { runModelCommand } from '../core/commands/modelCommandRuntime.js';
import { readSessionModelEdit } from '../session/model/state.js';
import { defaultHookDispatcher } from '../core/hooks/hookDispatcher.js';
import { resolveCliCredential } from '../cli/provider/cliProviderRuntimeBridge.js';

it('checks inactive model budgets against their own capacity instead of the main session window', () => {
  const config = { ...getRuntimeConfig(root), reserveTokens: 0, maxOutputTokens: 2000,
    sessionContextWindow: { provider: 'openai', model: 'roomy', connectionId: 'main', connectionScope: 'session' as const, value: 256000 },
    modelTokenBudgets: { 'openai/small': { reserveTokens: 20000 } } };
  const target = resolveProviderCredential({ runtimeConfig: config, env: {} });
  expect(inspectConfigConstraints(config, target, loadCatalog()).errors).toContain('modelTokenBudgets.reserveTokens must leave input space in the resolved context window.');
});

let root: string;
let file: string;
let settings: RuntimeConfigFile;
let manager: SessionManager;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-constraints-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
  file = getUserRuntimeConfigPath(); fs.mkdirSync(path.dirname(file), { recursive: true });
  settings = { provider: 'openai', activeProviderConnectionId: 'main', providerConnections: [{
    id: 'main', provider: 'openai', authType: 'api-key', model: 'roomy', apiKey: 'synthetic-private-key',
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }] };
  save();
  fs.writeFileSync(userCatalogPath(), JSON.stringify({ providers: {
    openai: { models: [
      { id: 'roomy', contextWindow: 128_000, maxTokens: 64_000 },
      { id: 'small', contextWindow: 16_000, maxTokens: 2_000 },
      { id: 'plain', contextWindow: 128_000, reasoning: false, compat: { supportsTemperature: false } },
    ] },
    google: { models: [{ id: 'alternate', contextWindow: 256_000, maxTokens: 64_000 }] },
  } }));
  manager = new SessionManager();
});

it.each((['legacy', 'split'] as const).flatMap(storage =>
  (['explicit', 'fallback', 'pool', 'override'] as const).map(selection => ({ storage, selection }))))(
  'reports the resolved $selection endpoint in $storage storage without exposing values or deleting independent defaults', ({ storage, selection }) => {
  const profileEndpoint = 'https://profile.invalid/v1';
  const connectionEndpoint = 'https://user:synthetic-password@relay.invalid/private-synthetic-path?token=synthetic-query#synthetic-fragment';
  settings = { ...settings, ...(selection === 'fallback' || selection === 'pool' ? { activeProviderConnectionId: undefined } : {}),
    providerConnections: settings.providerConnections!.map(item => ({ ...item, baseUrl: connectionEndpoint })),
    providerCredentials: { openai: { apiKey: 'synthetic-profile-key', baseUrl: profileEndpoint, model: 'roomy' } },
    ...(selection === 'pool' ? { accountPool: { openai: { connections: ['main'] } } } : {}) };
  save();
  if (storage === 'split') {
    writeUserRuntimeConfigFile(settings, readRuntimeConfigEditAt(file));
    const preferences = JSON.parse(fs.readFileSync(file, 'utf8'));
    const auth = JSON.parse(fs.readFileSync(getUserAuthPath(), 'utf8'));
    expect(preferences.providerCredentials).toBeUndefined();
    expect(preferences.providerConnections).toBeUndefined();
    expect(auth.providerCredentials.openai.baseUrl).toBe(profileEndpoint);
    expect(auth.providerConnections[0].baseUrl).toBe(connectionEndpoint);
  } else expect(fs.existsSync(getUserAuthPath())).toBe(false);
  const files = [file, getUserAuthPath()];
  const snapshot = () => files.map(source => fs.existsSync(source) ? fs.readFileSync(source) : undefined);
  const before = snapshot();
  const config = getRuntimeConfig(root);
  const target = resolveProviderCredential({ runtimeConfig: config, env: {},
    ...(selection === 'override' ? { cliBaseUrl: 'https://override.invalid/v1' } : {}) });
  expect(target.baseUrl).toBe(selection === 'override' ? 'https://override.invalid/v1' : connectionEndpoint);
  const accepted = constrainRuntimeConfig(config, target, loadCatalog());
  expect(accepted.configDiagnostics).toContain('The selected request endpoint overrides the stored provider endpoint. Other provider selections retain their own endpoint.');
  expect(accepted.configDiagnostics.join('\n')).not.toMatch(/synthetic-password|private-synthetic-path|synthetic-query|synthetic-fragment|synthetic-profile-key|relay\.invalid|override\.invalid/);
  expect(accepted.configDiagnostics.join('\n')).not.toContain('unused');
  expect(accepted.configValidation.valid).toBe(true);
  expect(config.providerCredentials.openai?.baseUrl).toBe(profileEndpoint);
  expect(constrainRuntimeConfig(accepted, target, loadCatalog()).configDiagnostics).toEqual(accepted.configDiagnostics);
  expect(snapshot()).toEqual(before);
  const own = resolveProviderCredential({ runtimeConfig: { ...config, activeProviderConnectionId: undefined,
    providerConnections: [], accountPool: undefined }, env: {} });
  expect(own.baseUrl).toBe(profileEndpoint);
});

it.each(['equal', 'absent', 'blocked', 'profile'] as const)('does not claim an endpoint override for a %s target', scenario => {
  const baseUrl = 'https://relay.invalid/v1';
  settings = { ...settings, providerCredentials: { openai: { apiKey: 'synthetic-profile', model: 'roomy',
    ...(scenario === 'absent' ? {} : { baseUrl: scenario === 'blocked' ? 'https://other.invalid/v1' : `${baseUrl}/` }) } },
    providerConnections: scenario === 'profile' ? [] : settings.providerConnections!.map(item => ({ ...item,
      baseUrl, ...(scenario === 'blocked' ? { status: 'pending' as const } : {}) })) };
  save();
  const config = getRuntimeConfig(root);
  const target = resolveProviderCredential({ runtimeConfig: config, env: {} });
  if (scenario === 'blocked') expect(target.blocked).toBe('connection-pending');
  expect(inspectConfigConstraints(config, target, loadCatalog()).notices).not.toContain(
    'The selected request endpoint overrides the stored provider endpoint. Other provider selections retain their own endpoint.');
});

it('refreshes endpoint notices from the accepted request and clears them when the sources agree', () => {
  save({ providerConnections: settings.providerConnections!.map(item => ({ ...item, baseUrl: 'https://relay.invalid/v1' })),
    providerCredentials: { openai: { apiKey: 'synthetic-profile-key', baseUrl: 'https://profile.invalid/v1' } } });
  const context = shell();
  const notice = 'The selected request endpoint overrides the stored provider endpoint. Other provider selections retain their own endpoint.';
  expect(context.configuration.current.config.configDiagnostics).toContain(notice);
  const matching = { ...context.configuration.current.config, providerCredentials: { openai: { baseUrl: 'https://relay.invalid/v1' } } };
  const renewed = constrainRuntimeConfig(matching, resolveProviderCredential({ runtimeConfig: matching, env: {} }), loadCatalog());
  expect(renewed.configDiagnostics).not.toContain(notice);
  save({ providerCredentials: { openai: { apiKey: 'synthetic-profile-key', baseUrl: 'https://relay.invalid/v1/' } } });
  expect(refreshShellRuntimeConfig(context).status).toBe('applied');
  expect(context.configuration.current.config.configDiagnostics).not.toContain(notice);
  expect(configurationAdmission(context)()).toBeUndefined();
});

it.each(['legacy', 'auth-only'] as const)('uses the account issuer endpoint in %s storage instead of an unrelated stored API endpoint', storage => {
  save({ providerConnections: [{ ...settings.providerConnections![0], apiKey: undefined, authType: 'account-auth', model: 'gpt-5.4',
    accountAuth: { openai: { type: 'openai-chatgpt-account', accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', expiresAt: Date.now() + 60_000 } } }],
    providerCredentials: { openai: { apiKey: 'synthetic-profile', baseUrl: 'https://api.openai.com/v1' } } });
  if (storage === 'auth-only') {
    fs.renameSync(file, getUserAuthPath());
    fs.chmodSync(getUserAuthPath(), 0o600);
  }
  const snapshot = () => [file, getUserAuthPath()].map(source => fs.existsSync(source) ? fs.readFileSync(source) : undefined);
  const before = snapshot();
  const config = getRuntimeConfig(root), target = resolveProviderCredential({ runtimeConfig: config, env: {} });
  expect(target.baseUrl).toBeUndefined();
  const accepted = constrainRuntimeConfig(config, target, loadCatalog());
  expect(accepted.configDiagnostics).toContain('The selected request endpoint overrides the stored provider endpoint. Other provider selections retain their own endpoint.');
  expect(accepted.configValidation.valid).toBe(true);
  expect(snapshot()).toEqual(before);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function save(patch: Partial<RuntimeConfigFile> = {}) {
  // Legacy credential fixtures use the same owner-only protection as product writes.
  settings = { ...settings, ...patch }; fs.writeFileSync(file, JSON.stringify(settings), { mode: 0o600 });
}
function shell(providerOverride?: RuntimeProvider, apiKey?: string, env: NodeJS.ProcessEnv = {}) {
  return createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
    rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
    session: manager.createNew(root), runtimeConfig: getRuntimeConfig(root),
    resolveConfigTarget: config => resolveCliCredential(config, { provider: providerOverride, apiKey }, env) });
}

it('uses native account protocol and provider-owned output across startup, reload, preset and model selection', async () => {
  save({ providerConnections: [{ ...settings.providerConnections![0]!, apiKey: undefined, authType: 'account-auth', model: 'gpt-5.4',
    baseUrl: 'https://chatgpt.com/backend-api', accountAuth: { openai: { type: 'openai-chatgpt-account', accountId: 'a',
      accessToken: 'synthetic', refreshToken: 'synthetic-refresh', expiresAt: Date.now() + 3600000 } } }] });
  fs.writeFileSync(userCatalogPath(), JSON.stringify({ providers: { openai: { endpoint: 'catalog-unknown',
    models: [{ id: 'gpt-5.4', contextWindow: 64000, maxTokens: 10, reasoning: true }] } } }));
  const context = shell(); expect(context.runtimeConfig.configValidation.valid).toBe(true);
  expect((await runModelCommand(['use', 'gpt-5.4', '--effort', 'high'], { cwd: root, projectRoot: root,
    sessionId: context.session.id, runtimeConfig: context.runtimeConfig })).output).toContain('Model switched');
  save({ maxOutputTokens: 4096 });
  const rejected = refreshShellRuntimeConfig(context);
  expect(rejected.status).toBe('rejected'); expect(rejected.diagnostics.join(' ')).toContain('output control');
});

it.each([
  [{ maxOutputTokens: 64_001 }, 'model output limit'],
  [{ contextWindow: 4_096, reserveTokens: 0 }, 'leave input space'],
  [{ reserveTokens: 128_000 }, 'reserveTokens'],
  [{ retryBaseDelayMs: 60_001 }, 'retryMaxDelayMs'],
  [{ modelTokenBudgets: { 'private-invalid-key': { reserveTokens: 1 } } }, 'provider/model'],
  [{ modelTokenBudgets: { 'openai/small': { reserveTokens: 16_000 } } }, 'modelTokenBudgets.reserveTokens'],
] as const)('rejects incompatible configuration while preserving an operational last-good snapshot: %j', (patch, detail) => {
  const context = shell(); const before = context.runtimeConfig;
  save(patch);
  const result = refreshShellRuntimeConfig(context);
  expect(result.status).toBe('rejected'); expect(result.diagnostics.join(' ')).toContain(detail);
  expect(context.runtimeConfig).toBe(before); expect(configurationAdmission(context)()).toBeUndefined();
  expect(result.diagnostics.join(' ')).not.toMatch(/synthetic-private-key|private-invalid-key/);
  const fresh = shell();
  expect(fresh.configuration.current.admissionBlocked).toBe(true);
  expect(configurationAdmission(fresh)()).toBeDefined();
  save({ maxOutputTokens: 4096, contextWindow: 128_000, reserveTokens: 8_000, retryBaseDelayMs: 2_000, modelTokenBudgets: {} });
  expect(refreshShellRuntimeConfig(fresh).status).toBe('applied');
  expect(configurationAdmission(fresh)()).toBeUndefined();
});

it('keeps zero reservation, large output limits and capped recent history distinct', () => {
  save({ maxOutputTokens: 60_000, reserveTokens: 0, retryBaseDelayMs: 0, retryMaxDelayMs: 0,
    modelTokenBudgets: { 'openai/roomy': { reserveTokens: 0, keepRecentTokens: 200_000 } } });
  const context = shell();
  expect(context.runtimeConfig.configValidation.valid).toBe(true);
  expect(context.runtimeConfig.maxOutputTokens).toBe(60_000);
  expect(context.runtimeConfig.reserveTokens).toBe(0);
  expect(context.runtimeConfig.modelTokenBudgets?.['openai/roomy']?.keepRecentTokens).toBe(200_000);
  expect(context.runtimeConfig.configDiagnostics.join(' ')).toContain('limited to the available context');
});

it('resolves per-model reservation before checking the available context', () => {
  save({ contextWindow: 6_000, maxOutputTokens: 2_000, reserveTokens: 8_000,
    modelTokenBudgets: { 'openai/roomy': { reserveTokens: 0 } } });
  const context = shell();
  expect(context.runtimeConfig.configValidation.valid).toBe(true);
  save({ modelTokenBudgets: { 'openai/roomy': { keepRecentTokens: 0 } } });
  expect(refreshShellRuntimeConfig(context).status).toBe('rejected');
});

it('preserves explicit window overrides and marks unknown capacity without leaking model identifiers', () => {
  save({ contextWindow: 256_000 });
  const context = shell();
  expect(context.runtimeConfig.configValidation.valid).toBe(true);
  expect(context.runtimeConfig.configDiagnostics.join(' ')).toContain('remote support is unverified');
  save({ contextWindow: undefined, providerConnections: [{ ...settings.providerConnections![0]!, model: 'private-model' }],
    modelTokenBudgets: { 'custom/private-model': { reserveTokens: 999_999 } } });
  expect(refreshShellRuntimeConfig(context).status).toBe('applied');
  expect(context.runtimeConfig.configDiagnostics.join(' ')).toContain('unverified');
  expect(context.runtimeConfig.configDiagnostics.join(' ')).not.toContain('private-model');
});

it('validates the explicit provider selection on startup and reload', () => {
  save({ providerConnections: [{ ...settings.providerConnections![0]!, model: 'small' }],
    providerCredentials: { google: { model: 'alternate' } } });
  expect(shell().configuration.current.admissionBlocked).toBe(true);
  const overridden = shell('google');
  expect(overridden.configuration.current.admissionBlocked).toBe(false);
  expect(refreshShellRuntimeConfig(overridden).status).toBe('applied');
});

it('rejects an oversized model selection before either store changes and validates the session model on reload', async () => {
  const context = shell();
  const command = { cwd: root, projectRoot: root, sessionId: context.session.id,
    runtimeConfig: context.runtimeConfig, refreshRuntimeConfig: () => refreshShellRuntimeConfig(context) };
  const before = readSessionModelEdit(context.session.id); const global = fs.readFileSync(file);
  expect((await runModelCommand(['small', '--global'], command)).output).toContain('model output limit');
  expect(readSessionModelEdit(context.session.id)).toEqual(before); expect(fs.readFileSync(file)).toEqual(global);
  save({ maxOutputTokens: 2_000 }); refreshShellRuntimeConfig(context);
  expect((await runModelCommand(['small'], { ...command, runtimeConfig: context.runtimeConfig })).output).toContain('Model switched');
  save({ maxOutputTokens: 2_001 });
  expect(refreshShellRuntimeConfig(context).status).toBe('rejected');
  expect(context.runtimeConfig.providerConnections[0]?.model).toBe('small');
  expect(context.runtimeConfig.maxOutputTokens).toBe(2_000);
});

it('does not commit a selection after a hook changes its context budget', async () => {
  const context = shell(); const before = readSessionModelEdit(context.session.id);
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') save({ contextWindow: 2_000 });
    return undefined;
  });
  const result = await runModelCommand(['roomy'], { cwd: root, projectRoot: root, sessionId: context.session.id });
  expect(result.output).toMatch(/changed|not saved|unchanged/i);
  expect(readSessionModelEdit(context.session.id)).toEqual(before);
});

it('rechecks every budgeted model after a hook before writing the selection', async () => {
  save({ modelTokenBudgets: { 'openai/small': { reserveTokens: 8_000 } } });
  const context = shell(); const before = readSessionModelEdit(context.session.id); const global = fs.readFileSync(file);
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') {
      const catalog = JSON.parse(fs.readFileSync(userCatalogPath(), 'utf8'));
      catalog.providers.openai.models[1].contextWindow = 4_000;
      fs.writeFileSync(userCatalogPath(), JSON.stringify(catalog));
    }
    return undefined;
  });
  const result = await runModelCommand(['roomy', '--global'], { cwd: root, projectRoot: root, sessionId: context.session.id });
  expect(result.output).toContain('conflict');
  expect(readSessionModelEdit(context.session.id)).toEqual(before); expect(fs.readFileSync(file)).toEqual(global);
});

it.each(['roomy', 'unknown'])('retains last-good when the %s model cannot fit its endpoint reasoning minimum', model => {
  const catalog = JSON.parse(fs.readFileSync(userCatalogPath(), 'utf8'));
  catalog.providers.openai.endpoint = 'anthropic-messages';
  catalog.providers.openai.models[0].reasoning = true;
  fs.writeFileSync(userCatalogPath(), JSON.stringify(catalog));
  save({ providerConnections: [{ ...settings.providerConnections![0]!, model, thinkingEffort: 'high' }] });
  const context = shell(); const before = context.runtimeConfig;
  save({ maxOutputTokens: 1500 });
  expect(refreshShellRuntimeConfig(context).status).toBe('rejected');
  expect(context.runtimeConfig).toBe(before);
  expect(context.configuration.current.diagnostics.join(' ')).toContain('at least 2048');
  expect(shell().configuration.current.admissionBlocked).toBe(true);
  save({ providerConnections: [{ ...settings.providerConnections![0]!, thinkingEffort: null }] });
  expect(refreshShellRuntimeConfig(context).status).toBe('applied');
});

it('uses actual CLI and environment credential precedence when that determines the model', () => {
  save({ activeProviderConnectionId: undefined, providerConnections: [], providerCredentials: { openai: {
    model: 'small', accountAuth: { openai: { type: 'openai-chatgpt-account', accessToken: 'synthetic-access',
      refreshToken: 'synthetic-refresh', expiresAt: Date.now() + 3600_000, accountId: 'synthetic-account' } },
  } } });
  expect(shell().configuration.current.admissionBlocked).toBe(false);
  for (const context of [shell(undefined, 'synthetic-cli-secret'), shell(undefined, undefined, { OPENAI_API_KEY: 'synthetic-env-secret' })]) {
    expect(context.configuration.current.admissionBlocked).toBe(true);
    expect(context.configuration.current.diagnostics.join(' ')).toContain('model output limit');
    expect(JSON.stringify(context.configuration.current.binding)).not.toMatch(/synthetic-(cli|env)-secret/);
  }
});

it('publishes and retains the immutable catalogue together with its checked configuration', () => {
  const context = shell(); const before = context.configuration.current;
  const catalog = JSON.parse(fs.readFileSync(userCatalogPath(), 'utf8'));
  catalog.providers.openai.models[0].contextWindow = 4_000;
  fs.writeFileSync(userCatalogPath(), JSON.stringify(catalog));
  expect(context.configuration.current.catalog).toBe(before.catalog);
  expect(refreshShellRuntimeConfig(context).status).toBe('rejected');
  expect(context.configuration.current.catalog).toBe(before.catalog);
  catalog.providers.openai.models[0].contextWindow = 256_000;
  fs.writeFileSync(userCatalogPath(), JSON.stringify(catalog));
  expect(refreshShellRuntimeConfig(context).status).toBe('applied');
  expect(context.configuration.current.catalog.find(provider => provider.id === 'openai')?.models.find(model => model.id === 'roomy')?.contextWindow).toBe(256_000);
  expect(Object.isFrozen(context.configuration.current.catalog[0]?.models)).toBe(true);
  expect(before.catalog.find(provider => provider.id === 'openai')?.models.find(model => model.id === 'roomy')?.contextWindow).toBe(128_000);
});

it('reports unsupported sampling and rejects unsupported stored effort through the same catalogue', () => {
  save({ temperature: 0.2, providerConnections: [{ ...settings.providerConnections![0]!, model: 'plain', thinkingEffort: null }] });
  const context = shell();
  expect(context.runtimeConfig.configValidation.valid).toBe(true);
  expect(context.runtimeConfig.configDiagnostics.join(' ')).toContain('temperature is not sent');
  save({ providerConnections: [{ ...settings.providerConnections![0]!, thinkingEffort: 'high' }] });
  expect(refreshShellRuntimeConfig(context).status).toBe('rejected');
  const check = inspectConfigConstraints(getRuntimeConfig(root), { provider: 'openai', model: 'plain', thinkingEffort: 'high' }, loadCatalog());
  expect(check.errors.join(' ')).toContain('does not support');
});
