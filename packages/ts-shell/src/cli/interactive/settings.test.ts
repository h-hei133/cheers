import { projectTrust } from '../../core/security/trust/store.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getProjectConfigPath, getUserRuntimeConfigPath, type RuntimeConfigOverrides } from '../../config/runtimeConfig.js';
import * as configFiles from '../../config/runtimeConfig.js';
import { ConfigWriteError } from '../../config/outcome.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig, applyShellSubstrateTransition } from '../../core/shell/runtimeContext.js';
import { openSettings } from './settings.js';
import { ComposerPreference } from './tuiSettings.js';
import { settingsPicker } from './picker/settings.js';
import { OverlayHost, type Picker } from './overlay.js';
import { parseKeyEvent } from '../../presentation/tui/input/keys.js';
import { Editor } from '../../presentation/tui/editor.js';
import { layoutComposer } from '../../presentation/tui/composer/layout.js';
import { stripAnsi } from '../../presentation/tui/text/ansi.js';
import { OptionModel } from '../../presentation/tui/chrome/options.js';
import { themePreferences } from '../../presentation/theme/preview.js';
import { selectTheme, selectedTheme } from '../../presentation/theme/selection.js';
import { currentTheme } from '../../presentation/theme/theme.js';

let root: string;
let file: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-'));
  vi.stubEnv('HOME', path.join(root, 'home')); vi.stubEnv('USERPROFILE', path.join(root, 'home'));
  fs.mkdirSync(path.join(root, '.cheers'));
  file = getUserRuntimeConfigPath(); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{}');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

function runtime(overrides?: RuntimeConfigOverrides) {
  return createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct', targetPathBase: root, gitRoot: null,
    gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root, overrides), runtimeConfigOverrides: overrides,
    session: { id: 'settings-session', createdAt: 'now', updatedAt: 'now', status: 'active', turns: [] },
  });
}

it('stages and reads back list, object and choice values through the real settings owner without saving discarded edits', async () => {
  const context = runtime(), host = { openSettings: (scope?: 'user' | 'project') => openSettings(context, vi.fn(), scope) };
  for (const [key, raw, expected] of [
    ['disabledTools', 'fixture.a\nfixture.b', ['fixture.a', 'fixture.b']],
    ['modelTokenBudgets', '{"openai/fixture":{"reserveTokens":1000,"keepRecentTokens":2000}}',
      { 'openai/fixture': { reserveTokens: 1000, keepRecentTokens: 2000 } }],
  ] as const) {
    const before = fs.readFileSync(file);
    const catalogue = settingsPicker(host); await catalogue.load();
    const field = (await catalogue.apply([key]))!.next!, editor = (await field.apply(['edit']))!.next!;
    expect(editor.input!.validate(raw)).toBeUndefined();
    const pending = (await editor.input!.apply(raw))!.next!;
    await pending.apply(['discard']); expect(fs.readFileSync(file)).toEqual(before);
    const saved = await pending.apply(['apply']); expect(saved?.note).toContain('Saved');
    expect(configFiles.readUserRuntimeConfigFile()).toMatchObject({ [key]: expected });
    expect(openSettings(context, vi.fn()).values[key]).toMatchObject({ stored: expected, source: 'user' });
  }
  const catalogue = settingsPicker(host); await catalogue.load();
  const field = (await catalogue.apply(['toolDiscovery']))!.next!;
  const pending = (await field.apply(['choice:1']))!.next!;
  const selected = (await pending.load()).find(row => row.id === 'pending')!.label;
  expect((await pending.apply(['apply']))?.note).toContain('Saved');
  expect(selected).toContain(configFiles.readUserRuntimeConfigFile().toolDiscovery!);
});

