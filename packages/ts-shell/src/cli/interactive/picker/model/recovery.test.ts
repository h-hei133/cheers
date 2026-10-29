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

function prospective(commands: CommandContext) {
  return { target: { connectionId: 'relay', provider: 'openai' as const, model: 'shared' }, current: 'high' as const,
    catalog: commands.readConfiguration!().catalog, baseUrl: 'https://relay.invalid/v1', lines: [],
    save: vi.fn(async () => 'Model switched to shared.'), admission: vi.fn((): string | undefined => undefined),
    canReturn: vi.fn(() => true), back: vi.fn((_notice?: string) => modelPicker(commands)),
    done: vi.fn((_notice: string) => modelPicker(commands)) };
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

it.each(['catalogue', 'configuration'] as const)('returns an expired prospective selection after %s changes without partially changing current effort', async change => {
  const { runtime, commands } = host(); const { effort } = await recovery(commands);
  const original = readSessionModel(runtime.session.id);
  if (change === 'catalogue') catalogue(true);
  else {
    const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
    writeUserRuntimeConfigFile({ ...edit.value, topP: 0.8 }, edit);
  }
  const before = fs.readFileSync(getUserRuntimeConfigPath()), result = await effort.apply(['medium']);
  expect(result?.note).toContain('expired'); expect(result?.next?.initialSelection).toBe(target);
  expect(result?.next?.status?.()).toContain(result!.note);
  expect(await effort.apply(['medium'])).toBeUndefined(); expect(await effort.load()).toEqual([]);
  expect(readSessionModel(runtime.session.id)).toEqual(original); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before);
});

it.each((['close', 'replace'] as const).flatMap(ending => [false, true].map(refuse => ({ ending, refuse }))))(
  'retires an accepted recovery when admission causes host $ending (refuse: $refuse)', async ({ ending, refuse }) => {
    const { commands } = host(), selection = prospective(commands), overlay = new OverlayHost(() => {});
    selection.admission.mockImplementation(() => {
      if (ending === 'close') overlay.close(); else overlay.open(modelPicker(commands));
      return refuse ? 'Model selection expired.' : undefined;
    });
    const effort = modelEffortPicker(selection); overlay.open(effort); await new Promise(resolve => setTimeout(resolve, 0));
    let pending!: ReturnType<typeof effort.apply>;
    try {
      overlay.handleKey(parseKeyEvent('\x1b[A'), vi.fn());
      overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids, overlay.acceptanceFor(selected)); });
      expect(await pending).toBeUndefined(); expect(selection.save).not.toHaveBeenCalled();
      expect(selection.canReturn).not.toHaveBeenCalled(); expect(selection.back).not.toHaveBeenCalled(); expect(selection.done).not.toHaveBeenCalled();
      expect(await effort.apply(['medium'])).toBeUndefined(); expect(await effort.load()).toEqual([]);
    } finally { overlay.close(); }
  });

it.each(['close', 'replace'] as const)('discards a recovery refusal if browser admission causes host %s', async ending => {
  const { commands } = host(), selection = prospective(commands), overlay = new OverlayHost(() => {});
  selection.admission.mockReturnValue('Model selection expired.');
  selection.canReturn.mockImplementation(() => { if (ending === 'close') overlay.close(); else overlay.open(modelPicker(commands)); return true; });
  const effort = modelEffortPicker(selection); overlay.open(effort); await new Promise(resolve => setTimeout(resolve, 0));
  let pending!: ReturnType<typeof effort.apply>;
  try {
    overlay.handleKey(parseKeyEvent('\x1b[A'), vi.fn());
    overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids, overlay.acceptanceFor(selected)); });
    expect(await pending).toBeUndefined(); expect(selection.canReturn).toHaveBeenCalledTimes(1);
    expect(selection.save).not.toHaveBeenCalled(); expect(selection.back).not.toHaveBeenCalled(); expect(selection.done).not.toHaveBeenCalled();
    expect(await effort.apply(['medium'])).toBeUndefined(); expect(await effort.load()).toEqual([]);
  } finally { overlay.close(); }
});

