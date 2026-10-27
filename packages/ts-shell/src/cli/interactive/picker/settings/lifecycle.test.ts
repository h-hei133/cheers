import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getProjectConfigPath, getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt,
  writeUserRuntimeConfigFile } from '../../../../config/runtimeConfig.js';
import { createShellRuntimeContext } from '../../../../core/shell/runtimeContext.js';
import { SessionManager } from '../../../../session/SessionManager.js';
import { readSessionModelEdit } from '../../../../session/model/state.js';
import { CONFIG_SETTINGS } from '../../../../config/settings.js';
import { openSettings } from '../../settings.js';
import { OverlayHost } from '../../overlay.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { settingsPicker } from '../settings.js';
import { themePreferences } from '../../../../presentation/theme/preview.js';
import { currentTheme } from '../../../../presentation/theme/theme.js';
import { selectTheme, isThemePreviewActive } from '../../../../presentation/theme/selection.js';

let root: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/settings-lifecycle-');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
  writeUserRuntimeConfigFile({ attentionOnIdle: false, topP: 0.7 }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it.each((['user', 'project'] as const).flatMap(scope =>
  (['close', 'replace', 'keep'] as const).map(ending => ({ scope, ending }))))(
  'preserves the confirmed $scope settings save when application will $ending its accepted host', async ({ scope, ending }) => {
    const session = new SessionManager().createNew(root), context = createShellRuntimeContext({
      cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct', targetPathBase: root, gitRoot: null,
      gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root), session,
    });
    const overlay = new OverlayHost(() => {}), replacement = { title: 'Replacement', empty: 'Replacement remains current',
      load: async () => [], apply: async () => undefined };
    const applied = vi.fn(() => { if (ending === 'close') overlay.close(); else if (ending === 'replace') overlay.open(replacement); });
    const host = { openSettings: (selected = scope) => openSettings(context, applied, selected) };
    const catalogue = settingsPicker(host, scope); await catalogue.load();
    const detail = (await catalogue.apply(['attentionOnIdle']))!.next!;
    const choice = CONFIG_SETTINGS.find(setting => setting.key === 'attentionOnIdle')!.choices!.findIndex(value => value === true);
    const staged = (await detail.apply([`choice:${choice}`]))!.next!;
    const original = JSON.stringify(readSessionModelEdit(session.id)), untouched = fs.readFileSync(getUserRuntimeConfigPath());
    overlay.open(staged); await new Promise(resolve => setTimeout(resolve, 0));
    let pending!: ReturnType<typeof staged.apply>;
    try {
      overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids, overlay.acceptanceFor(selected)); });
      const result = await pending;
      expect(applied).toHaveBeenCalledOnce(); expect(result?.note).toContain(`Saved to your ${scope} configuration.`);
      if (ending === 'keep') expect(result?.next?.title).toContain(`Settings — ${scope} configuration`);
      expect(overlay.active).toBe(ending === 'replace');
      const file = scope === 'user' ? getUserRuntimeConfigPath() : getProjectConfigPath(root);
      expect(readRuntimeConfigEditAt(file).values).toMatchObject({ attentionOnIdle: true });
      expect(context.runtimeConfig.attentionOnIdle).toBe(scope === 'user'); expect(context.runtimeConfig.topP).toBe(0.7);
      if (scope === 'project') expect(result?.note).toContain('effective value differs');
      if (scope === 'project') expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(untouched);
      expect(JSON.stringify(readSessionModelEdit(session.id))).toBe(original);
      if (ending !== 'keep') expect(result?.next).toBeUndefined();
      await staged.load(); expect(await staged.apply(['apply'])).toBeUndefined();
    } finally { overlay.close(); }
  });

