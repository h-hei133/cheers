import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../../config/runtimeConfig.js';
import { writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { SessionManager } from '../../../../session/SessionManager.js';
import { readSessionModelEdit, writeSessionModel } from '../../../../session/model/state.js';
import { modelPicker } from '../model.js';
import { OverlayHost } from '../../overlay.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';
import { modelRoleEditor, modelRolePicker } from './role.js';
import { PickerLifecycles } from '../lifecycle.js';
import { modelRoleThinkingPicker } from './thinking.js';
import { prepareModelRole } from '../../../../core/commands/model/role.js';

let root: string, sessionId: string;
const commands = () => ({ cwd: root, projectRoot: root, sessionId });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/role-lifetime-');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('OPENAI_API_KEY', '');
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'ready', providerConnections: [{ id: 'ready',
    provider: 'openai', authType: 'api-key', apiKey: 'synthetic-fixture', baseUrl: 'https://relay.invalid/v1', model: 'shared',
    status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01' }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache([{ id: 'relay', runtime: 'openai', baseUrl: 'https://relay.invalid/v1', models: [{ id: 'shared', reasoning: true }] }]);
  sessionId = new SessionManager().createNew(root).id;
  writeSessionModel(sessionId, { connectionId: 'ready', provider: 'openai', model: 'shared', thinkingEffort: 'high', roles: {
    advisor: { connectionId: 'ready', provider: 'openai', model: 'shared', thinkingEffort: 'high' },
    summary: { connectionId: 'ready', provider: 'openai', model: 'shared', thinkingEffort: 'low' },
  } }, readSessionModelEdit(sessionId));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it.each(['escape', 'close', 'replace'] as const)('retires role actions after actual host %s and does not revive them on load', async closing => {
  const picker = modelPicker(commands()); await picker.load();
  const role = (await picker.inspect!('role:advisor'))!.next!;
  const host = new OverlayHost(() => {}); host.open(role); await settle();
  const before = readSessionModelEdit(sessionId), config = fs.readFileSync(getUserRuntimeConfigPath());
  try {
    if (closing === 'escape') { host.handleKey(parseKeyEvent('\x1b'), vi.fn()); await settle(); }
    else if (closing === 'close') host.close();
    else { host.open(picker); await settle(); }
    for (const action of ['choose', 'thinking', 'default']) expect(await role.apply([action])).toBeUndefined();
    expect(await role.load()).toEqual([]); expect(await role.apply(['default'])).toBeUndefined();
    expect(readSessionModelEdit(sessionId)).toEqual(before); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(config);
  } finally { host.close(); }
});

it.each(['escape', 'close', 'replace'] as const)('retires role thinking after actual host %s and retains original policies', async closing => {
  const picker = modelPicker(commands()); await picker.load();
  const role = (await picker.inspect!('role:advisor'))!.next!; await role.load();
  const thinking = (await role.apply(['thinking']))!.next!;
  const host = new OverlayHost(() => {}); host.open(thinking); await settle();
  const before = readSessionModelEdit(sessionId);
  try {
    if (closing === 'escape') { host.handleKey(parseKeyEvent('\x1b'), vi.fn()); await settle(); }
    else if (closing === 'close') host.close();
    else { host.open(picker); await settle(); }
    expect(await thinking.apply(['low'])).toBeUndefined(); expect(await thinking.load()).toEqual([]);
    expect(await thinking.apply(['auto'])).toBeUndefined(); expect(readSessionModelEdit(sessionId)).toEqual(before);
  } finally { host.close(); }
});

it.each(['choose', 'thinking', 'default'])('returns a refused role %s action to fresh models without constructing its child or saving', async action => {
  const browser = vi.fn(() => modelPicker(commands()));
  const role = modelRoleEditor(commands(), 'advisor', browser, note => modelPicker(commands(), 'role:advisor', undefined, undefined, note)); await role.load();
  const before = readSessionModelEdit(sessionId);
  writeCatalogCache([{ id: 'relay', runtime: 'openai', baseUrl: 'https://relay.invalid/v1', models: [{ id: 'shared', reasoning: false }] }]);
  const result = await role.apply([action]);
  expect(result?.note).toContain('expired'); expect(result?.next?.initialSelection).toBe('role:advisor');
  expect(result?.next?.status?.()).toContain(result!.note);
  expect(await role.apply([action])).toBeUndefined(); expect(await role.load()).toEqual([]);
  expect(browser).not.toHaveBeenCalled(); expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it.each(['subagent', 'summary', 'advisor'] as const)('returns refused %s effort to a fresh editor and requires explicit retry', async name => {
  if (name === 'subagent') {
    const edit = readSessionModelEdit(sessionId);
    writeSessionModel(sessionId, { ...edit.selection!, roles: { ...edit.selection!.roles,
      subagent: { connectionId: 'ready', provider: 'openai', model: 'shared', thinkingEffort: 'high' } } }, edit);
  }
  const rootPicker = modelPicker(commands()); await rootPicker.load();
  const editor = (await rootPicker.inspect!(`role:${name}`))!.next!; await editor.load();
  const thinking = (await editor.apply(['thinking']))!.next!; await thinking.load();
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath()); writeUserRuntimeConfigFile({ ...edit.value, topP: 0.8 }, edit);
  const before = readSessionModelEdit(sessionId), config = fs.readFileSync(getUserRuntimeConfigPath());
  const result = await thinking.apply(['low']);
  expect(result?.note).toContain('expired'); expect(result?.next?.title).toBe(`${name} model`);
  expect(result?.next?.status?.()).toContain(result!.note); expect(readSessionModelEdit(sessionId)).toEqual(before);
  expect(await thinking.apply(['low'])).toBeUndefined(); expect(await thinking.load()).toEqual([]);
  const fresh = result!.next!; await fresh.load();
  const retry = (await fresh.apply(['thinking']))!.next!; await retry.load();
  expect((await retry.apply(['low']))?.note).toContain(`${name} uses`);
  expect(readSessionModelEdit(sessionId).selection).toEqual({ ...before.selection!, roles: { ...before.selection!.roles,
    [name]: { ...before.selection!.roles![name]!, thinkingEffort: 'low' } } });
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(config);
});

it.each((['role', 'thinking'] as const).flatMap(surface =>
  (['close', 'replace'] as const).flatMap(ending =>
    [false, true].map(refuse => ({ surface, ending, refuse })))))(
  'discards accepted $surface results when admission causes host $ending (refuse: $refuse)', async ({ surface, ending, refuse }) => {
    const host = new OverlayHost(() => {}), assign = vi.fn(() => ({ saved: false, output: 'unexpected assignment' })), browse = vi.fn(), back = vi.fn(), canReturn = vi.fn(() => true);
    const current = { connectionId: 'ready', provider: 'openai' as const, model: 'shared', thinkingEffort: 'high' as const };
    const admission = () => { if (ending === 'close') host.close(); else host.open(modelPicker(commands())); return refuse ? 'expired' : undefined; };
    const picker = surface === 'role' ? modelRolePicker('advisor', current, assign, browse, back, undefined, admission, canReturn)
      : modelRoleThinkingPicker(current, [null, 'low', 'high'], assign, back, admission, canReturn);
    host.open(picker); await settle();
    let pending!: ReturnType<typeof picker.apply>;
    try {
      if (surface === 'thinking') { host.handleKey(parseKeyEvent('\x1b[A'), vi.fn()); host.handleKey(parseKeyEvent('\x1b[A'), vi.fn()); }
      host.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids, host.acceptanceFor(selected)); });
      expect(await pending).toBeUndefined(); expect(assign).not.toHaveBeenCalled(); expect(browse).not.toHaveBeenCalled();
      expect(back).not.toHaveBeenCalled(); expect(canReturn).not.toHaveBeenCalled();
      expect(await picker.apply([surface === 'role' ? 'choose' : 'low'])).toBeUndefined(); expect(await picker.load()).toEqual([]);
    } finally { host.close(); }
  });

it.each((['role', 'thinking'] as const).flatMap(surface =>
  (['close', 'replace'] as const).map(ending => ({ surface, ending }))))(
  'discards a $surface refusal if return admission causes host $ending', async ({ surface, ending }) => {
    const host = new OverlayHost(() => {}), assign = vi.fn(() => ({ saved: false, output: 'unexpected assignment' })), browse = vi.fn(), back = vi.fn();
    const current = { connectionId: 'ready', provider: 'openai' as const, model: 'shared', thinkingEffort: 'high' as const };
    const canReturn = () => { if (ending === 'close') host.close(); else host.open(modelPicker(commands())); return true; };
    const picker = surface === 'role' ? modelRolePicker('advisor', current, assign, browse, back, undefined, () => 'expired', canReturn)
      : modelRoleThinkingPicker(current, [null, 'low', 'high'], assign, back, () => 'expired', canReturn);
    host.open(picker); await settle();
    let pending!: ReturnType<typeof picker.apply>;
    try {
      if (surface === 'thinking') { host.handleKey(parseKeyEvent('\x1b[A'), vi.fn()); host.handleKey(parseKeyEvent('\x1b[A'), vi.fn()); }
      host.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids, host.acceptanceFor(selected)); });
      expect(await pending).toBeUndefined(); expect(assign).not.toHaveBeenCalled(); expect(browse).not.toHaveBeenCalled(); expect(back).not.toHaveBeenCalled();
      expect(await picker.apply([surface === 'role' ? 'choose' : 'low'])).toBeUndefined(); expect(await picker.load()).toEqual([]);
    } finally { host.close(); }
  });