it('ends the child theme preview before constructing the parent after Escape', async () => {
  selectTheme('dark', root);
  const context = runtime(), redraw = vi.fn();
  const themes = themePreferences({ workspaceRoot: root, redraw, follower: { stop: vi.fn(), refresh: vi.fn() } });
  const overlay = new OverlayHost(redraw);
  const host = { openSettings: () => openSettings(context, redraw), themes };
  try {
    const catalogue = settingsPicker(host); await catalogue.load();
    const field = (await catalogue.apply(['theme']))!.next!;
    const light = `choice:${themes.names().indexOf('light')}`;
    overlay.open(field); await Promise.resolve(); await Promise.resolve();
    field.previewChange!([light]); expect(currentTheme()).toBe('light'); expect(selectedTheme()).toBe('dark');
    overlay.handleKey(parseKeyEvent('\x1b'), vi.fn());
    await Promise.resolve(); await Promise.resolve();
    expect(currentTheme()).toBe('dark'); expect(selectedTheme()).toBe('dark');
    const selected = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), selected);
    expect(selected.mock.calls[0]?.[1]).toEqual(['theme']);
    expect(fs.readFileSync(file, 'utf8')).toBe('{}');
  } finally { overlay.close(); selectTheme('dark', root); }
});

it('retains a numeric draft after a real write conflict and requires a new Apply to overwrite the reloaded value', async () => {
  const context = runtime(), host = { openSettings: () => openSettings(context, vi.fn()) };
  const catalogue = settingsPicker(host); await catalogue.load();
  const field = (await catalogue.apply(['maxTurns']))!.next!, editor = (await field.apply(['edit']))!.next!;
  const pending = (await editor.input!.apply('42'))!.next!;
  fs.writeFileSync(file, '{"maxTurns":17}');
  const conflict = await pending.apply(['apply']);
  expect(conflict?.note).toContain('conflict'); expect(conflict?.next).toBeDefined();
  expect(configFiles.readUserRuntimeConfigFile().maxTurns).toBe(17);
  const retained = conflict!.next!;
  expect(retained.title).toContain('Apply not confirmed');
  expect((await retained.load()).find(row => row.id === 'pending')?.label).toBe('Pending: 42');
  expect((await retained.apply(['apply']))?.note).toContain('Saved');
  expect(configFiles.readUserRuntimeConfigFile().maxTurns).toBe(42);
});

it('loads the default, project, user and explicit launch notification preference through validation', () => {
  expect(getRuntimeConfig(root).attentionOnIdle).toBe(false);
  fs.writeFileSync(getProjectConfigPath(root), '{"attentionOnIdle":true}');
  expect(getRuntimeConfig(root).attentionOnIdle).toBe(true);
  fs.writeFileSync(file, '{"attentionOnIdle":false}');
  expect(getRuntimeConfig(root).attentionOnIdle).toBe(false);
  expect(getRuntimeConfig(root, { attentionOnIdle: true }).attentionOnIdle).toBe(true);
  fs.writeFileSync(file, '{"attentionOnIdle":"yes"}');
  expect(getRuntimeConfig(root).configValidation).toEqual({ valid: false, securityBlocked: false });
});

it('saves and publishes the chosen preference, retaining unrelated concurrent edits and JSONC trivia', async () => {
  fs.writeFileSync(file, '// user preferences\n{"offline":false,"maxTurns":12,}\n');
  const context = runtime(); const applied = vi.fn(); const draft = openSettings(context, applied);
  expect(draft.values.attentionOnIdle).toMatchObject({ effective: false, stored: undefined, source: 'default' });
  fs.writeFileSync(file, '// user preferences\n{"offline":false,"maxTurns":13,}\n');
  expect((await draft.save('attentionOnIdle', true)).note).toContain('Effective for the next operation');
  expect(context.runtimeConfig.attentionOnIdle).toBe(true);
  expect(context.runtimeConfig.maxTurns).toBe(13);
  expect(fs.readFileSync(file, 'utf8')).toContain('// user preferences');
  expect(openSettings(context, applied).values.attentionOnIdle).toMatchObject({ effective: true, stored: true, source: 'user' });
  expect(getRuntimeConfig(root).attentionOnIdle).toBe(true); expect(applied).toHaveBeenCalledOnce();
});

