import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { modelPicker } from './model.js';
import { SessionManager } from '../../../session/SessionManager.js';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../config/runtimeConfig.js';
import { loadCatalog, userCatalogPath, writeCatalogCache } from '../../../core/models/catalogStore.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../session/model/state.js';
import { projectSessionModel } from '../../../session/model/projection.js';
import { defaultHookDispatcher } from '../../../core/hooks/hookDispatcher.js';
import { resolveProviderCredential } from '../../../core/shell/providerCredentials.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig, switchActiveSession } from '../../../core/shell/runtimeContext.js';
import { createCliProviderRuntimeBridge } from '../../provider/cliProviderRuntimeBridge.js';
import { saveProfileModelPreset } from '../../../core/commands/model/preset.js';
import { runModelCommand } from '../../../core/commands/modelCommandRuntime.js';
import { connectionDraft, connectionPicker } from './connections.js';
import { tokenizeCommandArgs } from '../../../core/commands/arguments.js';
import { OverlayHost } from '../overlay.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';

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
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

const id = (connection = 'b', model = 'shared') => `model:${JSON.stringify([connection, 'openai', model])}`;
const context = () => ({ cwd: home, projectRoot: home, sessionId });

it.each(['{PRIVATE_CATALOG_VALUE', '{"providers":{},"providers":{}}'])(
  'shows catalogue diagnostics and file ownership without writing on inspection: %s', async text => {
    fs.writeFileSync(userCatalogPath(), text);
    const before = fs.readFileSync(getUserRuntimeConfigPath());
    const picker = modelPicker(context()); await picker.load();
    expect(picker.status?.([], '')).toMatch(/models.json (could not be parsed|repeats the top-level providers key)/);
    expect(picker.status?.([], '')).not.toContain('PRIVATE_CATALOG_VALUE');
    expect(picker.detail!(id()).join('\n')).toContain('Catalogue: models.json (user profile only)');
    expect(picker.detail!(id()).join('\n')).toContain('connections and request settings: config.json');
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before);
    expect(fs.readFileSync(userCatalogPath(), 'utf8')).toBe(text);
  },
);

it('refreshes a corrected catalogue notice even when its provider entries did not change', async () => {
  fs.writeFileSync(userCatalogPath(), '{bad');
  const shell = createShellRuntimeContext({ cwd: home, originalCwd: home, projectRoot: home, targetPathBase: home,
    rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
    session: manager.getSession(sessionId)!, runtimeConfig: getRuntimeConfig(home) });
  const command = { ...context(), readConfiguration: () => shell.configuration.current,
    refreshRuntimeConfig: (scope?: 'catalog') => refreshShellRuntimeConfig(shell, scope) };
  const picker = modelPicker(command); await picker.load();
  expect(picker.status?.([], '')).toContain('models.json could not be parsed');
  const accepted = shell.configuration.current;
  fs.writeFileSync(userCatalogPath(), '{}');
  expect(shell.configuration.current.catalogDiagnostics).toBe(accepted.catalogDiagnostics);
  const reopened = modelPicker(command); await reopened.load();
  expect(shell.configuration.current.revision).toBeGreaterThan(accepted.revision);
  expect(shell.configuration.current.catalog).toEqual(accepted.catalog);
  expect(shell.configuration.current.catalogDiagnostics).toEqual([]);
  expect(reopened.status?.([], '')).toBeUndefined();
});

it.each(['subagent', 'summary', 'advisor'] as const)('edits %s effort and provider default without changing the default model or sibling policies', async name => {
  const roles = { subagent: { connectionId: 'b', provider: 'openai', model: 'other', thinkingEffort: 'high' as const },
    summary: { connectionId: 'b', provider: 'openai', model: 'other', thinkingEffort: 'high' as const },
    advisor: { connectionId: 'b', provider: 'openai', model: 'other', thinkingEffort: 'high' as const } };
  writeSessionModel(sessionId, { connectionId: 'a', provider: 'openai', model: 'shared', thinkingEffort: 'high',
    roles, contextWindow: 100000, skillful: false, presets: { work: { roles: { default: roles.subagent } } } }, readSessionModelEdit(sessionId));
  const original = readSessionModel(sessionId)!; const global = fs.readFileSync(getUserRuntimeConfigPath());
  const picker = modelPicker(context()); await picker.load();
  const role = (await picker.inspect!(`role:${name}`))!.next!; await role.load();
  const thinking = (await role.apply(['thinking']))!.next!;
  expect((await thinking.load()).map(row => row.id)).toEqual(['auto', 'low', 'medium', 'high']);
  expect(thinking.initialSelection).toBe('high');
  const changed = await thinking.apply(['low']);
  expect(readSessionModel(sessionId)).toEqual({ ...original, roles: { ...roles, [name]: { ...roles[name], thinkingEffort: 'low' } } });
  const parent = changed!.next!; await parent.load();
  expect(parent.detail!('choose')).toContain('Reasoning effort: low');
  expect(parent.status?.([], '')).toContain(`${name} uses`);
  const revised = (await parent.apply(['thinking']))!.next!; await revised.load();
  expect(revised.initialSelection).toBe('low');
  const automatic = await revised.apply(['auto']);
  expect(readSessionModel(sessionId)).toEqual({ ...original, roles: { ...roles, [name]: { ...roles[name], thinkingEffort: null } } });
  const returned = automatic!.next!; await returned.load();
  const catalogue = returned.back!(); await catalogue.load();
  expect(catalogue.initialSelection).toBe(`role:${name}`);
  expect(catalogue.detail!(`role:${name}`)).toContain('Reasoning effort: provider decides');
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
});