it.each((['role', 'thinking'] as const).flatMap(surface =>
  (['refuse', 'abort', 'throw'] as const).map(ending => ({ surface, ending }))))(
  'retires a refused $surface without returning when the original browser will $ending', async ({ surface, ending }) => {
    const controller = new AbortController(); let armed = false, reads = 0;
    const context = { ...commands(), signal: controller.signal, admission: () => {
      if (!armed) return undefined;
      if (++reads === 1) return 'The old choice expired.';
      if (ending === 'abort') { controller.abort(); return undefined; }
      if (ending === 'throw') throw new Error('private owner diagnostic');
      return 'Workspace changed.';
    } };
    const picker = modelPicker(context); await picker.load();
    const role = (await picker.inspect!('role:advisor'))!.next!; await role.load();
    const action = surface === 'role' ? role : (await role.apply(['thinking']))!.next!; await action.load();
    const before = readSessionModelEdit(sessionId); armed = true;
    const result = await action.apply([surface === 'role' ? 'default' : 'low']);
    expect(result?.note).toContain('expired'); expect(result?.next).toBeUndefined(); expect(reads).toBe(2);
    expect(await action.apply([surface === 'role' ? 'default' : 'low'])).toBeUndefined(); expect(await action.load()).toEqual([]);
    expect(readSessionModelEdit(sessionId)).toEqual(before);
  });

