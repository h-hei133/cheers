import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager, type Session } from '../../../../session/SessionManager.js';
import { getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile, getRuntimeConfig } from '../../../../config/runtimeConfig.js';
import { writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../../session/model/state.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig } from '../../../../core/shell/runtimeContext.js';
import { configurationAdmission } from '../../../../core/shell/configuration.js';
import { resolveProviderCredential } from '../../../../core/shell/providerCredentials.js';
import { openSettings } from '../../settings.js';
import { pickerFor, type PickerHost } from '../registry.js';
import { OverlayHost, type Picker } from '../../overlay.js';
import { PickerLifecycles } from '../lifecycle.js';
import * as modelState from '../../../../session/model/state.js';
import { SessionModelWriteError } from '../../../../session/model/outcome.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';
import type { CommandContext } from '../../../../core/commands/types.js';
import type { ModelSignIn } from '../model/auth.js';

let home: string, root: string, session: Session, sessionId: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); home = fs.mkdtempSync('/tmp/cheers-test/settings-session-');
  root = path.join(home, 'project'); fs.mkdirSync(root);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('OPENAI_API_KEY', '');
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'fixture', providerConnections: [{
    id: 'fixture', provider: 'openai', authType: 'api-key', apiKey: 'synthetic-fixture', model: 'shared',
    baseUrl: 'https://fixture.invalid/v1', status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache([{ id: 'openai', models: [{ id: 'shared', reasoning: true }, { id: 'other', reasoning: true }] }]);
  session = new SessionManager().createNew(root); sessionId = session.id;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

function host(signIn?: ModelSignIn, signal?: AbortSignal) {
  const runtime = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct', targetPathBase: root,
    gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root),
    session, resolveConfigTarget: config => resolveProviderCredential({ runtimeConfig: config, env: {} }) });
  const commandContext: CommandContext = { cwd: root, projectRoot: root, sessionId, runtimeConfig: runtime.runtimeConfig, signal,
    admission: configurationAdmission(runtime), readConfiguration: () => runtime.configuration.current,
    refreshRuntimeConfig: () => refreshShellRuntimeConfig(runtime), resolveConfigTarget: runtime.resolveConfigTarget };
  return { commandContext, openSettings: (scope?: 'user' | 'project') => openSettings(runtime, () => {}, scope),
    modelSignIn: signIn, runtime } as PickerHost & { runtime: typeof runtime };
}
const frame = (overlay: OverlayHost, width = 120) => stripAnsi(overlay.render(width, 32).join('\n'));
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

it.each([['settings:model', 'user'], ['settings:thinking', 'user'], ['settings:model', 'project'], ['settings:thinking', 'project']] as const)('opens %s in %s scope from settings search and cancels to the original entry without writing', async (id, scope) => {
  const global = fs.readFileSync(getUserRuntimeConfigPath()); const signIn = vi.fn(); const overlay = new OverlayHost(() => {});
  let rootPicker = pickerFor('/settings', host(signIn))!; await rootPicker.load();
  if (scope === 'project') {
    const field = (await rootPicker.apply(['maxTurns']))!.next!; await field.load();
    const scopes = (await field.apply(['scope']))!.next!; await scopes.load();
    const projectField = (await scopes.apply(['project']))!.next!; await projectField.load();
    rootPicker = projectField.back!();
  }
  overlay.open(rootPicker); await settle();
  overlay.handlePaste(id === 'settings:model' ? 'Models and roles' : 'reasoning');
  expect(frame(overlay)).toContain(id === 'settings:model' ? 'Models and roles' : 'Thinking effort');
  expect(frame(overlay)).toContain('current session');
  let pending: Promise<unknown> | undefined;
  overlay.handleKey(parseKeyEvent('\r'), (picker, ids) => { pending = picker.apply(ids).then(outcome => {
    if (outcome?.next) overlay.open(outcome.next);
  }); });
  await pending; await settle();
  expect(frame(overlay)).toContain(id === 'settings:model' ? 'Model' : 'Thinking effort');
  overlay.handleKey(parseKeyEvent('\x1b'), vi.fn()); await settle();
  expect(frame(overlay, 40)).toContain(id === 'settings:model' ? '▸ Models and roles' : '▸ Thinking effort');
  expect(frame(overlay)).toContain('Settings'); expect(readSessionModel(sessionId)).toBeUndefined();
  expect(frame(overlay)).toContain(`${scope} configuration`);
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global); expect(signIn).not.toHaveBeenCalled(); overlay.close();
});