it.each(['close', 'replace'] as const)('retires a delayed accepted settings Apply after %s before invoking the writer', async ending => {
  const session = new SessionManager().createNew(root), context = createShellRuntimeContext({
    cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct', targetPathBase: root, gitRoot: null,
    gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root), session,
  });
  const applied = vi.fn(), catalogue = settingsPicker({ openSettings: scope => openSettings(context, applied, scope) });
  await catalogue.load(); const detail = (await catalogue.apply(['attentionOnIdle']))!.next!;
  const staged = (await detail.apply(['choice:0']))!.next!, overlay = new OverlayHost(() => {});
  const before = fs.readFileSync(getUserRuntimeConfigPath()), accepted = context.configuration.current;
  overlay.open(staged); await new Promise(resolve => setTimeout(resolve, 0));
  let apply!: () => ReturnType<typeof staged.apply>;
  overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => {
    const owns = overlay.acceptanceFor(selected); apply = () => selected.apply(ids, owns);
  });
  if (ending === 'close') overlay.close();
  else overlay.open({ title: 'Replacement', empty: '', load: async () => [], apply: async () => undefined });
  try {
    expect(await apply()).toBeUndefined(); await staged.load();
    expect(await staged.apply(['apply'])).toBeUndefined(); expect(applied).not.toHaveBeenCalled();
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(context.configuration.current).toBe(accepted);
    expect(overlay.active).toBe(ending === 'replace');
  } finally { overlay.close(); }
});

it('consumes settings Apply while the original confirmed save is still settling', async () => {
  const session = new SessionManager().createNew(root), context = createShellRuntimeContext({
    cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct', targetPathBase: root, gitRoot: null,
    gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root), session,
  });
  const applied = vi.fn(), original = openSettings(context, applied);
  let release!: () => void; const settling = new Promise<void>(resolve => { release = resolve; });
  const save = vi.fn(async (key: string, value: unknown) => {
    const result = await original.save(key, value); await settling; return result;
  });
  const catalogue = settingsPicker({ openSettings: () => ({ ...original, save }) }); await catalogue.load();
  const detail = (await catalogue.apply(['attentionOnIdle']))!.next!, staged = (await detail.apply(['choice:0']))!.next!;
  const pending = staged.apply(['apply']);
  const duplicate = staged.apply(['apply']);
  try {
    expect(save).toHaveBeenCalledOnce();
    expect(applied).toHaveBeenCalledOnce(); expect(context.runtimeConfig.attentionOnIdle).toBe(true);
  } finally { release(); }
  expect(await duplicate).toBeUndefined();
  const result = await pending;
  expect(result?.note).toContain('Saved to your user configuration.'); expect(result?.next).toBeDefined();
  await staged.load(); expect(await staged.apply(['apply'])).toBeUndefined();
});

it.each(['close', 'replace'] as const)('ends the original theme preview when a delayed settings action starts after %s', async ending => {
  selectTheme('dark', root);
  const session = new SessionManager().createNew(root), context = createShellRuntimeContext({
    cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct', targetPathBase: root, gitRoot: null,
    gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root), session,
  });
  const themes = themePreferences({ workspaceRoot: root, follower: { stop: vi.fn(), refresh: vi.fn() }, redraw: vi.fn() });
  const applied = vi.fn(), catalogue = settingsPicker({ themes, openSettings: scope => openSettings(context, applied, scope) });
  await catalogue.load(); const detail = (await catalogue.apply(['theme']))!.next!;
  const staged = (await detail.apply([`choice:${themes.names().indexOf('light')}`]))!.next!, overlay = new OverlayHost(() => {});
  const before = fs.readFileSync(getUserRuntimeConfigPath()), accepted = context.configuration.current;
  overlay.open(staged); await new Promise(resolve => setTimeout(resolve, 0));
  expect(currentTheme()).toBe('light'); expect(isThemePreviewActive()).toBe(true);
  let apply!: () => ReturnType<typeof staged.apply>;
  overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => {
    const owns = overlay.acceptanceFor(selected); apply = () => selected.apply(ids, owns);
  });
  if (ending === 'close') overlay.close();
  else overlay.open({ title: 'Replacement', empty: '', load: async () => [], apply: async () => undefined });
  try {
    expect(await apply()).toBeUndefined(); expect(currentTheme()).toBe('dark'); expect(isThemePreviewActive()).toBe(false);
    expect(applied).not.toHaveBeenCalled(); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before);
    expect(context.configuration.current).toBe(accepted); expect(overlay.active).toBe(ending === 'replace');
  } finally { staged.previewEnd?.(); overlay.close(); selectTheme('dark'); }
});