it('rejects a stale menu baseline instead of overwriting an intervening explicit choice', async () => {
  const context = runtime(); const applied = vi.fn(); const draft = openSettings(context, applied);
  fs.writeFileSync(file, '{"attentionOnIdle":false}');
  const before = fs.readFileSync(file);
  expect((await draft.save('attentionOnIdle', true)).note).toContain('conflict');
  expect(fs.readFileSync(file)).toEqual(before);
  expect(context.runtimeConfig.attentionOnIdle).toBe(false); expect(applied).not.toHaveBeenCalled();
});

it('reports saved but launch-overridden settings separately from the effective value', async () => {
  const context = runtime({ attentionOnIdle: false, offline: true });
  const notice = (await openSettings(context, vi.fn()).save('attentionOnIdle', true)).note;
  expect(notice).toContain('keeps its launch override');
  expect(context.runtimeConfig.attentionOnIdle).toBe(false);
  expect(openSettings(context, vi.fn()).values.attentionOnIdle.source).toBe('override');
  expect(getRuntimeConfig(root).attentionOnIdle).toBe(true);
});

it('does not claim a baseline-equal choice was saved when a concurrent writer changed it', async () => {
  fs.writeFileSync(file, '{"attentionOnIdle":false}');
  const context = runtime(); const applied = vi.fn(); const draft = openSettings(context, applied);
  fs.writeFileSync(file, '{"attentionOnIdle":true}');
  const notice = (await draft.save('attentionOnIdle', false)).note;
  expect(notice).toContain('selected value is not confirmed'); expect(notice).not.toContain('launch override');
  expect(notice).not.toContain('Saved to'); expect(applied).not.toHaveBeenCalled();
  expect(getRuntimeConfig(root).attentionOnIdle).toBe(true); expect(context.runtimeConfig.attentionOnIdle).toBe(false);
});

it.each([['0', true, false], ['1', false, true]] as const)('reports the actual offline policy with environment override %s', async (env, chosen, expected) => {
  vi.stubEnv('CHEERS_OFFLINE', env);
  const context = runtime(); const draft = openSettings(context, vi.fn());
  expect(draft.values.offline.effective).toBe(expected);
  expect(draft.values.offline.source).toBe('environment');
  const notice = (await draft.save('offline', chosen)).note;
  expect(notice).toContain('CHEERS_OFFLINE environment override'); expect(notice).not.toContain('Effective for');
  expect(getRuntimeConfig(root).offline).toBe(chosen);
  expect(openSettings(context, vi.fn()).values.offline.effective).toBe(expected);
});

it('reports unverifiable saved selection without applying or leaking read errors', async () => {
  const context = runtime(); const applied = vi.fn(); const draft = openSettings(context, applied);
  vi.spyOn(configFiles, 'readRuntimeConfigEditAt').mockImplementation(() => { throw new Error('private file detail'); });
  const notice = (await draft.save('attentionOnIdle', true)).note;
  expect(notice).toContain('could not be verified'); expect(notice).not.toContain('private file detail');
  expect(notice).not.toContain('Saved to'); expect(applied).not.toHaveBeenCalled();
});

it('keeps accepted settings after invalid reload and distinguishes persistence from rejected publication', async () => {
  const context = runtime(); const applied = vi.fn();
  fs.writeFileSync(file, '{"attentionOnIdle":true,"maxTurns":"bad"}');
  expect(refreshShellRuntimeConfig(context).status).toBe('rejected');
  expect(context.runtimeConfig.attentionOnIdle).toBe(false);
  fs.writeFileSync(file, '{"attentionOnIdle":true}');
  const draft = openSettings(context, applied);
  expect(draft.values.attentionOnIdle).toMatchObject({ effective: false, stored: true, source: 'default' });
  fs.writeFileSync(getProjectConfigPath(root), '{broken');
  const notice = (await draft.save('attentionOnIdle', true)).note;
  expect(notice).toContain('Saved to your user configuration'); expect(notice).toContain('not applied (rejected)');
  expect(context.runtimeConfig.attentionOnIdle).toBe(false); expect(context.configuration.current.admissionBlocked).toBe(true);
  expect(applied).not.toHaveBeenCalled();
});