it.each(['settings:model', 'settings:thinking'] as const)('saves %s through its original owner and returns with a visible outcome and unchanged global defaults', async id => {
  const global = fs.readFileSync(getUserRuntimeConfigPath()); const h = host(); const settings = pickerFor('/settings', h)!; await settings.load();
  const child = (await settings.apply([id]))!.next!; await child.load();
  const chosen = id === 'settings:model' ? `model:${JSON.stringify(['fixture', 'openai', 'other'])}` : 'low';
  const outcome = await child.apply([chosen]); expect(outcome?.next).toBeDefined();
  const selection = readSessionModel(sessionId)!;
  expect(selection.model).toBe(id === 'settings:model' ? 'other' : 'shared');
  if (id === 'settings:thinking') expect(selection.thinkingEffort).toBe('low');
  expect(h.runtime.resolveConfigTarget!(h.runtime.runtimeConfig).model).toBe(selection.model);
  const returned = outcome!.next!; await returned.load();
  const thinking = (await returned.apply(['settings:thinking']))!.next!;
  const levels = await thinking.load();
  expect(levels.find(level => level.note === 'active')?.id).toBe(id === 'settings:thinking' ? 'low' : 'auto');
  const overlay = new OverlayHost(() => {}); overlay.open(outcome!.next!); await settle();
  expect(frame(overlay)).toContain('Settings'); expect(frame(overlay)).toContain('Model switched');
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global); overlay.close();
});

it('assigns an advisor model through its owner and returns through the model catalogue to settings', async () => {
  const settings = pickerFor('/settings', host())!; await settings.load(); const models = (await settings.apply(['settings:model']))!.next!;
  await models.load(); const role = (await models.inspect!('role:advisor'))!.next!; await role.load();
  const browse = (await role.apply(['choose']))!.next!; await browse.load();
  const result = await browse.apply([`model:${JSON.stringify(['fixture', 'openai', 'other'])}`]);
  expect(readSessionModel(sessionId)?.roles?.advisor?.model).toBe('other');
  const returned = result!.next!; await returned.load(); const back = returned.back!(); await back.load();
  expect(back.initialSelection).toBe('settings:model'); expect(back.title).toContain('Settings');
  expect(back.footer).toContain('advisor uses');
});

