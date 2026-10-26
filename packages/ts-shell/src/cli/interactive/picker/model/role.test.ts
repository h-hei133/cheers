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

it.each(['choose', 'thinking', 'default'])('refuses a role %s action captured before catalogue replacement without constructing a child or saving', async action => {
  const browser = vi.fn(() => modelPicker(commands()));
  const role = modelRoleEditor(commands(), 'advisor', browser, () => modelPicker(commands())); await role.load();
  const before = readSessionModelEdit(sessionId);
  writeCatalogCache([{ id: 'relay', runtime: 'openai', baseUrl: 'https://relay.invalid/v1', models: [{ id: 'shared', reasoning: false }] }]);
  const result = await role.apply([action]);
  expect(result?.note).toContain('expired'); expect(result?.next).toBeUndefined();
  expect(browser).not.toHaveBeenCalled(); expect(readSessionModelEdit(sessionId)).toEqual(before);
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