it.each(['unchanged', 'unknown', 'persisted'] as const)('preserves the %s save outcome without publishing', async state => {
  const context = runtime(); const applied = vi.fn(); const draft = openSettings(context, applied);
  vi.spyOn(configFiles, 'writeRuntimeConfigFileAt').mockImplementation(() => { throw new ConfigWriteError('write-failed', state); });
  const result = (await draft.save('attentionOnIdle', true)).note;
  expect(result).toContain(state === 'unchanged' ? 'did not write' : state === 'unknown' ? 'unverified' : 'lock cleanup failed');
  expect(result).not.toContain('Effective'); expect(applied).not.toHaveBeenCalled();
});

it('invalidates a menu after a substrate transition and consumes an applied choice once', async () => {
  const context = runtime(); const draft = openSettings(context, vi.fn());
  applyShellSubstrateTransition(context, { cwd: root });
  expect((await draft.save('attentionOnIdle', true)).note).toContain('Reopen Settings');
  expect(fs.readFileSync(file, 'utf8')).toBe('{}');
  const current = openSettings(context, vi.fn());
  await current.save('attentionOnIdle', true);
  expect((await current.save('attentionOnIdle', false)).note).toContain('Reopen Settings');
  expect(getRuntimeConfig(root).attentionOnIdle).toBe(true);
});

it('rejects a project menu when a new directory document shadows its captured legacy source', async () => {
  const legacy = path.join(root, '.cheers.json'); fs.writeFileSync(legacy, '{"maxTurns":19}');
  const menu = openSettings(runtime(), () => {}, 'project');
  fs.writeFileSync(path.join(root, '.cheers', 'config.json'), '{"maxTurns":21}');
  expect(await menu.save('maxTurns', 22)).toMatchObject({ applied: false, note: expect.stringContaining('source changed') });
  expect(fs.readFileSync(legacy, 'utf8')).toBe('{"maxTurns":19}');
});

it('validates advanced numbers before writing and applies a valid request setting', async () => {
  const context = runtime(); const applied = vi.fn(); const draft = openSettings(context, applied);
  expect((await draft.save('maxTurns', 0)).note).toContain('Invalid value');
  expect(fs.readFileSync(file, 'utf8')).toBe('{}'); expect(applied).not.toHaveBeenCalled();
  expect((await draft.save('maxTurns', 25)).note).toContain('Effective for the next operation');
  expect(context.runtimeConfig.maxTurns).toBe(25); expect(applied).toHaveBeenCalledOnce();
});

it('keeps project targeting explicit and reports ordinary user precedence', async () => {
    projectTrust.setProjectTrust(root, 'session-only');
  fs.writeFileSync(file, '{"maxTurns":20}'); const context = runtime();
  const draft = openSettings(context, vi.fn(), 'project');
  expect((await draft.save('maxTurns', 10)).note).toContain('follows user policy');
  expect(JSON.parse(fs.readFileSync(getProjectConfigPath(root), 'utf8')).maxTurns).toBe(10);
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).maxTurns).toBe(20);
  expect(context.runtimeConfig.maxTurns).toBe(20);
});

it('shows renderer defaults and accepted display preferences while a restart is pending', async () => {
  const context = runtime(); const draft = openSettings(context, vi.fn(), 'project');
  expect(draft.values['tui.diagrams']).toMatchObject({ effective: 'streaming', requested: undefined, source: 'default', restartRequired: false });
  expect((await draft.save('tui.diagrams', 'off')).note).toContain('Restart required');
  expect(context.runtimeConfig.tui?.diagrams).toBeUndefined();
  expect(context.configuration.current.requested.tui?.diagrams).toBe('off');
  expect(openSettings(context, vi.fn(), 'project').values['tui.diagrams']).toMatchObject({ effective: 'streaming', requested: 'off', requestedSource: 'project', restartRequired: true });
});