it.each((['user', 'project'] as const).flatMap(scope =>
  (['role', 'thinking', 'assignment'] as const).flatMap(surface =>
    (surface === 'thinking' ? ['unchanged', 'unknown', 'unreadable'] as const : ['unchanged', 'unknown'] as const)
      .map(state => ({ scope, surface, state })))))(
  'returns a failed $surface write in $scope scope with $state evidence to a fresh usable owner', async ({ scope, surface, state }) => {
    writeSessionModel(sessionId, { connectionId: 'fixture', provider: 'openai', model: 'shared', thinkingEffort: 'high', roles: {
      advisor: { connectionId: 'fixture', provider: 'openai', model: 'shared', thinkingEffort: 'high' },
      summary: { connectionId: 'fixture', provider: 'openai', model: 'other', thinkingEffort: 'low' },
    } }, readSessionModelEdit(sessionId));
    const baseline = readSessionModel(sessionId)!, global = fs.readFileSync(getUserRuntimeConfigPath());
    const lifetimes = new PickerLifecycles(), controller = lifetimes.begin(), h = host(undefined, controller.signal);
    let settings = pickerFor('/settings', h)!; await settings.load();
    if (scope === 'project') {
      const field = (await settings.apply(['maxTurns']))!.next!; await field.load();
      const scopes = (await field.apply(['scope']))!.next!; await scopes.load();
      const projectField = (await scopes.apply(['project']))!.next!; await projectField.load();
      settings = projectField.back!(); await settings.load();
    }
    const models = (await settings.apply(['settings:model']))!.next!; await models.load();
    const role = (await models.inspect!('role:advisor'))!.next!; await role.load();
    const child = surface === 'role' ? role : (await role.apply([surface === 'assignment' ? 'choose' : 'thinking']))!.next!;
    const overlay = new OverlayHost(() => {});
    overlay.open(lifetimes.track(child, controller, false)); await settle();
    const original = modelState.writeSessionModel, statePath = readSessionModelEdit(sessionId).statePath;
    let persisted: Buffer | undefined;
    const writer = vi.spyOn(modelState, 'writeSessionModel').mockImplementationOnce((...args) => {
      if (state !== 'unchanged') original(...args);
      if (state === 'unreadable') {
        persisted = fs.readFileSync(statePath); fs.writeFileSync(statePath, '{unreadable');
      }
      throw new SessionModelWriteError(state === 'unchanged' ? 'write-failed' : 'verification-failed', state === 'unchanged' ? state : 'unknown');
    });
    let pending: Promise<unknown> | undefined, outcome: Awaited<ReturnType<Picker['apply']>>;
    const apply = (picker: Picker, ids: readonly string[]) => {
      pending = picker.apply(ids).then(result => {
        outcome = result;
        const owner = lifetimes.controllerFor(picker);
        if (result?.next && owner) overlay.open(lifetimes.track(result.next, owner, false));
        lifetimes.finish(picker, result?.next ? owner : undefined);
      });
    };
    try {
      if (surface === 'assignment') overlay.handlePaste('other');
      else for (let count = 0; count < (surface === 'role' ? 1 : 2); count++) overlay.handleKey(parseKeyEvent(surface === 'role' ? '\x1b[B' : '\x1b[A'), apply);
      overlay.handleKey(parseKeyEvent('\r'), apply); await pending; await settle();
      const failure = state === 'unchanged' ? 'this attempt did not write' : 'unverified';
      expect(outcome?.note).toBe(new SessionModelWriteError(state === 'unchanged' ? 'write-failed' : 'verification-failed', state === 'unchanged' ? state : 'unknown').message);
      expect(writer).toHaveBeenCalledTimes(1);
      expect(outcome?.next).toBeDefined(); expect(overlay.active).toBe(true);
      expect(controller.signal.aborted).toBe(false); expect(frame(overlay)).toContain(failure);
      if (state === 'unreadable') {
        expect(frame(overlay)).toContain('▸ Advisor');
        const models = (await outcome!.next!.load()).filter(row => row.id.startsWith('model:'));
        expect(models.length).toBeGreaterThan(0); expect(models.every(row => row.disabled)).toBe(true);
        expect(fs.readFileSync(statePath, 'utf8')).toBe('{unreadable');
        fs.writeFileSync(statePath, persisted!);
      }
      const after = readSessionModel(sessionId)!;
      expect(after).toEqual(state === 'unchanged' ? baseline : { ...baseline, roles: surface === 'role'
        ? { summary: baseline.roles!.summary }
        : { ...baseline.roles, advisor: { ...baseline.roles!.advisor!, ...(surface === 'assignment' ? { model: 'other' } : { thinkingEffort: 'low' }) } } });
      if (surface !== 'assignment') {
        expect(await child.apply([surface === 'role' ? 'default' : 'low'])).toBeUndefined();
        expect(await child.load()).toEqual([]);
      }
      expect(writer).toHaveBeenCalledTimes(1);
      if (surface !== 'thinking' || state === 'unreadable') {
        expect(frame(overlay)).toContain('▸ Advisor');
        overlay.handleKey(parseKeyEvent('\r'), apply); await pending; await settle();
      } else expect(frame(overlay)).toContain(`Reasoning effort: ${state === 'unknown' ? 'low' : 'high'}`);
      expect(frame(overlay)).toContain('▸ Choose model');
      overlay.handleKey(parseKeyEvent('\x1b[B'), apply); overlay.handleKey(parseKeyEvent('\r'), apply);
      await pending; await settle();
      expect(writer).toHaveBeenCalledTimes(2); expect(outcome?.note).toContain('advisor follows the default');
      expect(readSessionModel(sessionId)).toEqual({ ...baseline, roles: { summary: baseline.roles!.summary } });
      expect(controller.signal.aborted).toBe(false);
      overlay.handleKey(parseKeyEvent('\x1b'), apply); await settle();
      expect(frame(overlay)).toContain(`${scope} configuration`);
      expect(frame(overlay)).toContain('▸ Models and roles');
      expect(frame(overlay)).toContain('advisor follows the default');
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
      expect(h.runtime.resolveConfigTarget!(h.runtime.runtimeConfig).model).toBe('shared');
    } finally { overlay.close(); lifetimes.abortAll(); }
  });

