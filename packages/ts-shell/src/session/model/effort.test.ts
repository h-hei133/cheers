import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from './state.js';
import { projectSessionModel } from './projection.js';
import * as configStore from '../../config/runtimeConfig.js';
import { ConfigWriteError } from '../../config/outcome.js';
import { runModelCommand } from '../../core/commands/modelCommandRuntime.js';
import { runThinkingCommand } from '../../core/commands/thinkingCommandRuntime.js';
import { defaultHookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { userCatalogPath } from '../../core/models/catalogStore.js';
import { readProjectState, writeProjectState } from '../../core/state/projectState.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig } from '../../core/shell/runtimeContext.js';

let home: string;
let manager: SessionManager;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'model-effort-'));
  fs.mkdirSync(path.join(home, '.agents'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  configStore.writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'fixture', providerConnections: [{
    id: 'fixture', provider: 'openai', authType: 'api-key', apiKey: 'synthetic-key', model: 'base-model',
    createdAt: '2026-01-01', updatedAt: '2026-01-01', status: 'connected',
  }] }, configStore.readRuntimeConfigEditAt(configStore.getUserRuntimeConfigPath()));
  manager = new SessionManager();
  catalog();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });
function catalog(reasoning = true) {
  fs.writeFileSync(userCatalogPath(), JSON.stringify({ providers: { openai: { models: [
    { id: 'base-model', reasoning: true }, { id: 'capable', reasoning },
    { id: 'disabled', reasoning: false }, { id: 'incompatible', compat: { reasoningEffort: false } },
    { id: 'limited', reasoning: true, thinkingLevelMap: { high: null, low: 'minimal' } },
  ] } } }));
}
function context() {
  return { cwd: home, projectRoot: home, sessionId: manager.createNew(home).id };
}

it('keeps model and effort together through sequential commands, publication, lifecycle and resume', async () => {
  const session = manager.createNew(home);
  const shell = createShellRuntimeContext({ cwd: home, originalCwd: home, projectRoot: home, targetPathBase: home,
    rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null }, session,
    runtimeConfig: configStore.getRuntimeConfig(home) });
  const command = () => ({ cwd: home, projectRoot: home, sessionId: session.id, runtimeConfig: shell.runtimeConfig,
    refreshRuntimeConfig: () => refreshShellRuntimeConfig(shell) });
  const global = fs.readFileSync(configStore.getUserRuntimeConfigPath());
  expect((await runModelCommand(['capable', '--effort', 'high'], command())).output).toContain('Model switched');
  expect((await runThinkingCommand(['low'], command())).output).toContain('Reasoning effort: low');
  expect(readSessionModel(session.id)).toEqual({ connectionId: 'fixture', provider: 'openai', model: 'capable', thinkingEffort: 'low' });
  expect(resolveProviderCredential({ runtimeConfig: shell.runtimeConfig, env: {} })).toMatchObject({ model: 'capable', thinkingEffort: 'low' });
  expect(shell.runtimeConfig.configProvenance.providerConnections.children?.['0'].children?.thinkingEffort.sources).toEqual(['session']);
  manager.persistUserPromptBarrier(session.id, 'resume with effort'); manager.saveInterrupted(session.id);
  const restored = new SessionManager(); expect(restored.tryResume(session.id)).toMatchObject({ ok: true });
  const effective = projectSessionModel(configStore.getRuntimeConfig(home), session.id);
  expect(resolveProviderCredential({ runtimeConfig: effective, env: {} })).toMatchObject({ model: 'capable', thinkingEffort: 'low' });
  expect(fs.readFileSync(configStore.getUserRuntimeConfigPath())).toEqual(global);
});