it.each(['choose', 'back', 'effort'] as const)('retires an accepted %s action that starts after its host closes', async action => {
  const host = new OverlayHost(() => {}), assign = vi.fn(), browse = vi.fn(), back = vi.fn(), admission = vi.fn(), canReturn = vi.fn();
  const current = { connectionId: 'ready', provider: 'openai' as const, model: 'shared', thinkingEffort: 'high' as const };
  const picker = action === 'effort' ? modelRoleThinkingPicker(current, [null, 'low', 'high'], assign, back, admission, canReturn)
    : modelRolePicker('advisor', current, assign, browse, back, undefined, admission, canReturn);
  host.open(picker); await settle();
  let accepted!: () => ReturnType<typeof picker.apply>;
  try {
    if (action === 'back') { host.handleKey(parseKeyEvent('\x1b[B'), vi.fn()); host.handleKey(parseKeyEvent('\x1b[B'), vi.fn()); }
    host.handleKey(parseKeyEvent('\r'), (selected, ids) => { const owns = host.acceptanceFor(selected); accepted = () => selected.apply(ids, owns); });
    host.close(); expect(await accepted()).toBeUndefined(); expect(await picker.load()).toEqual([]);
    expect(await picker.apply([action === 'effort' ? 'low' : action])).toBeUndefined();
    expect(assign).not.toHaveBeenCalled(); expect(browse).not.toHaveBeenCalled(); expect(back).not.toHaveBeenCalled();
    expect(admission).not.toHaveBeenCalled(); expect(canReturn).not.toHaveBeenCalled();
  } finally { host.close(); }
});