it.each(['session', 'catalogue'] as const)('refuses a role effort captured before a competing %s change', async change => {
  writeSessionModel(sessionId, { connectionId: 'a', provider: 'openai', model: 'shared',
    roles: { advisor: { connectionId: 'b', provider: 'openai', model: 'other', thinkingEffort: 'high' } } }, readSessionModelEdit(sessionId));
  const picker = modelPicker(context()); await picker.load();
  const role = (await picker.inspect!('role:advisor'))!.next!; await role.load();
  const thinking = (await role.apply(['thinking']))!.next!; await thinking.load();
  if (change === 'session') writeSessionModel(sessionId, { ...readSessionModel(sessionId)!,
    roles: { advisor: { connectionId: 'b', provider: 'openai', model: 'shared' } } }, readSessionModelEdit(sessionId));
  else writeCatalogCache([{ id: 'openai', models: [{ id: 'shared', reasoning: true }, { id: 'other', reasoning: false }] }]);
  const before = readSessionModelEdit(sessionId);
  expect((await thinking.apply(['low']))?.note).toContain('expired');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it('keeps role effort independent while assigning a new model and leaves unassigned roles to the provider', async () => {
  writeCatalogCache([{ id: 'openai', models: [{ id: 'shared', reasoning: true }, { id: 'other', reasoning: true },
    { id: 'plain', reasoning: false }] }]);
  writeSessionModel(sessionId, { connectionId: 'a', provider: 'openai', model: 'shared', thinkingEffort: 'high',
    roles: { advisor: { connectionId: 'b', provider: 'openai', model: 'other', thinkingEffort: 'low' } } }, readSessionModelEdit(sessionId));
  const picker = modelPicker(context()); await picker.load();
  const advisor = (await picker.inspect!('role:advisor'))!.next!; await advisor.load();
  const browse = (await advisor.apply(['choose']))!.next!; await browse.load();
  expect((await browse.apply([id('b', 'shared')]))?.note).toContain('advisor uses');
  expect(readSessionModel(sessionId)).toMatchObject({ thinkingEffort: 'high', roles: { advisor: { model: 'shared', thinkingEffort: 'low' } } });
  const returned = modelPicker(context()); await returned.load();
  const summary = (await returned.inspect!('role:summary'))!.next!; await summary.load();
  const plain = (await summary.apply(['choose']))!.next!;
  expect((await plain.load()).find(row => row.id === id('b', 'plain'))?.disabled).not.toBe(true);
  expect((await plain.apply([id('b', 'plain')]))?.note).toContain('summary uses');
  expect(readSessionModel(sessionId)).toMatchObject({ thinkingEffort: 'high', roles: {
    advisor: { thinkingEffort: 'low' }, summary: { model: 'plain', thinkingEffort: null } } });
  const latest = modelPicker(context()); await latest.load();
  const existing = (await latest.inspect!('role:advisor'))!.next!; await existing.load();
  const nonreasoning = (await existing.apply(['choose']))!.next!;
  expect((await nonreasoning.load()).find(row => row.id === id('b', 'plain'))?.disabled).not.toBe(true);
  expect((await nonreasoning.apply([id('b', 'plain')]))?.note).toContain('reasoning effort: provider decides');
  expect(readSessionModel(sessionId)).toMatchObject({ thinkingEffort: 'high', roles: { advisor: { model: 'plain', thinkingEffort: null } } });
});

it('offers only verified levels for the role endpoint and no thinking action for unassigned or nonreasoning roles', async () => {
  writeCatalogCache([{ id: 'openai', models: [{ id: 'shared', reasoning: false },
    { id: 'other', reasoning: true, thinkingLevelMap: { high: null } }] }]);
  writeSessionModel(sessionId, { connectionId: 'a', provider: 'openai', model: 'shared',
    roles: { advisor: { connectionId: 'b', provider: 'openai', model: 'other' },
      summary: { connectionId: 'a', provider: 'openai', model: 'shared' } } }, readSessionModelEdit(sessionId));
  const picker = modelPicker(context()); await picker.load();
  for (const name of ['subagent', 'summary']) {
    const role = (await picker.inspect!(`role:${name}`))!.next!;
    expect((await role.load()).some(row => row.id === 'thinking')).toBe(false);
    expect(await role.apply(['thinking'])).toBeUndefined();
  }
  const role = (await picker.inspect!('role:advisor'))!.next!; await role.load();
  const thinking = (await role.apply(['thinking']))!.next!;
  expect((await thinking.load()).map(row => row.id)).toEqual(['auto', 'low', 'medium']);
  const before = readSessionModelEdit(sessionId);
  expect(await thinking.apply(['high'])).toBeUndefined();
  expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it('returns from role thinking through real Escape keys with no mutation and retains the original role focus', async () => {
  writeSessionModel(sessionId, { connectionId: 'a', provider: 'openai', model: 'shared',
    roles: { advisor: { connectionId: 'b', provider: 'openai', model: 'other', thinkingEffort: 'high' } } }, readSessionModelEdit(sessionId));
  const picker = modelPicker(context()); await picker.load();
  const role = (await picker.inspect!('role:advisor'))!.next!; await role.load();
  const thinking = (await role.apply(['thinking']))!.next!;
  const before = readSessionModelEdit(sessionId); const overlay = new OverlayHost(() => {}); overlay.open(thinking);
  await new Promise(resolve => setTimeout(resolve, 0));
  overlay.handleKey(parseKeyEvent('\x1b'), vi.fn());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(stripAnsi(overlay.render(110, 30).join('\n'))).toContain('Reasoning effort: high');
  expect(stripAnsi(overlay.render(110, 30).join('\n'))).toContain('▸ Choose model');
  overlay.handleKey(parseKeyEvent('\x1b'), vi.fn());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(stripAnsi(overlay.render(110, 30).join('\n'))).toContain('▸ Advisor');
  expect(readSessionModelEdit(sessionId)).toEqual(before); overlay.close();
});

it('prepares exact model tokens and excludes credentials from endpoint drafts', () => {
  const draft = connectionDraft({ id: 'relay', label: 'Relay', runtime: 'openai', auth: 'api-key', models: [] },
    'model with "quotes"', 'https://user:synthetic-secret@example.invalid/v1?key=synthetic-secret', 'my relay');
  expect(draft).not.toContain('synthetic-secret');
  expect(tokenizeCommandArgs(draft)).toEqual(['/connect', 'login', 'openai', '--base-url', 'https://example.invalid/v1',
    '--model', 'model with "quotes"', '--label', 'my relay', '--api-key']);
});

it('assigns an automatic role through the catalogue without switching the default, then clears it and retains siblings', async () => {
  const selected = modelPicker(context()); await selected.load(); await selected.apply([id('a')]);
  const before = readSessionModel(sessionId)!;
  writeSessionModel(sessionId, { ...before, serviceTier: 'default', contextWindow: 100000, skillful: false,
    roles: { advisor: { connectionId: 'a', provider: 'openai', model: 'other' } },
    presets: { work: { roles: { default: { connectionId: 'a', provider: 'openai', model: 'shared' } } } } }, readSessionModelEdit(sessionId));
  const original = readSessionModel(sessionId)!; const global = fs.readFileSync(getUserRuntimeConfigPath());
  const picker = modelPicker(context()); await picker.load();
  const role = (await picker.inspect!('role:subagent'))?.next!; await role.load();
  const browse = (await role.apply(['choose']))?.next!; await browse.load();
  const outcome = await browse.apply([id('b', 'other')]);
  expect(outcome?.note).toContain('subagent uses openai/other on connection b');
  expect(outcome?.next?.initialSelection).toBe('role:subagent');
  expect(outcome?.next?.status?.([], '')).toContain('subagent uses');
  expect(readSessionModel(sessionId)).toEqual({ ...original, roles: { ...original.roles,
    subagent: { connectionId: 'b', provider: 'openai', model: 'other', thinkingEffort: null } } });
  const returned = outcome!.next!; await returned.load();
  const reset = (await returned.inspect!('role:subagent'))?.next!; await reset.load();
  const cleared = await reset.apply(['default']);
  expect(cleared?.note).toContain('follows the default model');
  expect(cleared?.next?.initialSelection).toBe('role:subagent');
  expect(cleared?.next?.status?.([], '')).toContain('follows the default model');
  expect(readSessionModel(sessionId)).toEqual(original);
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
});

it('starts role editing in an empty session and permits browsing an unconfigured model without assignment', async () => {
  const publication = { config: { ...getRuntimeConfig(home), contextWindow: 90000,
    sessionModelRoles: { advisor: { connectionId: 'a', provider: 'openai', model: 'other' } } }, catalog: [...loadCatalog(), {
    id: 'anthropic', label: 'Anthropic', runtime: 'anthropic' as const, auth: 'api-key' as const, models: [{ id: 'missing' }] }], revision: 1 };
  const picker = modelPicker({ ...context(), readConfiguration: () => publication }); await picker.load();
  const role = (await picker.inspect!('role:summary'))?.next!; await role.load();
  const browse = (await role.apply(['choose']))?.next!; const rows = await browse.load();
  const missing = rows.find(row => row.label === 'missing')!;
  expect(missing).toMatchObject({ disabled: true, focusable: true });
  const details = (await browse.inspect!(missing.id))?.next!; await details.load();
  expect(details.detail?.('back').join('\n')).toContain('configured connection');
  expect(readSessionModel(sessionId)).toBeUndefined();
  expect(browse.navigation!.items.map(item => item.id)).not.toContain('roles');
  const saved = await browse.apply([id('b', 'other')]);
  expect(saved?.note).toContain('summary uses');
  expect(readSessionModel(sessionId)).toMatchObject({ connectionId: 'a', model: 'shared', contextWindow: 90000, roles: {
    summary: { connectionId: 'b', model: 'other' }, advisor: { connectionId: 'a', model: 'other' } } });
});

it('rejects a role action captured before a competing session selection', async () => {
  const picker = modelPicker(context()); await picker.load();
  const role = (await picker.inspect!('role:advisor'))?.next!; await role.load();
  const browse = (await role.apply(['choose']))?.next!; await browse.load();
  writeSessionModel(sessionId, { connectionId: 'a', provider: 'openai', model: 'other' }, readSessionModelEdit(sessionId));
  const before = readSessionModelEdit(sessionId);
  expect((await browse.apply([id('b')]))?.note).toContain('expired');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it('refuses role edits when a legacy saved default differs from the current request', async () => {
  writeSessionModel(sessionId, { connectionId: 'b', provider: 'openai', model: 'other' }, readSessionModelEdit(sessionId));
  const before = readSessionModelEdit(sessionId);
  const picker = modelPicker(context()); await picker.load();
  const role = (await picker.inspect!('role:advisor'))?.next!; await role.load();
  expect((await role.apply(['default']))?.note).toContain('saved default differs');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it('reports a persisted role separately when runtime publication throws', async () => {
  const picker = modelPicker({ ...context(), refreshRuntimeConfig: () => { throw new Error('synthetic publication failure'); } });
  await picker.load(); const role = (await picker.inspect!('role:summary'))?.next!; await role.load();
  const browse = (await role.apply(['choose']))?.next!; await browse.load();
  const result = await browse.apply([id('b')]);
  expect(result?.note).toContain('Role assignment saved');
  expect(result?.note).toContain('application outcome is unverified');
  expect(result?.note).not.toContain('summary uses');
  expect(result?.next?.status?.([], '')).toContain('application outcome is unverified');
  expect(readSessionModel(sessionId)?.roles?.summary).toMatchObject({ connectionId: 'b', model: 'shared' });
});

it('publishes role policy to the real runtime configuration and returns through Escape without writing', async () => {
  const shell = createShellRuntimeContext({ cwd: home, originalCwd: home, projectRoot: home, targetPathBase: home,
    rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
    session: manager.getSession(sessionId)!, runtimeConfig: getRuntimeConfig(home) });
  const commands = { ...context(), readConfiguration: () => shell.configuration.current,
    refreshRuntimeConfig: () => refreshShellRuntimeConfig(shell) };
  const picker = modelPicker(commands); await picker.load();
  const role = (await picker.inspect!('role:advisor'))?.next!; await role.load();
  const browse = (await role.apply(['choose']))?.next!; await browse.load();
  const before = readSessionModelEdit(sessionId);
  const overlay = new OverlayHost(() => {}); overlay.open(browse);
  await new Promise(resolve => setTimeout(resolve, 0));
  overlay.handleKey(parseKeyEvent('\x1b'), vi.fn());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(overlay.active).toBe(true);
  const parent = stripAnsi(overlay.render(110, 30).join('\n'));
  expect(parent).toContain('▸ Advisor'); expect(parent).not.toContain('Choose model');
  expect(readSessionModelEdit(sessionId)).toEqual(before); overlay.close();
  expect(await browse.apply([id('b')])).toBeUndefined(); expect(readSessionModelEdit(sessionId)).toEqual(before);
  const reopened = modelPicker(commands); await reopened.load();
  const renewedRole = (await reopened.inspect!('role:advisor'))!.next!; await renewedRole.load();
  const fresh = (await renewedRole.apply(['choose']))!.next!; await fresh.load();
  expect((await fresh.apply([id('b')]))?.note).toContain('advisor uses');
  expect(shell.runtimeConfig.sessionModelRoles?.advisor).toMatchObject({ connectionId: 'b', model: 'shared' });
  expect(resolveProviderCredential({ runtimeConfig: shell.runtimeConfig, env: {} }).credential?.connectionId).toBe('a');
});

it.each([false, true])('browses unconfigured models through real overlay keys (all missing: %s)', async allMissing => {
  const catalog = [{ id: 'openai', label: 'OpenAI', runtime: 'openai' as const, auth: 'api-key' as const, models: [{ id: 'shared', reasoning: true }] },
    { id: 'anthropic', label: 'Anthropic', runtime: 'anthropic' as const, auth: 'api-key' as const,
      models: ['missing-1', 'missing-2', 'missing-3'].map(id => ({ id, reasoning: true })) }];
  const configured = getRuntimeConfig(home);
  const runtimeConfig = { ...configured, activeProviderConnectionId: allMissing ? undefined : 'a',
    providerConnections: allMissing ? [] : [configured.providerConnections[0]!] };
  const picker = modelPicker({ ...context(), readConfiguration: () => ({ config: runtimeConfig, catalog, revision: 1 }) });
  const rows = await picker.load();
  const target = rows.find(row => row.label === 'missing-2')!;
  expect(target).toMatchObject({ disabled: true, focusable: true });
  const before = readSessionModelEdit(sessionId); const global = fs.readFileSync(getUserRuntimeConfigPath());
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected probe'));
  const overlay = new OverlayHost(() => {}); overlay.open(picker);
  await new Promise(resolve => setTimeout(resolve, 0));
  overlay.handlePaste('missing');
  overlay.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
  const visible = stripAnsi(overlay.render(100, 24).join('\n'));
  expect(visible).toContain('▸ missing-2'); expect(visible).toContain('configure a connection');
  let result: ReturnType<typeof picker.apply> | undefined;
  overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { result = selected.apply(ids); });
  const detail = (await result!)?.next!;
  expect(detail).toBeDefined(); await detail.load();
  const back = (await detail.apply(['back']))?.next!;
  expect(back.initialSelection).toBe(target.id);
  await back.load();
  const reopened = (await back.inspect!(target.id))!.next!; await reopened.load();
  const draft = (await reopened.apply(['configure']))?.draft;
  expect(draft).toContain('/connect login anthropic'); expect(draft).toContain('--model missing-2');
  overlay.open(back); await new Promise(resolve => setTimeout(resolve, 0));
  expect(stripAnsi(overlay.render(40, 20).join('\n'))).toContain('▸ missing-2');
  overlay.close();
  expect(readSessionModelEdit(sessionId)).toEqual(before);
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global); expect(fetch).not.toHaveBeenCalled();
});

it('shows an active pool-outside connection as unavailable and only allows a pool member', async () => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, accountPool: { openai: { connections: ['b'] } } }, edit);
  const runtimeConfig = getRuntimeConfig(home);
  const before = fs.readFileSync(getUserRuntimeConfigPath());
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected probe'));
  const connections = await connectionPicker({ ...context(), runtimeConfig }).load();
  expect(connections.find(row => row.id === 'use:a')?.note).toBe('active · account pool unavailable');
  expect(connections.find(row => row.id === 'use:b')?.note).toBe('credential present');
  const picker = modelPicker({ ...context(), runtimeConfig });
  const rows = await picker.load();
  expect(rows.find(row => row.id === id('a'))).toMatchObject({ disabled: true, note: 'account pool unavailable' });
  expect(rows.find(row => row.id === id('b'))?.disabled).not.toBe(true);
  expect((await picker.apply([id('b')]))?.note).toContain('Connection: b');
  expect(resolveProviderCredential({ runtimeConfig: projectSessionModel(getRuntimeConfig(home), sessionId), env: {} }).credential?.connectionId).toBe('b');
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before);
  expect(fetch).not.toHaveBeenCalled();
});

it('distinguishes two relays, publishes the exact request target, and restores it on resume without changing defaults', async () => {
  const shell = createShellRuntimeContext({ cwd: home, originalCwd: home, projectRoot: home, targetPathBase: home,
    rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
    session: manager.getSession(sessionId)!, runtimeConfig: getRuntimeConfig(home) });
  const bridge = createCliProviderRuntimeBridge({ runtimeConfig: () => shell.runtimeConfig, options: {}, env: {} });
  const picker = modelPicker({ ...context(), readConfiguration: () => shell.configuration.current,
    resolveConfigTarget: config => resolveProviderCredential({ runtimeConfig: config, env: {} }),
    refreshRuntimeConfig: () => refreshShellRuntimeConfig(shell) });
  const global = fs.readFileSync(getUserRuntimeConfigPath());
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected probe'));
  const rows = await picker.load();
  expect(rows.find(row => row.id === id('a'))).toMatchObject({ label: 'shared', note: 'active' });
  expect(rows.find(row => row.id === id())).toMatchObject({ label: 'shared', detail: expect.stringContaining('b.example.invalid/v1') });
  expect(picker.detail?.(id()).join('\n')).toContain('Connection: b');
  expect((await picker.apply([id()]))?.note).toContain('Connection: b');
  expect(bridge.resolveCredentialSnapshot().credential).toMatchObject({ connectionId: 'b', model: 'shared', baseUrl: 'https://b.example.invalid/v1', apiKey: 'synthetic-b' });
  expect(shell.runtimeConfig.configProvenance.activeProviderConnectionId.sources).toEqual(['session']);
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
  expect(fetch).not.toHaveBeenCalled();
  manager.persistUserPromptBarrier(sessionId, 'retain exact target'); manager.saveInterrupted(sessionId);
  const resumed = new SessionManager(); expect(resumed.tryResume(sessionId)).toMatchObject({ ok: true });
  switchActiveSession(shell, manager.createNew(home));
  expect(bridge.resolveCredentialSnapshot().credential?.connectionId).toBe('a');
  switchActiveSession(shell, resumed.getSession(sessionId)!);
  expect(bridge.resolveCredentialSnapshot().credential?.connectionId).toBe('b');
});

it.each(['connection', 'catalog', 'session', 'environment', 'publication'])('rejects a stale %s before hooks or writes', async change => {
  let revision = 1;
  const config = getRuntimeConfig(home); const catalog = loadCatalog();
  const picker = modelPicker({ ...context(), readConfiguration: () => ({ config, catalog, revision }) });
  await picker.load();
  if (change === 'connection') {
    const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    writeUserRuntimeConfigFile({ ...edit.values, providerConnections: edit.values.providerConnections!.map(item => item.id === 'b' ? { ...item, apiKey: 'synthetic-rotated' } : item) }, edit);
  } else if (change === 'catalog') writeCatalogCache([{ id: 'openai', models: [{ id: 'shared', contextWindow: 512_000 }] }]);
  else if (change === 'session') writeSessionModel(sessionId, { connectionId: 'a', provider: 'openai', model: 'other' }, readSessionModelEdit(sessionId));
  else if (change === 'environment') vi.stubEnv('OPENAI_API_KEY', 'synthetic-env');
  else revision++;
  const before = readSessionModelEdit(sessionId); const global = fs.readFileSync(getUserRuntimeConfigPath());
  const hook = vi.spyOn(defaultHookDispatcher, 'dispatch');
  expect((await picker.apply([id()]))?.note).toContain('expired');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
  expect(hook).not.toHaveBeenCalled();
});

it('retains the displayed session revision across an asynchronous hook and refuses a competing selection', async () => {
  const picker = modelPicker(context()); await picker.load();
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') writeSessionModel(sessionId, { connectionId: 'a', provider: 'openai', model: 'other' }, readSessionModelEdit(sessionId));
    return undefined;
  });
  expect((await picker.apply([id()]))?.note).toContain('blocked');
  expect(readSessionModel(sessionId)).toMatchObject({ connectionId: 'a', model: 'other' });
});