it.each(['disabled', 'incompatible', 'limited'])('rejects an unsupported %s pair without either write or publication', async model => {
  const ctx = context(); await runModelCommand(['capable', '--effort', 'high'], ctx);
  const before = readSessionModelEdit(ctx.sessionId); const global = fs.readFileSync(configStore.getUserRuntimeConfigPath());
  const refreshRuntimeConfig = vi.fn();
  const result = await runModelCommand([model, '--global'], { ...ctx, refreshRuntimeConfig });
  expect(result.output).toContain('does not support');
  expect(readSessionModelEdit(ctx.sessionId)).toEqual(before); expect(refreshRuntimeConfig).not.toHaveBeenCalled();
  expect(fs.readFileSync(configStore.getUserRuntimeConfigPath())).toEqual(global);
  expect((await runModelCommand([model, '--effort', 'auto'], ctx)).output).toContain('Model switched');
});

it('retains unknown custom model IDs and reports unverified capability', async () => {
  const ctx = context();
  const result = await runModelCommand(['custom/unknown', '--effort', 'medium'], ctx);
  expect(result.output).toContain('capability is unverified');
  expect(result.output).toContain('/model refresh');
  expect(readSessionModel(ctx.sessionId)).toMatchObject({ model: 'custom/unknown', thinkingEffort: 'medium' });
});

it('rechecks changed model capabilities after the asynchronous hook', async () => {
  const ctx = context();
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') catalog(false);
    return undefined;
  });
  const global = fs.readFileSync(configStore.getUserRuntimeConfigPath());
  const result = await runModelCommand(['capable', '--effort', 'high', '--global'], ctx);
  expect(result.output).toContain('conflict'); expect(readSessionModel(ctx.sessionId)).toBeUndefined();
  expect(fs.readFileSync(configStore.getUserRuntimeConfigPath())).toEqual(global);
});

it.each(['auto', 'off', 'none'])('persists explicit %s without changing another session or the legacy project state', async alias => {
  const one = context(); const two = context(); writeProjectState(home, { thinkingEffort: 'high' });
  expect((await runThinkingCommand([alias], one)).output).toContain('provider decides');
  const effective = projectSessionModel(configStore.getRuntimeConfig(home), one.sessionId);
  expect(resolveProviderCredential({ runtimeConfig: effective, env: {} }).thinkingEffort).toBeNull();
  expect(readProjectState(home).thinkingEffort).toBe('high');
  expect(readSessionModel(two.sessionId)).toBeUndefined();
  expect((await runThinkingCommand([], two)).output).toContain('high');
  await runModelCommand(['capable'], one);
  expect(readSessionModel(one.sessionId)?.thinkingEffort).toBeNull();
});

it('saves effort only on its named connection, including null over provider fallback', async () => {
  const ctx = context(); await runModelCommand(['capable', '--effort', 'high', '--global'], ctx);
  const edit = configStore.readRuntimeConfigEditAt(configStore.getUserRuntimeConfigPath());
  expect(edit.values.providerConnections?.[0]?.thinkingEffort).toBe('high');
  expect(edit.values.providerCredentials?.openai).toBeUndefined();
  await runThinkingCommand(['auto', '--global'], ctx);
  const config = configStore.getRuntimeConfig(home);
  expect(config.providerConnections[0].thinkingEffort).toBeNull();
  expect(config.providerCredentials.openai).toBeUndefined();
  expect(resolveProviderCredential({ runtimeConfig: { ...config, providerCredentials: { openai: { thinkingEffort: 'high' } } }, env: {} }).thinkingEffort).toBeNull();
});

it('legacy session records inherit defaults until an explicit pair is selected', async () => {
  const ctx = context(); writeProjectState(home, { thinkingEffort: 'medium' });
  writeSessionModel(ctx.sessionId, { connectionId: 'fixture', provider: 'openai', model: 'capable' }, readSessionModelEdit(ctx.sessionId));
  expect((await runThinkingCommand([], ctx)).output).toContain('medium');
  await runModelCommand(['capable'], ctx);
  expect(readSessionModel(ctx.sessionId)?.thinkingEffort).toBe('medium');
});

