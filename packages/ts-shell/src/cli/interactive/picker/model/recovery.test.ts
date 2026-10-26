import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../../config/runtimeConfig.js';
import { writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig } from '../../../../core/shell/runtimeContext.js';
import { configurationAdmission } from '../../../../core/shell/configuration.js';
import { SessionManager } from '../../../../session/SessionManager.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../../session/model/state.js';
import { resolveProviderCredential } from '../../../../core/shell/providerCredentials.js';
import { modelPicker } from '../model.js';
import { OverlayHost } from '../../overlay.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';
import { defaultHookDispatcher } from '../../../../core/hooks/hookDispatcher.js';
import { modelEffortPicker } from './recovery.js';
import type { CommandContext } from '../../../../core/commands/types.js';
import { pickerFor } from '../registry.js';
import { openSettings } from '../../settings.js';

let root: string;
const target = `model:${JSON.stringify(['relay', 'relay', 'shared'])}`;
const catalogue = (plain = false) => writeCatalogCache([
  { id: 'openai', models: [{ id: 'shared', contextWindow: 128000, reasoning: true }] },
  { id: 'relay', runtime: 'openai', baseUrl: 'https://relay.invalid/v1', models: [{ id: 'shared', contextWindow: 128000,
    reasoning: !plain, thinkingLevelMap: { high: null } }] },
]);
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/model-recovery-');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('OPENAI_API_KEY', '');
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'main', providerConnections: ['main', 'relay'].map(id => ({
    id, provider: 'openai' as const, authType: 'api-key' as const, apiKey: `synthetic-${id}`, model: 'shared', status: 'connected' as const,
    ...(id === 'relay' ? { baseUrl: 'https://relay.invalid/v1' } : {}), createdAt: '2026-01-01', updatedAt: '2026-01-01',
  })) }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  catalogue();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function host() {
  const session = new SessionManager().createNew(root);
  writeSessionModel(session.id, { connectionScope: 'session', connectionId: 'main', provider: 'openai', model: 'shared', thinkingEffort: 'high',
    contextWindow: 100000, skillful: false, roles: { advisor: { connectionId: 'main', provider: 'openai', model: 'shared', thinkingEffort: 'low' } } },
    readSessionModelEdit(session.id));
  const runtime = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct', targetPathBase: root,
    gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root), session });
  const commands = { cwd: root, projectRoot: root, sessionId: session.id, admission: configurationAdmission(runtime),
    readConfiguration: () => runtime.configuration.current, refreshRuntimeConfig: (scope?: 'catalog') => refreshShellRuntimeConfig(runtime, scope) };
  return { runtime, commands };
}
async function recovery(commands: CommandContext) {
  const picker = modelPicker(commands); await picker.load();
  const details = (await picker.inspect!(target))!.next!;
  expect((await details.load()).map(row => row.id)).toEqual(['back', 'effort']);
  const effort = (await details.apply(['effort']))!.next!; await effort.load();
  return { picker, details, effort };
}

it('selects the exact relay and compatible effort in one session transaction, retaining siblings and ordinary settings', async () => {
  const { runtime, commands } = host(); const original = readSessionModel(runtime.session.id)!;
  const before = fs.readFileSync(getUserRuntimeConfigPath()); const { effort } = await recovery(commands);
  expect(effort.initialSelection).toBe('high');
  expect((await effort.load()).find(row => row.id === 'high')).toMatchObject({ disabled: true, focusable: true, note: expect.stringContaining('unsupported') });
  expect(readSessionModel(runtime.session.id)).toEqual(original);
  const result = await effort.apply(['medium']); expect(result?.note).toContain('shared');
  const { contextWindow: previousWindow, ...sessionControls } = original;
  expect(previousWindow).toBe(100000);
  expect(readSessionModel(runtime.session.id)).toEqual({ ...sessionControls, connectionId: 'relay', thinkingEffort: 'medium' });
  const active = resolveProviderCredential({ runtimeConfig: runtime.runtimeConfig });
  expect(active).toMatchObject({ provider: 'openai', model: 'shared', baseUrl: 'https://relay.invalid/v1', thinkingEffort: 'medium', credential: { connectionId: 'relay' } });
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before);
});

it('offers provider-decides recovery for a model with no reasoning parameter and keeps explicit effort disabled', async () => {
  catalogue(true); const { runtime, commands } = host(); const { effort } = await recovery(commands);
  expect((await effort.load()).filter(row => !row.disabled).map(row => row.id)).toEqual(['auto']);
  const original = readSessionModel(runtime.session.id);
  expect(await effort.apply(['high'])).toBeUndefined(); expect(readSessionModel(runtime.session.id)).toEqual(original);
  expect((await effort.apply(['auto']))?.note).toContain('shared');
  expect(readSessionModel(runtime.session.id)).toMatchObject({ connectionId: 'relay', thinkingEffort: null });
});

it('expires the prospective selection after its exact catalogue changes without partially changing current effort', async () => {
  const { runtime, commands } = host(); const { effort } = await recovery(commands);
  const original = readSessionModel(runtime.session.id), before = fs.readFileSync(getUserRuntimeConfigPath());
  catalogue(true);
  expect((await effort.apply(['medium']))?.note).toContain('expired');
  expect(readSessionModel(runtime.session.id)).toEqual(original); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before);
});