it.each(['pending', 'error'])('keeps %s connections visible without making them actionable', async status => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: edit.values.providerConnections!.map(item => item.id === 'b' ? { ...item, status: status as 'pending' | 'error' } : item) }, edit);
  const picker = modelPicker(context());
  expect((await picker.load()).find(row => row.id === id())?.disabled).toBe(true);
  expect((await picker.apply([id()]))?.note).toContain('unavailable');
  expect(readSessionModel(sessionId)).toBeUndefined();
});

it.each(['deleted', 'provider-changed', 'error'])('blocks an explicit session target that becomes %s and allows choosing a replacement', async change => {
  const picker = modelPicker(context()); await picker.load();
  expect((await picker.apply([id()]))?.note).toContain('Connection: b');
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const connections = change === 'deleted' ? edit.values.providerConnections!.filter(item => item.id !== 'b')
    : edit.values.providerConnections!.map(item => item.id !== 'b' ? item : change === 'provider-changed'
      ? { ...item, provider: 'google' as const } : { ...item, status: 'error' as const });
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: connections }, edit);
  const effective = projectSessionModel(getRuntimeConfig(home), sessionId);
  const resolution = resolveProviderCredential({ runtimeConfig: effective, env: { OPENAI_API_KEY: 'synthetic-env' } });
  expect(effective.activeProviderConnectionId).toBe('b');
  expect(resolution.blocked).toBe('connection-unavailable'); expect(resolution.credential).toBeUndefined();
  const replacement = modelPicker(context()); await replacement.load();
  expect((await replacement.apply([id('a')]))?.note).toContain('Connection: a');
  expect(resolveProviderCredential({ runtimeConfig: projectSessionModel(getRuntimeConfig(home), sessionId), env: {} }).credential?.connectionId).toBe('a');
});