it.each(['unchanged', 'unknown', 'persisted'] as const)('reports global %s truthfully and only compensates a verified unchanged outcome', async state => {
  const ctx = context(); await runModelCommand(['base-model', '--effort', 'low'], ctx);
  vi.spyOn(configStore, 'writeUserRuntimeConfigFile').mockImplementation(() => { throw new ConfigWriteError('write-failed', state); });
  const refreshRuntimeConfig = vi.fn();
  const result = await runModelCommand(['capable', '--effort', 'high', '--global'], { ...ctx, refreshRuntimeConfig });
  expect(refreshRuntimeConfig).not.toHaveBeenCalled();
  expect(readSessionModel(ctx.sessionId)).toMatchObject(state === 'unchanged' ? { model: 'base-model', thinkingEffort: 'low' } : { model: 'capable', thinkingEffort: 'high' });
  expect(result.output).toContain(state === 'unchanged' ? 'restored and verified' : state === 'unknown' ? 'unverified' : 'saved and verified');
});

it('preserves a newer session selection when global failure compensation loses ownership', async () => {
  const ctx = context();
  vi.spyOn(configStore, 'writeUserRuntimeConfigFile').mockImplementation(() => {
    writeSessionModel(ctx.sessionId, { connectionId: 'fixture', provider: 'openai', model: 'winner', thinkingEffort: null }, readSessionModelEdit(ctx.sessionId));
    throw new ConfigWriteError('conflict', 'unchanged');
  });
  const result = await runModelCommand(['capable', '--effort', 'high', '--global'], ctx);
  expect(result.output).toContain('Session compensation failed');
  expect(readSessionModel(ctx.sessionId)).toMatchObject({ model: 'winner', thinkingEffort: null });
});


it.each([[], ['--global']])('refuses effort-only selection without a concrete model: %j', async (...flags) => {
  const ctx = context(); const target = configStore.getUserRuntimeConfigPath();
  const edit = configStore.readRuntimeConfigEditAt(target);
  configStore.writeUserRuntimeConfigFile({ ...edit.values, providerConnections: edit.values.providerConnections?.map(({ model, ...connection }) => connection) }, edit);
  const before = fs.readFileSync(target);
  const result = await runThinkingCommand(['high', ...flags], ctx);
  expect(result.output).toContain('no concrete model'); expect(readSessionModel(ctx.sessionId)).toBeUndefined();
  expect(fs.readFileSync(target)).toEqual(before);
});

it('uses normalized padded legacy connection IDs without replacing the model', async () => {
  const ctx = context(); const edit = configStore.readRuntimeConfigEditAt(configStore.getUserRuntimeConfigPath());
  configStore.writeUserRuntimeConfigFile({ ...edit.values, activeProviderConnectionId: ' fixture ', providerConnections: edit.values.providerConnections?.map(item => ({ ...item, id: ' fixture ' })) }, edit);
  const result = await runThinkingCommand(['low'], ctx);
  expect(result.output).toContain('Model switched to base-model');
  expect(readSessionModel(ctx.sessionId)).toMatchObject({ model: 'base-model', thinkingEffort: 'low', connectionId: 'fixture' });
});

it.each([[], ['--effort', 'auto']])('reports unknown models even with provider-decides effort: %j', async (...flags) => {
  const ctx = context();
  const result = await runModelCommand(['custom-unlisted', ...flags], ctx);
  expect(result.output).toContain('Model catalogue entry is unavailable');
  expect(result.output).toContain('capability is unverified');
  expect(readSessionModel(ctx.sessionId)?.thinkingEffort).toBeNull();
});