it.each((['role', 'thinking'] as const).flatMap(surface =>
  (['absent', 'throw'] as const).map(guard => ({ surface, guard }))))(
  'keeps a refused $surface retired without a verified return ($guard guard)', async ({ surface, guard }) => {
    const assign = vi.fn(), browse = vi.fn(), back = vi.fn();
    const current = { connectionId: 'ready', provider: 'openai' as const, model: 'shared', thinkingEffort: 'high' as const };
    const canReturn = guard === 'throw' ? () => { throw new Error('private return diagnostic'); } : undefined;
    const picker = surface === 'role' ? modelRolePicker('advisor', current, assign, browse, back, undefined, () => 'expired', canReturn)
      : modelRoleThinkingPicker(current, [null, 'low', 'high'], assign, back, () => 'expired', canReturn);
    await picker.load();
    expect(await picker.apply([surface === 'role' ? 'choose' : 'low'])).toEqual({ note: 'expired' });
    expect(await picker.load()).toEqual([]); expect(await picker.apply([surface === 'role' ? 'choose' : 'low'])).toBeUndefined();
    expect(assign).not.toHaveBeenCalled(); expect(browse).not.toHaveBeenCalled(); expect(back).not.toHaveBeenCalled();
  });

it('saves a role through actual Enter once and returns with its outcome while old callbacks stay retired', async () => {
  const picker = modelPicker(commands()); await picker.load(); const role = (await picker.inspect!('role:advisor'))!.next!;
  const host = new OverlayHost(() => {}); host.open(role); await settle();
  let result: Awaited<ReturnType<typeof role.apply>>;
  try {
    host.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
    host.handleKey(parseKeyEvent('\r'), (selected, ids) => { void selected.apply(ids).then(outcome => {
      result = outcome; if (outcome?.next) host.open(outcome.next);
    }); }); await settle();
    expect(result!.note).toContain('advisor follows the default');
    expect(host.render(120, 30).map(stripAnsi).join('\n')).toContain('▸ Advisor');
    const after = readSessionModelEdit(sessionId); expect(after.selection?.roles?.advisor).toBeUndefined();
    expect(after.selection?.roles?.summary?.thinkingEffort).toBe('low');
    expect(after.selection?.thinkingEffort).toBe('high');
    expect(await role.apply(['default'])).toBeUndefined(); expect(readSessionModelEdit(sessionId)).toEqual(after);
  } finally { host.close(); }
});

it('returns through the tracked role thinking Escape chain with a live parent controller and then permits an explicit role save', async () => {
  const lifetimes = new PickerLifecycles(), controller = lifetimes.begin();
  const context = { ...commands(), signal: controller.signal };
  const picker = modelPicker(context); await picker.load(); const role = (await picker.inspect!('role:advisor'))!.next!; await role.load();
  const thinking = (await role.apply(['thinking']))!.next!;
  const host = new OverlayHost(() => {}); host.open(lifetimes.track(thinking, controller, false)); await settle();
  let applied: Promise<unknown> | undefined;
  try {
    host.handleKey(parseKeyEvent('\x1b'), vi.fn()); await settle();
    expect(controller.signal.aborted).toBe(false);
    expect(host.render(120, 30).map(stripAnsi).join('\n')).toContain('▸ Choose model');
    expect(await thinking.apply(['low'])).toBeUndefined();
    host.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
    host.handleKey(parseKeyEvent('\r'), (selected, ids) => {
      applied = selected.apply(ids).then(outcome => {
        const owner = lifetimes.controllerFor(selected);
        if (outcome?.next && owner) host.open(lifetimes.track(outcome.next, owner, false));
        lifetimes.finish(selected, outcome?.next ? owner : undefined);
      });
    }); await applied; await settle();
    expect(readSessionModelEdit(sessionId).selection?.roles?.advisor).toBeUndefined();
    expect(controller.signal.aborted).toBe(false);
  } finally { host.close(); lifetimes.abortAll(); }
  expect(controller.signal.aborted).toBe(true);
});