it.each(['model', 'baseUrl'])('blocks a request %s override before the row can leave the picker', async field => {
  const picker = modelPicker({ ...context(), resolveConfigTarget: config => {
    const result = resolveProviderCredential({ runtimeConfig: config, env: {} });
    return { ...result, [field]: field === 'model' ? 'other' : 'https://different.example.invalid/v1' };
  } });
  const row = (await picker.load()).find(item => item.id === id());
  expect(row).toMatchObject({ disabled: true, focusable: true, note: 'request target mismatch' });
  const overlay = new OverlayHost(() => {}); overlay.open(picker);
  await new Promise(resolve => setTimeout(resolve, 0));
  let pending: Promise<unknown> | undefined;
  overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => {
    pending = selected.apply(ids).then(outcome => { if (outcome?.next) overlay.open(outcome.next); });
  });
  await pending; await new Promise(resolve => setTimeout(resolve, 0));
  expect(overlay.active).toBe(true);
  overlay.close();
  expect(readSessionModel(sessionId)).toBeUndefined();
});

it('keeps the selected connection credential when an environment account is configured', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-env-account');
  const picker = modelPicker(context()); await picker.load();
  expect((await picker.apply([id()]))?.note).toContain('Connection: b');
  const config = projectSessionModel(getRuntimeConfig(home), sessionId);
  expect(resolveProviderCredential({ runtimeConfig: config }).credential).toMatchObject({ connectionId: 'b', apiKey: 'synthetic-b', source: 'connection' });
  expect(resolveProviderCredential({ runtimeConfig: getRuntimeConfig(home) }).credential).toMatchObject({ apiKey: 'synthetic-env-account', source: 'env' });
  const override = resolveProviderCredential({ runtimeConfig: config, cliApiKey: 'synthetic-other-account' });
  expect(override.blocked).toBe('connection-overridden'); expect(override.credential).toBeUndefined();
});