it('returns from a real host effort picker without mutation and cannot revive its dismissed actions', async () => {
  const { runtime, commands } = host(); const { effort } = await recovery(commands); const original = readSessionModel(runtime.session.id);
  const overlay = new OverlayHost(() => {}); overlay.open(effort); await new Promise(resolve => setTimeout(resolve, 0));
  expect(stripAnsi(overlay.render(100, 24).join('\n'))).toContain('▸ high');
  overlay.handleKey(parseKeyEvent('\x1b'), vi.fn()); await new Promise(resolve => setTimeout(resolve, 0));
  expect(stripAnsi(overlay.render(160, 24).join('\n'))).toContain('Choose effort');
  expect(await effort.load()).toEqual([]); expect(await effort.apply(['medium'])).toBeUndefined();
  expect(readSessionModel(runtime.session.id)).toEqual(original); overlay.close();
});

it('commits by real host keys after moving away from the unsupported current preference and reopening reads it back', async () => {
  const { runtime, commands } = host(); const { effort } = await recovery(commands);
  const overlay = new OverlayHost(() => {}); overlay.open(effort); await new Promise(resolve => setTimeout(resolve, 0));
  overlay.handleKey(parseKeyEvent('\x1b[A'), vi.fn());
  expect(stripAnsi(overlay.render(100, 24).join('\n'))).toContain('▸ medium');
  let pending: ReturnType<typeof effort.apply> | undefined;
  overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids); });
  const result = (await pending!)!; expect(result.note).toContain('Model switched');
  expect(await effort.apply(['auto'])).toBeUndefined();
  const reopened = modelPicker(commands); const rows = await reopened.load();
  expect(rows.find(row => row.id === target)?.note).toBe('active');
  expect(reopened.detail!(target)).toContain('Reasoning effort: medium'); overlay.close();
});

it('retains the original model and effort when the original switch hook rejects the prospective target', async () => {
  const { runtime, commands } = host(); const { effort } = await recovery(commands); const original = readSessionModel(runtime.session.id);
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockResolvedValue({ decision: 'block' });
  expect((await effort.apply(['medium']))?.note).toContain('blocked by hook');
  expect(readSessionModel(runtime.session.id)).toEqual(original);
});

it.each(['cancel', 'selection'] as const)('rejects %s across the original asynchronous switch hook', async change => {
  const { runtime, commands } = host(); const controller = new AbortController();
  const { effort } = await recovery({ ...commands, signal: controller.signal });
  const original = readSessionModel(runtime.session.id);
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') {
      if (change === 'cancel') controller.abort();
      else writeSessionModel(runtime.session.id, { ...original!, thinkingEffort: 'low' }, readSessionModelEdit(runtime.session.id));
    }
    return undefined;
  });
  const result = await effort.apply(['medium']); expect(result?.note).toContain('blocked');
  expect(readSessionModel(runtime.session.id)).toEqual(change === 'cancel' ? original : { ...original!, thinkingEffort: 'low' });
});

it('rechecks child lifetime after an admission callback closes its actual host', async () => {
  const { commands } = host(); const overlay = new OverlayHost(() => {}); const save = vi.fn();
  const effort = modelEffortPicker({ target: { connectionId: 'relay', provider: 'openai', model: 'shared' }, current: 'high',
    catalog: commands.readConfiguration!().catalog, baseUrl: 'https://relay.invalid/v1', lines: [], save,
    admission: () => { overlay.close(); return undefined; }, back: () => modelPicker(commands), done: () => modelPicker(commands) });
  overlay.open(effort); await new Promise(resolve => setTimeout(resolve, 0));
  expect(await effort.apply(['medium'])).toBeUndefined(); expect(save).not.toHaveBeenCalled();
});

it('does not offer effort recovery as a substitute for a missing credential', async () => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, providerConnections: edit.values.providerConnections!.map(connection =>
    connection.id === 'relay' ? { ...connection, apiKey: undefined } : connection) }, edit);
  const { commands } = host(); const picker = modelPicker(commands); await picker.load();
  const details = (await picker.inspect!(target))!.next!;
  expect((await details.load()).map(row => row.id)).toEqual(['back', 'configure']);
  expect(await details.apply(['effort'])).toBeUndefined();
});

it('returns the real settings session entry with the exact selection outcome after effort recovery', async () => {
  const { runtime, commands } = host();
  const settings = pickerFor('/settings', { commandContext: commands, openSettings: scope => openSettings(runtime, () => {}, scope) })!;
  await settings.load(); const models = (await settings.apply(['settings:model']))!.next!; await models.load();
  const details = (await models.inspect!(target))!.next!; await details.load();
  const effort = (await details.apply(['effort']))!.next!; await effort.load();
  const result = (await effort.apply(['medium']))!; await result.next!.load();
  expect(result.next!.title).toBe('Settings — user configuration — Model'); expect(result.next!.initialSelection).toBe('settings:model');
  expect(result.next!.footer).toContain('Model switched to shared.');
  expect(readSessionModel(runtime.session.id)).toMatchObject({ connectionId: 'relay', thinkingEffort: 'medium' });
});