it('saves one nested display leaf and retains concurrent sibling changes and comments', async () => {
  fs.writeFileSync(file, '// preferences\n{"tui":{"statusItems":["cost"]}}');
  const context = runtime(); const draft = openSettings(context, vi.fn());
  fs.writeFileSync(file, '// preferences\n{"tui":{"statusItems":["model"]}}');
  expect((await draft.save('tui.diagrams', 'off')).note).toContain('Saved to your user');
  expect(fs.readFileSync(file, 'utf8')).toContain('// preferences');
  expect(configFiles.readUserRuntimeConfigFile().tui).toEqual({ statusItems: ['model'], diagrams: 'off' });
});

it('removes only the selected stored field and exposes the remaining project value', async () => {
    projectTrust.setProjectTrust(root, 'session-only');
  fs.writeFileSync(file, '{"maxTurns":20,"offline":true}');
  fs.writeFileSync(getProjectConfigPath(root), '{"maxTurns":8}'); const context = runtime();
  expect((await openSettings(context, vi.fn()).save('maxTurns', undefined)).note).toContain('Saved to your user');
  expect(configFiles.readUserRuntimeConfigFile()).toEqual({ offline: true });
  expect(context.runtimeConfig.maxTurns).toBe(8);
  expect(openSettings(context, vi.fn()).values.maxTurns).toMatchObject({ effective: 8, source: 'project', stored: undefined });
});

it.each([{ key: 'maxTurns', value: 15 }, { key: 'theme', value: 'dark' }, { key: 'agentMode', value: 'build' }])('reports saved but inactive project $key even when the fallback value is equal', async ({ key, value }) => {
  const context = runtime();
  const notice = (await openSettings(context, vi.fn(), 'project').save(key, value)).note;
  expect(notice).toContain('Saved to your project configuration');
  expect(notice).toContain('The project value is not active');
  expect(notice).toContain('trust has not been established');
  expect(notice).not.toMatch(/Applied to|Effective for|Saved default mode/);
  expect(JSON.parse(fs.readFileSync(getProjectConfigPath(root), 'utf8'))[key]).toBe(value);
  expect(openSettings(context, vi.fn(), 'project').values[key].projectTrustNotice).toContain('trust has not been established');
  projectTrust.setProjectTrust(root, 'trusted');
  expect(refreshShellRuntimeConfig(context).status).toBe('applied');
  expect(context.runtimeConfig.configProvenance[key].sources).toEqual(['project']);
});

it.each(['providerConnections', 'providerCredentials', 'allowUntrustedHooks', 'unknown'])('excludes %s from generic editing', async key => {
  const context = runtime(); const draft = openSettings(context, vi.fn());
  expect(draft.definitions.some(item => item.key === key)).toBe(false);
  expect((await draft.save(key, true)).note).toContain('not editable'); expect(fs.readFileSync(file, 'utf8')).toBe('{}');
});

it('rejects unsupported status IDs without writing while preserving legacy loading compatibility', async () => {
  const context = runtime(); const draft = openSettings(context, vi.fn());
  expect((await draft.save('tui.statusItems', ['not-a-status-item'])).note).toContain('supported status');
  expect(fs.readFileSync(file, 'utf8')).toBe('{}');
  expect((await draft.save('tui.statusItems', ['cost'])).note).toContain('Saved');
  expect(configFiles.readUserRuntimeConfigFile().tui?.statusItems).toEqual(['cost']);
});

it('explains merged restrictions without falsely prescribing removal of a launch override', async () => {
  fs.writeFileSync(getProjectConfigPath(root), '{"allowedTools":["read"]}');
  const context = runtime({ allowedTools: ['read', 'write'] });
  const notice = (await openSettings(context, vi.fn()).save('allowedTools', ['read', 'write'])).note;
  expect(context.runtimeConfig.allowedTools).toEqual(['read']);
  expect(notice).toContain('project + user + override policy');
  expect(notice).not.toContain('restart without');
});