it('blocks a CLI credential override before persisting an exact connection choice', async () => {
  const picker = modelPicker({ ...context(), resolveConfigTarget: config => resolveProviderCredential({ runtimeConfig: config, cliApiKey: 'synthetic-other-account' }) });
  const row = (await picker.load()).find(item => item.id === id());
  expect(row).toMatchObject({ disabled: true, focusable: true, note: 'request target mismatch' });
  expect(readSessionModel(sessionId)).toBeUndefined();
});

it('orders configured providers before unavailable catalogue entries', async () => {
  const rows = await modelPicker(context()).load();
  expect(rows[0]?.detail).toContain('Relay a');
  expect(rows[0]?.disabled).not.toBe(true);
});

it('marks the resolved fallback connection active when no global connection is selected', async () => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, activeProviderConnectionId: undefined,
    providerConnections: edit.values.providerConnections!.map(item => item.id === 'b' ? { ...item, updatedAt: '2026-02-01' } : item) }, edit);
  const picker = modelPicker(context()); const rows = await picker.load();
  expect(rows.filter(row => row.note === 'active').map(row => row.id)).toEqual([id()]);
  expect(rows.some(row => row.id === 'model:current')).toBe(false);
});

it('uses the request provider effort when CLI provider selection differs from the global default', async () => {
  vi.stubEnv('GEMINI_API_KEY', '');
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: [
    { ...edit.values.providerConnections![0], thinkingEffort: 'high' },
    { ...edit.values.providerConnections![1], provider: 'google', thinkingEffort: 'low' },
  ] }, edit);
  writeCatalogCache([{ id: 'google', models: [{ id: 'shared', reasoning: true }] }]);
  const picker = modelPicker({ ...context(), resolveConfigTarget: config => resolveProviderCredential({ runtimeConfig: config, cliProvider: 'google' }) });
  const row = (await picker.load()).find(item => item.note === 'active');
  expect(row?.id).toBe(`model:${JSON.stringify(['b', 'google', 'shared'])}`);
  expect(picker.detail?.(row!.id)).toContain('Reasoning effort: low');
  expect((await picker.apply([row!.id]))?.note).toContain('Reasoning effort: low');
  expect(readSessionModel(sessionId)).toMatchObject({ provider: 'google', connectionId: 'b', thinkingEffort: 'low' });
});