it('returns an expired thinking refusal to settings without changing the newer session choice', async () => {
  const settings = pickerFor('/settings', host())!; await settings.load(); const thinking = (await settings.apply(['settings:thinking']))!.next!;
  await thinking.load(); writeSessionModel(sessionId, { connectionId: 'fixture', provider: 'openai', model: 'other' }, readSessionModelEdit(sessionId));
  const before = readSessionModel(sessionId); const result = await thinking.apply(['low']);
  expect(result?.note).toContain('expired'); expect(readSessionModel(sessionId)).toEqual(before);
  expect(result?.next?.title).toContain('Settings');
  expect(result?.next?.footer).toContain('expired');
});

it.each(['cancel', 'save'] as const)('retains the settings parent after Default browsing and %s', async action => {
  const global = fs.readFileSync(getUserRuntimeConfigPath()); const settings = pickerFor('/settings', host())!; await settings.load();
  const models = (await settings.apply(['settings:model']))!.next!; await models.load();
  const defaultModels = (await models.inspect!('role:default'))!.next!; await defaultModels.load();
  let returned = defaultModels.back!();
  if (action === 'save') returned = (await defaultModels.apply([`model:${JSON.stringify(['fixture', 'openai', 'other'])}`]))!.next!;
  await returned.load(); expect(returned.initialSelection).toBe('role:default');
  expect(returned.back!().initialSelection).toBe('settings:model');
  expect(readSessionModel(sessionId)?.model).toBe(action === 'save' ? 'other' : undefined);
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
});

it.each(['details', 'configure', 'account'] as const)('cancels unconfigured model %s back through its exact model to settings', async step => {
  writeCatalogCache([{ id: 'openai', models: [{ id: 'shared', reasoning: true }] },
    { id: 'google', models: [{ id: 'missing' }] }]);
  const global = fs.readFileSync(getUserRuntimeConfigPath()); const signIn = vi.fn(); const settings = pickerFor('/settings', host(signIn))!;
  await settings.load(); const models = (await settings.apply(['settings:model']))!.next!;
  const missing = (await models.load()).find(row => row.label === 'missing')!;
  expect(missing.focusable).toBe(true); expect(missing.disabled).toBe(true);
  const details = (await models.inspect!(missing.id))!.next!; await details.load();
  let returned = details.back!();
  if (step !== 'details') {
    const child = (await details.apply([step]))!.next!; await child.load();
    const overlay = new OverlayHost(() => {}); overlay.open(child); await settle();
    overlay.handleKey(parseKeyEvent('\x1b'), vi.fn()); await settle();
    expect(frame(overlay)).toContain('▸ missing'); overlay.close();
    returned = child.back!();
  }
  await returned.load(); expect(returned.initialSelection).toBe(missing.id);
  expect(returned.back!().initialSelection).toBe('settings:model');
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
  expect(readSessionModel(sessionId)).toBeUndefined(); expect(signIn).not.toHaveBeenCalled();
});

it('returns a saved but unverified runtime application to settings without reporting a model switch', async () => {
  const h = host(); h.commandContext.refreshRuntimeConfig = () => { throw new Error('synthetic-application'); };
  const settings = pickerFor('/settings', h)!; await settings.load(); const models = (await settings.apply(['settings:model']))!.next!;
  await models.load(); const result = await models.apply([`model:${JSON.stringify(['fixture', 'openai', 'other'])}`]);
  expect(readSessionModel(sessionId)?.model).toBe('other');
  expect(result?.note).toContain('application outcome is unverified'); expect(result?.note).not.toContain('Model switched');
  expect(result?.next?.footer).toContain('application outcome is unverified');
  expect(h.runtime.resolveConfigTarget!(h.runtime.runtimeConfig).model).not.toBe('other');
});