it.each(['absent', 'throw'] as const)('keeps the recovery refusal retired without a verified browser (%s guard)', async guard => {
  const { commands } = host(), selection = prospective(commands);
  selection.admission.mockReturnValue('Model selection expired.');
  selection.canReturn.mockImplementation(() => { throw new Error('private return diagnostic'); });
  const { canReturn: _guard, ...unguarded } = selection;
  const effort = modelEffortPicker(guard === 'absent' ? unguarded : selection); await effort.load();
  expect(await effort.apply(['medium'])).toEqual({ note: 'Model selection expired.' });
  expect(await effort.apply(['medium'])).toBeUndefined(); expect(await effort.load()).toEqual([]);
  expect(selection.save).not.toHaveBeenCalled(); expect(selection.back).not.toHaveBeenCalled(); expect(selection.done).not.toHaveBeenCalled();
});

it('retires an accepted recovery that begins after the host closes', async () => {
  const { commands } = host(), selection = prospective(commands), overlay = new OverlayHost(() => {});
  const effort = modelEffortPicker(selection); overlay.open(effort); await new Promise(resolve => setTimeout(resolve, 0));
  let accepted!: () => ReturnType<typeof effort.apply>;
  try {
    overlay.handleKey(parseKeyEvent('\x1b[A'), vi.fn());
    overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => {
      const owned = overlay.acceptanceFor(selected); accepted = () => selected.apply(ids, owned);
    });
    overlay.close(); expect(await accepted()).toBeUndefined(); expect(await effort.load()).toEqual([]);
    expect(await effort.apply(['medium'])).toBeUndefined(); expect(selection.admission).not.toHaveBeenCalled();
    expect(selection.save).not.toHaveBeenCalled(); expect(selection.back).not.toHaveBeenCalled(); expect(selection.done).not.toHaveBeenCalled();
  } finally { overlay.close(); }
});

it.each((['PreModelSwitch', 'PostModelSwitch'] as const).flatMap(eventName =>
  (['close', 'replace'] as const).map(ending => ({ eventName, ending }))))(
  'fences recovery writes and returns when $eventName causes host $ending', async ({ eventName, ending }) => {
    const { runtime, commands } = host(), { effort } = await recovery(commands), overlay = new OverlayHost(() => {});
    const original = readSessionModel(runtime.session.id), config = fs.readFileSync(getUserRuntimeConfigPath());
    vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
      if (event.eventName === eventName) { if (ending === 'close') overlay.close(); else overlay.open(modelPicker(commands)); }
      return undefined;
    });
    overlay.open(effort); await new Promise(resolve => setTimeout(resolve, 0));
    let pending!: ReturnType<typeof effort.apply>;
    try {
      overlay.handleKey(parseKeyEvent('\x1b[A'), vi.fn());
      overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids, overlay.acceptanceFor(selected)); });
      const result = await pending;
      expect(result?.note).toContain(eventName === 'PreModelSwitch' ? 'blocked' : 'Model switched'); expect(result?.next).toBeUndefined();
      if (eventName === 'PreModelSwitch') expect(readSessionModel(runtime.session.id)).toEqual(original);
      else {
        const { contextWindow: _window, ...controls } = original!;
        expect(readSessionModel(runtime.session.id)).toEqual({ ...controls, connectionId: 'relay', thinkingEffort: 'medium' });
      }
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(config);
      expect(await effort.apply(['medium'])).toBeUndefined(); expect(await effort.load()).toEqual([]);
    } finally { overlay.close(); }
  });

it.each(['workspace', 'abort', 'throw'] as const)(
  'keeps a confirmed recovery write without returning after browser %s during PostModelSwitch', async ending => {
    const { runtime, commands } = host(), controller = new AbortController(); let completed = false;
    const { effort } = await recovery({ ...commands, signal: controller.signal, admission: () => {
      if (completed && ending === 'throw') throw new Error('private browser diagnostic');
      return commands.admission();
    } });
    const before = readSessionModel(runtime.session.id)!, config = fs.readFileSync(getUserRuntimeConfigPath());
    vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
      if (event.eventName === 'PostModelSwitch') {
        completed = true;
        if (ending === 'workspace') runtime.workspaceIssue = 'Workspace is unavailable.';
        if (ending === 'abort') controller.abort();
      }
      return undefined;
    });
    const overlay = new OverlayHost(() => {}); overlay.open(effort);
    await new Promise(resolve => setTimeout(resolve, 0)); let pending!: ReturnType<typeof effort.apply>;
    try {
      overlay.handleKey(parseKeyEvent('\x1b[A'), vi.fn());
      overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids, overlay.acceptanceFor(selected)); });
      const result = await pending;
      expect(completed).toBe(true); expect(result?.note).toContain('Model switched to shared.');
      expect(result?.next).toBeUndefined();
      const { contextWindow: _window, ...controls } = before;
      expect(readSessionModel(runtime.session.id)).toEqual({ ...controls, connectionId: 'relay', thinkingEffort: 'medium' });
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(config);
      expect(await effort.apply(['medium'])).toBeUndefined(); expect(await effort.load()).toEqual([]);
    } finally { overlay.close(); }
  });