it.each(['anthropic-messages', 'bedrock-converse-stream'])('rejects an effort pair that cannot fit the %s output cap before saving', async endpoint => {
  const ctx = context(); const file = configStore.getUserRuntimeConfigPath(); const edit = configStore.readRuntimeConfigEditAt(file);
  configStore.writeUserRuntimeConfigFile({ ...edit.values, maxOutputTokens: 1500 }, edit);
  fs.writeFileSync(userCatalogPath(), JSON.stringify({ providers: { openai: { endpoint, models: [{ id: 'base-model', reasoning: true }] } } }));
  const before = fs.readFileSync(file);
  const result = await runThinkingCommand(['high', '--global'], ctx);
  expect(result.output).toContain('output limit must be at least 2048');
  expect(readSessionModel(ctx.sessionId)).toBeUndefined(); expect(fs.readFileSync(file)).toEqual(before);
  expect((await runThinkingCommand(['auto'], ctx)).output).toContain('saved for resume');
});


it.each([[4096, 1500, false], [1500, 4096, true]] as const)('validates the publication cap after accepted %s changes to %s', async (beforeCap, afterCap, succeeds) => {
  const file = configStore.getUserRuntimeConfigPath(); let edit = configStore.readRuntimeConfigEditAt(file);
  configStore.writeUserRuntimeConfigFile({ ...edit.values, maxOutputTokens: beforeCap }, edit);
  fs.writeFileSync(userCatalogPath(), JSON.stringify({ providers: { openai: { endpoint: 'anthropic-messages', models: [{ id: 'base-model', reasoning: true }] } } }));
  const session = manager.createNew(home);
  const overrides = { allowedTools: ['Read'], offline: true, instructionBudgetBytes: 0 };
  const shell = createShellRuntimeContext({ cwd: home, originalCwd: home, projectRoot: home, targetPathBase: home,
    rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null }, session,
    runtimeConfig: configStore.getRuntimeConfig(home, overrides), runtimeConfigOverrides: overrides });
  edit = configStore.readRuntimeConfigEditAt(file);
  configStore.writeUserRuntimeConfigFile({ ...edit.values, maxOutputTokens: afterCap }, edit);
  const before = fs.readFileSync(file);
  const result = await runThinkingCommand(['high', '--global'], { cwd: home, projectRoot: home, sessionId: session.id,
    runtimeConfig: shell.runtimeConfig, refreshRuntimeConfig: () => refreshShellRuntimeConfig(shell) });
  if (succeeds) {
    expect(result.output).toContain('Model switched');
    expect(shell.runtimeConfig.maxOutputTokens).toBe(afterCap);
    expect(shell.runtimeConfig.allowedTools).toEqual(['Read']);
    expect(shell.runtimeConfig.instructionBudgetBytes).toBe(0); expect(shell.runtimeConfig.offline).toBe(true);
    expect(readSessionModel(session.id)?.thinkingEffort).toBe('high');
  } else {
    expect(result.output).toContain('output limit must be at least 2048');
    expect(readSessionModel(session.id)).toBeUndefined(); expect(fs.readFileSync(file)).toEqual(before);
    expect(shell.runtimeConfig.maxOutputTokens).toBe(beforeCap);
  }
});

it.each(['endpoint', 'output-cap'])('rejects a changed %s during the model hook', async field => {
  const ctx = context(); let external: Buffer;
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') {
      if (field === 'endpoint') {
        const data = JSON.parse(fs.readFileSync(userCatalogPath(), 'utf8')); data.providers.openai.endpoint = 'anthropic-messages';
        fs.writeFileSync(userCatalogPath(), JSON.stringify(data));
      } else {
        const edit = configStore.readRuntimeConfigEditAt(configStore.getUserRuntimeConfigPath());
        configStore.writeUserRuntimeConfigFile({ ...edit.values, maxOutputTokens: 1500 }, edit);
      }
      external = fs.readFileSync(configStore.getUserRuntimeConfigPath());
    }
    return undefined;
  });
  const result = await runModelCommand(['capable', '--effort', 'high', '--global'], ctx);
  expect(result.output).toContain('conflict'); expect(readSessionModel(ctx.sessionId)).toBeUndefined();
  expect(fs.readFileSync(configStore.getUserRuntimeConfigPath())).toEqual(external!);
});