it.each(['role', 'thinking'] as const)('does not execute a %s action when its admission callback closes the actual host', async surface => {
  const host = new OverlayHost(() => {}), assign = vi.fn(), browse = vi.fn(), back = vi.fn();
  const current = { connectionId: 'ready', provider: 'openai' as const, model: 'shared', thinkingEffort: 'high' as const };
  const admission = () => { host.close(); return undefined; };
  const picker = surface === 'role' ? modelRolePicker('advisor', current, assign, browse, back, undefined, admission)
    : modelRoleThinkingPicker(current, [null, 'low', 'high'], assign, back, admission);
  host.open(picker); await settle();
  expect(await picker.apply([surface === 'role' ? 'choose' : 'low'])).toBeUndefined();
  expect(assign).not.toHaveBeenCalled(); expect(browse).not.toHaveBeenCalled(); expect(back).not.toHaveBeenCalled();
  expect(await picker.load()).toEqual([]); expect(host.active).toBe(false);
});

it('refuses a cancelled role transaction at the original writer even if its picker is still open', async () => {
  const controller = new AbortController();
  const edit = prepareModelRole({ ...commands(), signal: controller.signal }, 'advisor');
  const before = readSessionModelEdit(sessionId); controller.abort();
  expect(edit.assign(undefined)).toMatchObject({ saved: false, output: expect.stringContaining('cancelled') });
  expect(edit.setEffort('low')).toMatchObject({ saved: false, output: expect.stringContaining('cancelled') });
  expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it('rechecks role cancellation after an admission callback aborts without returning a refusal', async () => {
  const controller = new AbortController(); let abortOnAdmission = false;
  const edit = prepareModelRole({ ...commands(), signal: controller.signal, admission: () => {
    if (abortOnAdmission) controller.abort(); return undefined;
  } }, 'advisor');
  const before = readSessionModelEdit(sessionId); abortOnAdmission = true;
  expect(edit.assign(undefined)).toMatchObject({ saved: false, output: expect.stringContaining('cancelled') });
  expect(readSessionModelEdit(sessionId)).toEqual(before);
});

it.each(['subagent', 'summary', 'advisor'] as const)('keeps an unavailable saved %s effort as read-only focus until an explicit supported choice', async name => {
  const before = readSessionModelEdit(sessionId);
  writeSessionModel(sessionId, { ...before.selection!, roles: { ...before.selection!.roles,
    [name]: { connectionId: 'ready', provider: 'openai', model: 'shared', thinkingEffort: 'high' } } }, before);
  writeCatalogCache([{ id: 'relay', runtime: 'openai', baseUrl: 'https://relay.invalid/v1',
    models: [{ id: 'shared', reasoning: true, thinkingLevelMap: { high: null } }] }]);
  const catalogue = modelPicker(commands()); await catalogue.load();
  const role = (await catalogue.inspect!(`role:${name}`))!.next!; await role.load();
  const thinking = (await role.apply(['thinking']))!.next!, host = new OverlayHost(() => {});
  const rows = await thinking.load();
  const saved = readSessionModelEdit(sessionId), config = fs.readFileSync(getUserRuntimeConfigPath());
  host.open(thinking); await settle();
  try {
    const untouched = vi.fn(); host.handleKey(parseKeyEvent('\r'), untouched);
    expect(untouched).not.toHaveBeenCalled(); expect(host.active).toBe(true);
    expect(rows.find(row => row.id === 'high')).toMatchObject({ disabled: true, focusable: true, note: expect.stringContaining('active') });
    expect(stripAnsi(host.render(100, 20).join('\n'))).toContain('▸ high');
    expect(await thinking.apply(['high'])).toBeUndefined(); expect(readSessionModelEdit(sessionId)).toEqual(saved);
    host.handleKey(parseKeyEvent('\x1b[A'), vi.fn()); host.handleKey(parseKeyEvent('\x1b[A'), vi.fn());
    let action: Promise<unknown> | undefined;
    host.handleKey(parseKeyEvent('\r'), (selected, ids) => {
      expect(ids).toEqual(['low']); action = selected.apply(ids).then(outcome => { if (outcome?.next) host.open(outcome.next); });
    }); await action; await settle();
    expect(readSessionModelEdit(sessionId).selection).toEqual({ ...saved.selection!, roles: { ...saved.selection!.roles,
      [name]: { ...saved.selection!.roles![name]!, thinkingEffort: 'low' } } });
    expect(host.render(100, 20).map(stripAnsi).join('\n')).toContain('Reasoning effort: low');
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(config);
  } finally { host.close(); }
});