it('previews actual shapes without writing, restores on cancel, and publishes only Apply', async () => {
  const context = runtime(); const changed = vi.fn();
  const preference = new ComposerPreference(() => context.runtimeConfig, changed);
  const host = { openSettings: () => openSettings(context, changed), previewComposerShape: preference.propose };
  const editor = new Editor(); editor.setText('  中 draft  ');
  const render = () => layoutComposer(editor, { busy: false, shape: preference.read() }, 40, 8).rows.map(row => stripAnsi(row.rendered)).join('\n');
  const overlay = new OverlayHost(changed);
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  const open = async () => {
    const picker = settingsPicker(host); await picker.load();
    overlay.open((await picker.apply(['tui.composerShape']))!.next!); await settle();
  };
  const press = async (text: string) => {
    const work: Promise<unknown>[] = [];
    overlay.handleKey(parseKeyEvent(text), (picker: Picker, ids) => {
      work.push(picker.apply(ids).then(result => { if (result?.next) overlay.open(result.next); }));
    });
    await Promise.all(work); await settle();
  };
  await open(); expect(render()).toContain('❯');
  await press('\x1b[B'); expect(preference.read()).toBe('band'); expect(render()).toContain('╰─');
  expect(fs.readFileSync(file, 'utf8')).toBe('{}');
  await press('\x1b'); expect(preference.read()).toBe('default'); expect(render()).toContain('❯');
  await open(); await press('\x1b[B'); await press('\r');
  expect(preference.read()).toBe('band'); expect(fs.readFileSync(file, 'utf8')).toBe('{}');
  await press('\r');
  expect(preference.read()).toBe('band'); expect(context.runtimeConfig.tui?.composerShape).toBe('band');
  expect(getRuntimeConfig(root).tui?.composerShape).toBe('band');
  expect(editor.snapshot().text).toBe('  中 draft  ');
  expect(openSettings(context, changed).values['tui.composerShape']).toMatchObject({ effective: 'band', source: 'user', restartRequired: false });
  fs.writeFileSync(file, '{"tui":{"composerShape":"box"},"maxTurns":"bad"}');
  expect(refreshShellRuntimeConfig(context).status).toBe('rejected');
  expect(preference.read()).toBe('band');
});

it('revokes a composer preview after a real external configuration publication', async () => {
  const context = runtime(); const changed = vi.fn();
  const preference = new ComposerPreference(() => context.runtimeConfig, changed,
    () => context.configuration.current.revision);
  const host = {
    openSettings: () => openSettings(context, changed),
    previewComposerShape: preference.propose,
    configurationRevision: () => context.configuration.current.revision,
  };
  const rootPicker = settingsPicker(host); await rootPicker.load();
  const detail = (await rootPicker.apply(['tui.composerShape']))!.next!;
  detail.previewChange!(['choice:7']);
  expect(preference.read()).toBe('box');
  fs.writeFileSync(file, '{"tui":{"composerShape":"rail"}}');
  expect(refreshShellRuntimeConfig(context).status).toBe('applied');
  expect(preference.read()).toBe('rail');
  detail.previewChange!(['choice:0']);
  expect(preference.read()).toBe('rail');
  const result = await detail.apply(['choice:0']);
  expect(result?.note).toContain('Display preview is unavailable');
  expect(preference.read()).toBe('rail');
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).tui.composerShape).toBe('rail');
});

it('revokes a status preview after a real external configuration publication', async () => {
  const context = runtime();
  let previewed: readonly string[] | undefined;
  const host = {
    openSettings: () => openSettings(context, vi.fn()),
    previewStatusItems: (items: readonly string[] | undefined) => { previewed = items; },
    configurationRevision: () => context.configuration.current.revision,
  };
  const rootPicker = settingsPicker(host); await rootPicker.load();
  const detail = (await rootPicker.apply(['tui.statusItems']))!.next!;
  const editor = (await detail.apply(['edit']))!.next!;
  editor.previewChange!(['cost']);
  expect(previewed).toEqual(['cost']);
  fs.writeFileSync(file, '{"tui":{"statusItems":["model"]}}');
  expect(refreshShellRuntimeConfig(context).status).toBe('applied');
  editor.previewChange!(['cost']);
  expect(previewed).toBeUndefined();
});

