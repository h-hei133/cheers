import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../../config/runtimeConfig.js';
import { writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig } from '../../../../core/shell/runtimeContext.js';
import { configurationAdmission } from '../../../../core/shell/configuration.js';
import { SessionManager } from '../../../../session/SessionManager.js';
import { readSessionModelEdit } from '../../../../session/model/state.js';
import { modelPicker } from '../model.js';

let root: string;
const target = `model:${JSON.stringify([null, 'relay', 'shared'])}`;
const catalogue = (baseUrl = 'https://original.invalid/v1', maxTokens = 16000) => writeCatalogCache([
  { id: 'relay', runtime: 'openai', baseUrl, models: [{ id: 'shared', contextWindow: 128000 }] },
  { id: 'openai', models: [{ id: 'shared', contextWindow: 128000, maxTokens }] },
]);
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/model-publication-');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('OPENAI_API_KEY', '');
  writeUserRuntimeConfigFile({ provider: 'openai', maxTurns: 20, maxOutputTokens: 8000, activeProviderConnectionId: 'main',
    providerConnections: [{ id: 'main', provider: 'openai', authType: 'api-key', apiKey: 'synthetic-fixture', model: 'shared',
      createdAt: '2026-01-01', updatedAt: '2026-01-01' }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  catalogue();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function host() {
  const runtime = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct', targetPathBase: root,
    gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root),
    session: new SessionManager().createNew(root) });
  const commands = { cwd: root, projectRoot: root, sessionId: runtime.session.id, admission: configurationAdmission(runtime),
    readConfiguration: () => runtime.configuration.current, refreshRuntimeConfig: (scope?: 'catalog') => refreshShellRuntimeConfig(runtime, scope) };
  return { runtime, commands };
}

it('reopens from a fresh accepted catalogue after stale rejection while ordinary settings remain pinned', async () => {
  const { runtime, commands } = host(); const initial = runtime.configuration.current;
  const picker = modelPicker(commands); await picker.load(); const details = (await picker.inspect!(target))!.next!; await details.load();
  catalogue('https://replacement.invalid/v1');
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.value, maxTurns: 31 }, edit);
  const before = fs.readFileSync(getUserRuntimeConfigPath()), selection = readSessionModelEdit(runtime.session.id);
  expect((await details.apply(['configure']))?.note).toContain('expired');
  const reopened = modelPicker(commands, undefined, undefined, undefined, undefined, vi.fn());
  await reopened.load();
  expect(runtime.configuration.current.catalog.find(item => item.id === 'relay')?.baseUrl).toBe('https://replacement.invalid/v1');
  expect(runtime.configuration.current.revision).toBeGreaterThan(initial.revision);
  expect(runtime.runtimeConfig.maxTurns).toBe(20); expect(runtime.configuration.current.requested.maxTurns).toBe(20);
  expect(runtime.configuration.current.binding).toEqual(initial.binding);
  const fresh = (await reopened.inspect!(target))!.next!; await fresh.load();
  expect(fresh.detail!('back').join('\n')).toContain('replacement.invalid/v1');
  const key = (await fresh.apply(['configure']))!.next!; expect(key.input?.masked).toBe(true);
  const returned = key.back!(); await returned.load();
  expect(returned.detail!(target).join('\n')).toContain('replacement.invalid/v1');
  const published = runtime.configuration.current; await returned.load();
  expect(runtime.configuration.current).toBe(published);
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(readSessionModelEdit(runtime.session.id)).toEqual(selection);
});

it('retains the accepted catalogue and refuses child construction when new metadata violates active output constraints', async () => {
  const { runtime, commands } = host(); const accepted = runtime.configuration.current;
  catalogue('https://replacement.invalid/v1', 1000);
  const signIn = vi.fn(); const picker = modelPicker(commands, undefined, undefined, undefined, undefined, signIn);
  await expect(picker.load()).rejects.toThrow('catalogue');
  expect(runtime.configuration.current.catalog).toBe(accepted.catalog);
  expect(runtime.configuration.current.config).toBe(accepted.config);
  expect(await picker.inspect!(target)).toBeUndefined(); expect(signIn).not.toHaveBeenCalled();
});

it('does not construct a child if catalogue publication is followed by cancellation', async () => {
  const { runtime, commands } = host(); const controller = new AbortController();
  catalogue('https://replacement.invalid/v1');
  const refresh = vi.fn((scope?: 'catalog') => { const result = refreshShellRuntimeConfig(runtime, scope); controller.abort(); return result; });
  const picker = modelPicker({ ...commands, signal: controller.signal, refreshRuntimeConfig: refresh });
  await expect(picker.load()).rejects.toThrow('cancelled');
  expect(refresh).toHaveBeenCalledOnce(); expect(await picker.inspect!(target)).toBeUndefined();
});

it('does not capture another stale target when the catalogue changes again during publication', async () => {
  const { runtime, commands } = host(); catalogue('https://replacement.invalid/v1');
  const picker = modelPicker({ ...commands, refreshRuntimeConfig: (scope?: 'catalog') => {
    const result = refreshShellRuntimeConfig(runtime, scope); catalogue('https://third.invalid/v1'); return result;
  } });
  await expect(picker.load()).rejects.toThrow('changed while loading');
  expect(await picker.inspect!(target)).toBeUndefined();
  const reopened = modelPicker(commands); await reopened.load();
  expect(runtime.configuration.current.catalog.find(item => item.id === 'relay')?.baseUrl).toBe('https://third.invalid/v1');
  expect((await reopened.inspect!(target))?.next?.detail!('back').join('\n')).toContain('third.invalid/v1');
});

it('does not refresh an expired owner or one cancelled by its admission callback', async () => {
  const { commands } = host(); catalogue('https://replacement.invalid/v1'); const refresh = vi.fn(commands.refreshRuntimeConfig);
  await expect(modelPicker({ ...commands, admission: () => 'expired', refreshRuntimeConfig: refresh }).load()).rejects.toThrow('expired');
  const controller = new AbortController();
  await expect(modelPicker({ ...commands, signal: controller.signal, admission: () => { controller.abort(); return undefined; },
    refreshRuntimeConfig: refresh }).load()).rejects.toThrow('cancelled');
  expect(refresh).not.toHaveBeenCalled();
});