it.each(['env', 'cli'] as const)('shows an active %s request without attributing its account to a named connection', async source => {
  if (source === 'env') vi.stubEnv('OPENAI_API_KEY', 'synthetic-env-account');
  const picker = modelPicker({ ...context(), resolveConfigTarget: config => resolveProviderCredential({ runtimeConfig: config,
    ...(source === 'cli' ? { cliApiKey: 'synthetic-cli-account', cliBaseUrl: 'https://synthetic-user:synthetic-password@override.invalid/v1?key=synthetic-query#synthetic-fragment' } : {}) }) });
  const before = readSessionModelEdit(sessionId); const global = fs.readFileSync(getUserRuntimeConfigPath());
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected probe'));
  const rows = await picker.load();
  const activeId = source === 'cli' ? `model:${JSON.stringify([null, 'openai', 'shared'])}` : 'model:current';
  expect(rows.filter(row => row.note === 'active')).toEqual([expect.objectContaining({ id: activeId, label: 'shared' })]);
  expect(picker.detail?.(activeId)).toContain(`Credential source: ${source}`);
  expect(JSON.stringify([rows, picker.detail?.(activeId)])).not.toMatch(/synthetic-(?:env|cli|user|password|query|fragment)/);
  if (source === 'cli') expect(picker.detail?.(activeId)).toContain('Endpoint: override.invalid/v1');
  expect((await picker.apply(['model:current']))?.note).toContain('unavailable');
  expect(readSessionModelEdit(sessionId)).toEqual(before); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps later model changes on the session connection and changes defaults only with an explicit global save', async () => {
  const picker = modelPicker(context()); await picker.load();
  expect((await picker.apply([id()]))?.note).toContain('Connection: b');
  const global = fs.readFileSync(getUserRuntimeConfigPath());
  expect((await runModelCommand(['other'], context())).output).toContain('Connection: b');
  expect(readSessionModel(sessionId)).toMatchObject({ connectionScope: 'session', connectionId: 'b', model: 'other' });
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
  expect((await runModelCommand(['shared', '--global'], context())).output).toContain('Global default stored at');
  expect(readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values.activeProviderConnectionId).toBe('b');
});