it('keeps project shape precedence and exposes the user shape when the project choice is removed', async () => {
  projectTrust.setProjectTrust(root, 'session-only');
  fs.writeFileSync(file, '{"tui":{"composerShape":"band"}}');
  const context = runtime();
  expect((await openSettings(context, vi.fn(), 'project').save('tui.composerShape', 'box')).note).toContain('Applied to the running surface');
  expect(context.runtimeConfig.tui?.composerShape).toBe('box');
  expect((await openSettings(context, vi.fn(), 'project').save('tui.composerShape', undefined)).note).toContain('Applied to the running surface');
  expect(context.runtimeConfig.tui?.composerShape).toBe('band');
});


it('exposes applicable settings categories and sections and marks stored values', async () => {
  fs.writeFileSync(file, '{"offline":true}');
  const context = runtime();
  const host = { openSettings: () => openSettings(context, vi.fn()) };
  const all = settingsPicker(host);
  const allItems = await all.load();
  expect(all.chips?.items.map(item => item.id)).toEqual(['all', 'Appearance', 'Model', 'Interaction', 'Context', 'Files', 'Tools', 'Tasks', 'Providers']);
  expect(all.chips?.active).toBe('all');
  expect(allItems.find(item => item.id === 'offline')?.label.startsWith('● ')).toBe(true);
  const session = all.chips!.select('Interaction')!;
  const list = new OptionModel(session.filterOptions);
  list.setOptions(await session.load());
  const sessionItems = list.visible;
  expect(sessionItems.length).toBeGreaterThan(0);
  expect(sessionItems.filter(item => item.disabled).every(item => item.label.startsWith('Interaction /'))).toBe(true);
  expect(sessionItems.find(item => item.id === 'offline')?.label.startsWith('● ')).toBe(true);
  list.setFilter('maxTurns');
  expect(list.visible[0]?.id).toBe('maxTurns');
  list.setFilter('');
  expect(list.visible).toEqual(sessionItems);
});

it('restores the accepted shape after save failure and retains a retryable pending choice', async () => {
  const context = runtime(); const preference = new ComposerPreference(() => context.runtimeConfig, vi.fn());
  const host = { openSettings: () => openSettings(context, vi.fn()), previewComposerShape: preference.propose };
  const rootPicker = settingsPicker(host); await rootPicker.load();
  const detail = (await rootPicker.apply(['tui.composerShape']))!.next!;
  detail.previewChange!(['choice:7']); expect(preference.read()).toBe('box');
  const staged = (await detail.apply(['choice:7']))!.next!;
  const writer = vi.spyOn(configFiles, 'writeRuntimeConfigFileAt').mockImplementation(() => { throw new ConfigWriteError('write-failed', 'unchanged'); });
  const failed = await staged.apply(['apply']);
  expect(failed!.note).toContain('did not write');
  expect(failed!.next).toBeDefined(); expect(preference.read()).toBe('default');
  expect((await failed!.next!.load()).find(item => item.id === 'pending')?.label).toBe('Pending: "box"');
  failed!.next!.previewChange!(['apply']); expect(preference.read()).toBe('default');
  expect(fs.readFileSync(file, 'utf8')).toBe('{}');
  const reader = vi.spyOn(configFiles, 'readRuntimeConfigEditAt').mockImplementation(() => { throw new Error('private read detail'); });
  const unreadable = await failed!.next!.apply(['apply']);
  expect(unreadable!.note).toContain('could not be reopened');
  expect(unreadable!.note).not.toContain('private read detail');
  expect((await unreadable!.next!.load()).find(item => item.id === 'pending')?.label).toBe('Pending: "box"');
  expect(writer).toHaveBeenCalledOnce();
  reader.mockRestore(); writer.mockRestore();
  const retry = await unreadable!.next!.apply(['apply']);
  expect(retry!.next?.initialSelection).toBe('tui.composerShape'); expect(retry!.note).toContain('Applied to the running surface');
  expect(preference.read()).toBe('box'); expect(getRuntimeConfig(root).tui?.composerShape).toBe('box');
});