it.each(['absent', 'refuse', 'throw'] as const)('keeps a saved recovery notice without a verified browser (%s guard)', async guard => {
  const { commands } = host(), selection = prospective(commands);
  selection.canReturn.mockImplementation(() => { if (guard === 'throw') throw new Error('private browser diagnostic'); return false; });
  const { canReturn: _guard, ...unguarded } = selection;
  const effort = modelEffortPicker(guard === 'absent' ? unguarded : selection); await effort.load();
  expect(await effort.apply(['medium'])).toEqual({ note: 'Model switched to shared.' });
  expect(selection.save).toHaveBeenCalledOnce(); expect(selection.done).not.toHaveBeenCalled(); expect(selection.back).not.toHaveBeenCalled();
  expect(await effort.apply(['medium'])).toBeUndefined(); expect(await effort.load()).toEqual([]);
});

it.each(['close', 'replace'] as const)('keeps a saved recovery notice if browser return admission causes host %s', async ending => {
  const { commands } = host(), selection = prospective(commands), overlay = new OverlayHost(() => {});
  selection.canReturn.mockImplementation(() => { if (ending === 'close') overlay.close(); else overlay.open(modelPicker(commands)); return true; });
  const effort = modelEffortPicker(selection); overlay.open(effort); await new Promise(resolve => setTimeout(resolve, 0));
  let pending!: ReturnType<typeof effort.apply>;
  try {
    overlay.handleKey(parseKeyEvent('\x1b[A'), vi.fn());
    overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids, overlay.acceptanceFor(selected)); });
    expect(await pending).toEqual({ note: 'Model switched to shared.' }); expect(selection.canReturn).toHaveBeenCalledOnce();
    expect(selection.save).toHaveBeenCalledOnce(); expect(selection.done).not.toHaveBeenCalled(); expect(selection.back).not.toHaveBeenCalled();
    expect(overlay.active).toBe(ending === 'replace');
    expect(await effort.apply(['medium'])).toBeUndefined(); expect(await effort.load()).toEqual([]);
  } finally { overlay.close(); }
});

it.each(['refuse', 'abort', 'throw'] as const)('retires refused recovery without returning when its original browser will %s', async ending => {
  const { runtime, commands } = host(), controller = new AbortController(); let armed = false, reads = 0;
  const { effort } = await recovery({ ...commands, signal: controller.signal, admission: () => {
    if (!armed) return commands.admission();
    if (++reads === 1) return 'Old choice expired.';
    if (ending === 'abort') { controller.abort(); return undefined; }
    if (ending === 'throw') throw new Error('private owner diagnostic');
    return 'Workspace changed.';
  } });
  const before = readSessionModelEdit(runtime.session.id); armed = true;
  const result = await effort.apply(['medium']);
  expect(result?.note).toContain('expired'); expect(result?.next).toBeUndefined(); expect(reads).toBe(2);
  expect(await effort.apply(['medium'])).toBeUndefined(); expect(await effort.load()).toEqual([]);
  expect(readSessionModelEdit(runtime.session.id)).toEqual(before);
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
  expect(result.next!.title).toBe('Settings — current session — from user configuration');
  expect(result.next!.chips?.active).toBe('Session'); expect(result.next!.initialSelection).toBe('settings:model');
  expect(result.next!.footer).toContain('Model switched to shared.');
  expect(readSessionModel(runtime.session.id)).toMatchObject({ connectionId: 'relay', thinkingEffort: 'medium' });
});