it.each(['close', 'replace', 'keep'] as const)('retains a refused settings save notice when its completion will %s the host', async ending => {
  const session = new SessionManager().createNew(root), context = createShellRuntimeContext({
    cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct', targetPathBase: root, gitRoot: null,
    gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root), session,
  });
  const overlay = new OverlayHost(() => {}), applied = vi.fn();
  const catalogue = settingsPicker({ openSettings: scope => {
    const draft = openSettings(context, applied, scope);
    return { ...draft, async save(key, value) {
      const result = await draft.save(key, value);
      if (ending === 'close') overlay.close();
      else if (ending === 'replace') overlay.open({ title: 'Replacement', empty: '', load: async () => [], apply: async () => undefined });
      return result;
    } };
  } });
  await catalogue.load(); const detail = (await catalogue.apply(['attentionOnIdle']))!.next!;
  const staged = (await detail.apply(['choice:0']))!.next!;
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, attentionOnIdle: undefined }, edit);
  const changed = fs.readFileSync(getUserRuntimeConfigPath()), accepted = context.configuration.current;
  overlay.open(staged); await new Promise(resolve => setTimeout(resolve, 0));
  let pending!: ReturnType<typeof staged.apply>;
  try {
    overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids, overlay.acceptanceFor(selected)); });
    const result = await pending;
    expect(result?.note).toContain('conflict'); expect(applied).not.toHaveBeenCalled();
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(changed); expect(context.configuration.current).toBe(accepted);
    if (ending === 'keep') expect(result?.next?.title).toContain('Apply not confirmed');
    else expect(result?.next).toBeUndefined();
    await staged.load(); expect(await staged.apply(['apply'])).toBeUndefined();
    expect(overlay.active).toBe(ending === 'replace');
  } finally { overlay.close(); }
});

it.each((['close', 'replace'] as const).flatMap(ending =>
  (['return', 'missing', 'throw'] as const).map(reopened => ({ ending, reopened }))))(
  'does not retry a settings writer after reopen will $ending the host and $reopened', async ({ ending, reopened }) => {
    const session = new SessionManager().createNew(root), context = createShellRuntimeContext({
      cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct', targetPathBase: root, gitRoot: null,
      gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root), session,
    });
    const overlay = new OverlayHost(() => {}), original = openSettings(context, vi.fn());
    const save = vi.fn(async () => ({ note: 'Retry required.', applied: false }));
    const draft = { ...original, save, reopen() {
      if (ending === 'close') overlay.close();
      else overlay.open({ title: 'Replacement', empty: '', load: async () => [], apply: async () => undefined });
      if (reopened === 'throw') throw new Error('unreadable');
      return reopened === 'return' ? { ...original, save } : undefined;
    } };
    const catalogue = settingsPicker({ openSettings: () => draft }); await catalogue.load();
    const detail = (await catalogue.apply(['attentionOnIdle']))!.next!, staged = (await detail.apply(['choice:0']))!.next!;
    const retry = (await staged.apply(['apply']))!.next!;
    const before = fs.readFileSync(getUserRuntimeConfigPath()), accepted = context.configuration.current;
    overlay.open(retry); await new Promise(resolve => setTimeout(resolve, 0));
    let pending!: ReturnType<typeof retry.apply>;
    try {
      overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids, overlay.acceptanceFor(selected)); });
      const result = await pending;
      expect(result?.next).toBeUndefined(); expect(save).toHaveBeenCalledOnce();
      await retry.load(); expect(await retry.apply(['apply'])).toBeUndefined();
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(context.configuration.current).toBe(accepted);
      expect(overlay.active).toBe(ending === 'replace');
    } finally { overlay.close(); }
  });
