import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { modelPicker } from '../model.js';
import { SessionManager } from '../../../../session/SessionManager.js';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../../config/runtimeConfig.js';
import { userCatalogPath, writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../../session/model/state.js';
import * as modelState from '../../../../session/model/state.js';
import { SessionModelWriteError } from '../../../../session/model/outcome.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig } from '../../../../core/shell/runtimeContext.js';
import { resolveCliCredential } from '../../../provider/cliProviderRuntimeBridge.js';

let home: string;
let manager: SessionManager;
let sessionId: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  home = fs.mkdtempSync(path.join('/tmp/cheers-test', 'model-snapshot-'));
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

it.each(['standalone', 'accepted'] as const)(
  'keeps unreadable saved choices unknown and read-only through %s role recovery', async source => {
    const selected = { connectionScope: 'session' as const, connectionId: 'b', provider: 'openai', model: 'other',
      thinkingEffort: 'high' as const, roles: { advisor: { connectionId: 'b', provider: 'openai', model: 'other', thinkingEffort: 'low' as const } } };
    writeSessionModel(sessionId, selected, readSessionModelEdit(sessionId));
    const shell = createShellRuntimeContext({ cwd: home, originalCwd: home, projectRoot: home, targetPathBase: home,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      session: manager.getSession(sessionId)!, runtimeConfig: getRuntimeConfig(home) });
    const command = { ...context(), resolveConfigTarget: (config: ReturnType<typeof getRuntimeConfig>, targetSessionId?: string) =>
      resolveCliCredential(config, {}, {}, targetSessionId), ...(source === 'accepted' ? {
        readConfiguration: () => shell.configuration.current,
        refreshRuntimeConfig: (scope?: 'catalog') => refreshShellRuntimeConfig(shell, scope),
      } : {}) };
    const { statePath } = readSessionModelEdit(sessionId), stateBytes = fs.readFileSync(statePath);
    const configBytes = fs.readFileSync(getUserRuntimeConfigPath());
    fs.writeFileSync(statePath, '{PRIVATE_UNREADABLE_STATE');
    const writer = vi.spyOn(modelState, 'writeSessionModel');
    const notice = new SessionModelWriteError('verification-failed', 'unknown').message;
    const picker = modelPicker(command, 'role:advisor', undefined, undefined, notice);
    const rows = await picker.load();
    const models = rows.filter(row => row.id.startsWith('model:'));
    expect(models.length).toBeGreaterThan(0); expect(models.every(row => row.disabled)).toBe(true);
    expect(rows.some(row => row.note?.startsWith('active'))).toBe(false);
    expect(models.find(row => row.id === id('b', 'other'))?.note).toBe('saved session unavailable');
    expect(rows.some(row => row.id === 'model:current')).toBe(false);
    expect(rows.filter(row => row.id.startsWith('role:')).map(row => row.detail)).toEqual(['unknown', 'unknown', 'unknown', 'unknown']);
    expect(picker.initialSelection).toBe('role:advisor'); expect(picker.status?.([], '')).toBe(notice);
    expect(picker.detail!('role:advisor')).toContain('Model: unknown');
    expect(picker.detail!('role:advisor').join('\n')).not.toContain('PRIVATE_UNREADABLE_STATE');
    const inspected = (await picker.inspect!(id('b', 'other')))!.next!;
    expect((await inspected.load()).map(row => row.id)).not.toContain('effort');
    expect((await picker.apply([id('b', 'other')]))?.note).toContain('unavailable');
    const recovery = (await picker.inspect!('role:advisor'))!.next!;
    await recovery.load();
    expect(recovery.initialSelection).toBe('role:advisor'); expect(recovery.status?.([], '')).toBe(notice);
    expect(writer).not.toHaveBeenCalled(); expect(fs.readFileSync(statePath, 'utf8')).toBe('{PRIVATE_UNREADABLE_STATE');
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(configBytes);
    expect(() => resolveCliCredential(shell.runtimeConfig, {}, {}, sessionId)).toThrow(SessionModelWriteError);
    fs.writeFileSync(statePath, stateBytes);
    const fresh = (await recovery.inspect!('role:advisor'))!.next!; await fresh.load();
    const saved = await fresh.apply(['default']);
    expect(saved?.note).toContain('advisor follows the default'); expect(writer).toHaveBeenCalledTimes(1);
    expect(readSessionModel(sessionId)).toEqual({ ...selected, roles: {} });
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(configBytes);
  },
);

it.each(['{PRIVATE_CATALOG_VALUE', '{"providers":{},"providers":{}}'])(
  'shows catalogue diagnostics and file ownership without writing on inspection: %s', async text => {
    fs.writeFileSync(userCatalogPath(), text);
    const before = fs.readFileSync(getUserRuntimeConfigPath());
    const picker = modelPicker(context()); await picker.load();
    expect(picker.status?.([], '')).toMatch(/models\.yaml (could not be parsed|repeats the top-level providers key)/);
    expect(picker.status?.([], '')).not.toContain('PRIVATE_CATALOG_VALUE');
    expect(picker.detail!(id()).join('\n')).toContain('Catalogue: models.yaml, models.yml or models.json (user profile only)');
    expect(picker.detail!(id()).join('\n')).toContain('settings: config.yaml, config.yml or config.json; connections: auth.json.');
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
  expect(picker.status?.([], '')).toContain('models.yaml could not be parsed');
  const accepted = shell.configuration.current;
  fs.writeFileSync(userCatalogPath(), '{}');
  expect(shell.configuration.current.catalogDiagnostics).toBe(accepted.catalogDiagnostics);
  const reopened = modelPicker(command); await reopened.load();
  expect(shell.configuration.current.revision).toBeGreaterThan(accepted.revision);
  expect(shell.configuration.current.catalog).toEqual(accepted.catalog);
  expect(shell.configuration.current.catalogDiagnostics).toEqual([]);
  expect(reopened.status?.([], '')).toBeUndefined();
});