it('applies a named profile role in an empty session and rejects later preset replacement', async () => {
  const roles = { default: { connectionId: 'a', provider: 'openai', model: 'shared' },
    review: { connectionId: 'b', provider: 'openai', model: 'other', thinkingEffort: 'high' as const } };
  expect(saveProfileModelPreset('work', roles, context())).toContain('saved');
  const picker = modelPicker(context());
  expect((await picker.load()).find(row => row.id === 'preset:work:review')?.detail).toContain('b · openai/other');
  const global = fs.readFileSync(getUserRuntimeConfigPath());
  expect((await picker.apply(['preset:work:review']))?.note).toContain("role 'review' applied");
  expect(readSessionModel(sessionId)).toMatchObject({ connectionId: 'b', model: 'other', thinkingEffort: 'high', connectionScope: 'session' });
  expect(projectSessionModel(getRuntimeConfig(home), sessionId).activeProviderConnectionId).toBe('b');
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
  await picker.load(); expect(await picker.apply(['preset:work:review'])).toBeUndefined();
  const fresh = modelPicker(context()); await fresh.load();
  expect(saveProfileModelPreset('work', { default: roles.default }, context())).toContain('replaced');
  const before = readSessionModelEdit(sessionId);
  expect((await fresh.apply(['preset:work:review']))?.note).toContain('preset changed');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it('searches a relay and rejects its row after the publication revision changes', async () => {
  let revision = 1;
  const config = getRuntimeConfig(home); const catalog = loadCatalog();
  const picker = modelPicker({ ...context(), readConfiguration: () => ({ config, catalog, revision }) });
  const overlay = new OverlayHost(() => {});
  overlay.open(picker);
  await new Promise(resolve => setTimeout(resolve, 0));
  overlay.handlePaste('relay b');
  const rendered = stripAnsi(overlay.render(120, 30).join('\n'));
  expect(rendered).toContain('Relay b');
  expect(rendered).not.toContain('Relay a');

  revision++;
  const before = readSessionModelEdit(sessionId);
  let result: ReturnType<typeof picker.apply> | undefined;
  overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { result = selected.apply(ids); });
  expect((await result!)?.note).toContain('expired');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it('searches a named role and rejects it after the preset owner changes', async () => {
  const roles = { default: { connectionId: 'a', provider: 'openai', model: 'shared' },
    review: { connectionId: 'b', provider: 'openai', model: 'other', thinkingEffort: 'high' as const } };
  expect(saveProfileModelPreset('work', roles, context())).toContain('saved');
  const picker = modelPicker(context());
  const overlay = new OverlayHost(() => {});
  overlay.open(picker);
  await new Promise(resolve => setTimeout(resolve, 0));
  overlay.handlePaste('Preset: work / review');
  expect(stripAnsi(overlay.render(120, 30).join('\n'))).toContain('Preset: work / review');

  expect(saveProfileModelPreset('work', {
    default: roles.default,
    review: { ...roles.review, model: 'shared' },
  }, context())).toContain('replaced');
  const before = readSessionModelEdit(sessionId);
  let result: ReturnType<typeof picker.apply> | undefined;
  overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { result = selected.apply(ids); });
  expect((await result!)?.note).toContain('preset changed');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
});
