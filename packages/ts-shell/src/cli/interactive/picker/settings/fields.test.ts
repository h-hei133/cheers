import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CONFIG_SETTINGS, formatSetting, settingValue, type SettingsScope } from '../../../../config/settings.js';
import { getProjectConfigPath, getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt } from '../../../../config/runtimeConfig.js';
import { applyShellSubstrateTransition, createShellRuntimeContext } from '../../../../core/shell/runtimeContext.js';
import { projectTrust } from '../../../../core/security/trust/store.js';
import { writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { openSettings } from '../../settings.js';
import { OverlayHost, type PickerOutcome } from '../../overlay.js';
import { settingsPicker } from '../settings.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';
import { themePreferences } from '../../../../presentation/theme/preview.js';
import { selectTheme } from '../../../../presentation/theme/selection.js';
import { sameValue } from '../../../../config/values.js';
import { createProfileContext, withProfile } from '../../../../core/paths/profile/context.js';
import * as configFiles from '../../../../config/runtimeConfig.js';
import * as sessionFiles from '../../../../session/store/sessionFileStore.js';
import { normalizeStatusItems, STATUS_ITEMS } from '../../../../presentation/tui/chrome/items.js';

const choices: Readonly<Record<string, unknown>> = {
  attentionOnIdle: true, offline: true, maxTurns: 24, temperature: 0.2, topP: 0.8, maxOutputTokens: 2048,
  contextWindow: 65536, reserveTokens: 1000,
  modelTokenBudgets: { 'openai/fixture': { reserveTokens: 1000, keepRecentTokens: 2000 } },
  instructionBudgetBytes: 1024, cacheWarming: 'off', agentMode: 'plan', steeringMode: 'all', followUpMode: 'all',
  retryEnabled: false, retryMaxRetries: 2, providerRetryMaxRetries: 1, retryBaseDelayMs: 1000, retryMaxDelayMs: 10000,
  providerConnectTimeoutMs: 1000, providerHeadersTimeoutMs: 2000, providerBodyTimeoutMs: 3000,
  allowedTools: ['read', 'write'], allowedModels: ['openai/fixture'],
  pathRules: [{ path: '.', settings: { maxTurns: 3 } }], disabledTools: ['fixture.a', 'fixture.b'],
  hiddenToolPrefixes: ['fixture.'], denyRules: [{ tool: 'bash', pattern: 'fixture' }],
  enableMcpTools: false, toolDiscovery: 'full', theme: 'light', vimMode: true, backgroundFollowUp: true,
  tuiMode: 'regular', 'tui.composerShape': 'box', 'tui.statusItems': ['model', 'cost'], 'tui.diagrams': 'off',
};
const cases = CONFIG_SETTINGS.flatMap(setting => (['user', 'project'] as const)
  .filter(scope => setting.policy.sources.includes(scope)).map(scope => ({ key: setting.key, setting, scope })));

let scratch: string;
let root: string;
let userFile: string;
let projectFile: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  scratch = fs.mkdtempSync('/tmp/cheers-test/settings-fields-'); root = path.join(scratch, 'project');
  fs.mkdirSync(path.join(root, '.cheers'), { recursive: true });
  vi.stubEnv('HOME', path.join(scratch, 'home')); vi.stubEnv('USERPROFILE', path.join(scratch, 'home'));
  // This Vitest version stringifies undefined; remember the original before
  // removing an optional input rather than creating an invalid environment value.
  for (const name of ['CHEERS_MAX_TURNS', 'CHEERS_OFFLINE']) { vi.stubEnv(name, ''); delete process.env[name]; }
  userFile = getUserRuntimeConfigPath(); projectFile = getProjectConfigPath(root);
  fs.mkdirSync(path.dirname(userFile), { recursive: true });
  fs.writeFileSync(userFile, '// user preferences\n{"schemaVersion":1}');
  fs.writeFileSync(projectFile, '// project preferences\n{"schemaVersion":1}');
  writeCatalogCache([{ id: 'openai', models: [{ id: 'fixture', contextWindow: 128000, maxTokens: 8192 }] }]);
  projectTrust.setProjectTrust(root, 'session-only'); selectTheme('dark', root);
});
afterEach(() => {
  selectTheme('dark', root); vi.restoreAllMocks(); vi.unstubAllEnvs();
  fs.rmSync(scratch, { recursive: true, force: true });
});

function surface(scope: SettingsScope) {
  const runtime = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root,
    rootMode: 'direct', targetPathBase: root, gitRoot: null,
    gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root),
    session: { id: 'field-session', createdAt: 'now', updatedAt: 'now', status: 'active', turns: [] },
    resolveConfigTarget: () => ({ provider: 'openai', model: 'fixture' }),
  });
  expect(runtime.configuration.current.admissionBlocked).toBe(false);
  expect(runtime.runtimeConfig.configValidation.valid).toBe(true);
  const changed = vi.fn();
  const host = { openSettings: (selected?: SettingsScope) => openSettings(runtime, changed, selected),
    themes: themePreferences({ workspaceRoot: root, redraw: changed, follower: { stop() {}, refresh() {} } }),
  };
  const overlay = new OverlayHost(changed);
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
  const frame = () => stripAnsi(overlay.render(120, 40).join('\n'));
  const press = async (raw: string) => {
    let work: Promise<unknown> | undefined;
    let result: PickerOutcome | undefined;
    overlay.handleKey(parseKeyEvent(raw), (picker, ids) => {
      work = picker.apply(ids).then(outcome => { result = outcome; if (outcome?.next) overlay.open(outcome.next); });
    });
    await work; await settle();
    return result;
  };
  const choose = async (label: string) => {
    for (let attempt = 0; attempt < 30 && !frame().includes(`▸ ${label}`); attempt++) await press('\x1b[B');
    expect(frame()).toContain(`▸ ${label}`); return press('\r');
  };
  const open = async (key: string) => {
    overlay.open(settingsPicker(host, scope)); await settle();
    overlay.handlePaste(key); await press('\r');
    expect(frame()).toContain(`save to ${scope}`);
    expect(frame()).toContain(CONFIG_SETTINGS.find(setting => setting.key === key)!.label);
  };
  return { runtime, host, overlay, settle, frame, press, choose, open };
}

it('requires an explicit valid exercise for every real setting and every editable scope', () => {
  expect(Object.keys(choices).sort()).toEqual(CONFIG_SETTINGS.map(setting => setting.key).sort());
  expect(cases).toHaveLength(73);
  expect(cases.filter(test => test.scope === 'project').map(test => test.key)).not.toContain('cacheWarming');
});

it.each(['session', 'workspace', 'workspace-return'] as const)('does not carry a failed staged project setting into another %s binding on retry', async change => {
  const view = surface('project'); const before = fs.readFileSync(projectFile);
  const nextRoot = path.join(scratch, 'next-project'); fs.mkdirSync(path.join(nextRoot, '.cheers'), { recursive: true });
  const nextFile = getProjectConfigPath(nextRoot); fs.writeFileSync(nextFile, '{"maxTurns":7}');
  const nextBefore = fs.readFileSync(nextFile);
  try {
    await view.open('maxTurns'); await view.press('\r'); await view.press('\x15'); await view.press('42'); await view.press('\r');
    if (change === 'session') applyShellSubstrateTransition(view.runtime, { session: { ...view.runtime.session, id: 'other-session' } });
    else applyShellSubstrateTransition(view.runtime, { cwd: nextRoot, projectRoot: nextRoot, targetPathBase: nextRoot });
    if (change === 'workspace-return') applyShellSubstrateTransition(view.runtime, { cwd: root, projectRoot: root, targetPathBase: root });
    expect((await view.press('\r'))?.note).toContain('Reopen Settings');
    expect(view.frame()).toContain('Pending: 42'); expect(view.frame()).toContain('Apply not confirmed');
    await view.press('\r');
    expect(fs.readFileSync(projectFile)).toEqual(before);
    expect(fs.readFileSync(nextFile)).toEqual(nextBefore);
    expect(view.frame()).toContain('Apply not confirmed');
  } finally { view.overlay.close(); }
});

it.each(['user', 'project'] as const)('allows an explicit second Apply after a same-source %s conflict, retaining the draft and other fields', async scope => {
  const view = surface(scope); const target = scope === 'user' ? userFile : projectFile;
  const other = scope === 'user' ? projectFile : userFile; const otherBefore = fs.readFileSync(other);
  try {
    await view.open('maxTurns'); await view.press('\r'); await view.press('\x15'); await view.press('42'); await view.press('\r');
    const conflicting = '// changed externally\n{"schemaVersion":1,"maxTurns":17,"topP":0.6}';
    fs.writeFileSync(target, conflicting);
    expect((await view.press('\r'))?.note).toContain('conflict');
    expect(fs.readFileSync(target, 'utf8')).toBe(conflicting); expect(view.frame()).toContain('Pending: 42');
    expect((await view.press('\r'))?.note).toContain(`Saved to your ${scope}`);
    expect(readRuntimeConfigEditAt(target).values).toMatchObject({ maxTurns: 42, topP: 0.6 });
    expect(fs.readFileSync(target, 'utf8')).toContain('// changed externally'); expect(fs.readFileSync(other)).toEqual(otherBefore);
    await view.press('\r'); expect(view.frame()).toContain('Stored: 42');
  } finally { view.overlay.close(); }
});

it.each(['cancel', 'confirm'] as const)('keeps the scope chooser %s path explicit for a staged value with both source owners', async action => {
  const view = surface('user'); const bytes = [userFile, projectFile].map(file => fs.readFileSync(file));
  try {
    await view.open('maxTurns'); await view.press('\r'); await view.press('\x15'); await view.press('42'); await view.press('\r');
    await view.choose('Change save scope');
    if (action === 'cancel') {
      await view.press('\x1b'); expect(view.frame()).toContain('save to user'); expect(view.frame()).toContain('Pending: 42');
      await view.press('\r'); expect(readRuntimeConfigEditAt(userFile).values.maxTurns).toBe(42);
      expect(fs.readFileSync(projectFile)).toEqual(bytes[1]);
    } else {
      await view.choose('Project configuration'); expect(view.frame()).toContain('save to project'); expect(view.frame()).not.toContain('Pending:');
      expect([userFile, projectFile].map(file => fs.readFileSync(file))).toEqual(bytes);
      await view.press('\r'); await view.press('\x15'); await view.press('24'); await view.press('\r'); await view.press('\r');
      expect(readRuntimeConfigEditAt(projectFile).values.maxTurns).toBe(24); expect(fs.readFileSync(userFile)).toEqual(bytes[0]);
    }
  } finally { view.overlay.close(); }
});

it('does not recapture another binding by confirming a save-scope chooser opened before the transition', async () => {
  const view = surface('user'); const bytes = [userFile, projectFile].map(file => fs.readFileSync(file));
  try {
    await view.open('maxTurns'); await view.press('\r'); await view.press('\x15'); await view.press('42'); await view.press('\r');
    await view.choose('Change save scope');
    applyShellSubstrateTransition(view.runtime, { session: { ...view.runtime.session, id: 'other-session' } });
    await view.choose('Project configuration');
    expect(view.frame()).toContain('save to user'); expect(view.frame()).toContain('Pending: 42'); expect(view.frame()).toContain('Apply not confirmed');
    await view.press('\r'); expect([userFile, projectFile].map(file => fs.readFileSync(file))).toEqual(bytes);
  } finally { view.overlay.close(); }
});

it('keeps the original pending value and scope when a chosen scope document becomes unreadable', async () => {
  const view = surface('user'); const before = fs.readFileSync(userFile);
  try {
    await view.open('maxTurns'); await view.press('\r'); await view.press('\x15'); await view.press('42'); await view.press('\r');
    await view.choose('Change save scope'); fs.writeFileSync(projectFile, '{broken');
    await view.choose('Project configuration');
    expect(view.frame()).toContain('save to user'); expect(view.frame()).toContain('Pending: 42'); expect(view.frame()).toContain('Apply not confirmed');
    expect(fs.readFileSync(userFile)).toEqual(before); expect(fs.readFileSync(projectFile, 'utf8')).toBe('{broken');
  } finally { view.overlay.close(); }
});

it('does not retry a pending project value into a preferred source that replaced its captured legacy source', async () => {
  fs.rmSync(projectFile); const legacy = path.join(root, '.cheers.json'); fs.writeFileSync(legacy, '{"maxTurns":19}');
  const view = surface('project');
  try {
    await view.open('maxTurns'); await view.press('\r'); await view.press('\x15'); await view.press('42'); await view.press('\r');
    fs.writeFileSync(projectFile, '{"maxTurns":21}');
    expect((await view.press('\r'))?.note).toContain('source changed'); await view.press('\r');
    expect(fs.readFileSync(legacy, 'utf8')).toBe('{"maxTurns":19}'); expect(fs.readFileSync(projectFile, 'utf8')).toBe('{"maxTurns":21}');
    expect(view.frame()).toContain('Pending: 42'); expect(view.frame()).toContain('Apply not confirmed');
  } finally { view.overlay.close(); }
});

it('does not write a captured legacy user source after a preferred user document appeared', async () => {
  const preferred = userFile; const legacy = path.join(scratch, 'home', '.cheer', 'config.json');
  fs.rmSync(preferred); fs.mkdirSync(path.dirname(legacy), { recursive: true }); fs.writeFileSync(legacy, '{"maxTurns":19}');
  const view = surface('user');
  try {
    await view.open('maxTurns'); await view.press('\r'); await view.press('\x15'); await view.press('42'); await view.press('\r');
    fs.writeFileSync(preferred, '{"maxTurns":21}');
    await view.press('\r'); await view.press('\r');
    expect(fs.readFileSync(legacy, 'utf8')).toBe('{"maxTurns":19}'); expect(fs.readFileSync(preferred, 'utf8')).toBe('{"maxTurns":21}');
    expect(view.frame()).toContain('Pending: 42'); expect(view.frame()).toContain('Apply not confirmed');
  } finally { view.overlay.close(); }
});

it('does not reopen a project draft in another profile even when its workspace and selected project file are unchanged', async () => {
  const home = path.dirname(path.dirname(userFile));
  const first = createProfileContext({ name: 'first', homeDir: home, env: {} });
  const second = createProfileContext({ name: 'second', homeDir: home, env: {} });
  let captured: ReturnType<typeof openSettings> | undefined;
  await withProfile(first, async () => {
    const view = surface('project'); captured = view.host.openSettings('project'); view.overlay.close();
  });
  await withProfile(second, async () => {
    expect(captured!.reopen()).toBeUndefined();
  });
});

it('does not recapture a replaced physical profile directory for a project draft', async () => {
  const home = path.dirname(path.dirname(userFile));
  const profile = createProfileContext({ name: 'first', homeDir: home, env: {} });
  let captured: ReturnType<typeof openSettings> | undefined;
  await withProfile(profile, async () => {
    const view = surface('project'); captured = view.host.openSettings('project'); view.overlay.close();
  });
  fs.renameSync(profile.root, profile.root + '-retired'); fs.mkdirSync(profile.root);
  expect(captured!.reopen()).toBeUndefined();
});

it('rechecks a legacy user selector inside the real configuration write lock', async () => {
  const preferred = userFile; const legacy = path.join(scratch, 'home', '.cheer', 'config.json');
  fs.rmSync(preferred); fs.mkdirSync(path.dirname(legacy), { recursive: true }); fs.writeFileSync(legacy, '{"maxTurns":19}');
  const view = surface('user'); const lock = sessionFiles.withFileLock;
  try {
    await view.open('maxTurns'); await view.press('\r'); await view.press('\x15'); await view.press('42'); await view.press('\r');
    vi.spyOn(sessionFiles, 'withFileLock').mockImplementation((file, action, options) => lock(file, () => {
      fs.writeFileSync(preferred, '{"maxTurns":21}'); return action();
    }, options));
    expect((await view.press('\r'))?.note).toContain('conflict');
    expect(fs.readFileSync(legacy, 'utf8')).toBe('{"maxTurns":19}'); expect(fs.readFileSync(preferred, 'utf8')).toBe('{"maxTurns":21}');
    expect(view.frame()).toContain('Pending: 42');
  } finally { view.overlay.close(); }
});

it('rechecks the original binding inside the real configuration write lock', async () => {
  const view = surface('project'); const before = fs.readFileSync(projectFile); const lock = sessionFiles.withFileLock;
  try {
    await view.open('maxTurns'); await view.press('\r'); await view.press('\x15'); await view.press('42'); await view.press('\r');
    vi.spyOn(sessionFiles, 'withFileLock').mockImplementation((file, action, options) => lock(file, () => {
      applyShellSubstrateTransition(view.runtime, { session: { ...view.runtime.session, id: 'other-session' } }); return action();
    }, options));
    expect((await view.press('\r'))?.note).toContain('conflict'); expect(fs.readFileSync(projectFile)).toEqual(before);
    expect(view.frame()).toContain('Pending: 42');
  } finally { view.overlay.close(); }
});

it('keeps persistence distinct from publication when the binding changes after the real write', async () => {
  const view = surface('project'); const write = configFiles.writeRuntimeConfigFileAt; const userBefore = fs.readFileSync(userFile);
  try {
    await view.open('maxTurns'); await view.press('\r'); await view.press('\x15'); await view.press('42'); await view.press('\r');
    vi.spyOn(configFiles, 'writeRuntimeConfigFileAt').mockImplementation((file, patch, baseline, precondition) => {
      const result = write(file, patch, baseline, precondition);
      applyShellSubstrateTransition(view.runtime, { session: { ...view.runtime.session, id: 'other-session' } }); return result;
    });
    const result = await view.press('\r');
    expect(result?.note).toContain('Saved to your project'); expect(result?.note).toContain('application is unconfirmed');
    expect(view.frame()).toContain('Apply not confirmed'); expect(readRuntimeConfigEditAt(projectFile).values.maxTurns).toBe(42);
    expect(fs.readFileSync(userFile)).toEqual(userBefore);
  } finally { view.overlay.close(); }
});

it('rejects invalid number text through Enter, preserves an earlier pending value on editor Escape and saves only a later Apply', async () => {
  const view = surface('user'); const before = fs.readFileSync(userFile);
  try {
    await view.open('maxTurns'); await view.press('\r'); await view.press('\x15'); await view.press('0'); await view.press('\r');
    expect(view.frame()).toContain('Invalid value'); expect(fs.readFileSync(userFile)).toEqual(before);
    await view.press('\x15'); await view.press('42'); await view.press('\r'); await view.choose('Edit value');
    await view.press('\x15'); await view.press('7'); await view.press('\x1b'); expect(view.frame()).toContain('Pending: 42');
    expect(fs.readFileSync(userFile)).toEqual(before); await view.press('\r'); expect(readRuntimeConfigEditAt(userFile).values.maxTurns).toBe(42);
  } finally { view.overlay.close(); }
});

it.each(cases)('navigates, cancels, saves, reopens and removes $key in $scope through real keys and owners', async ({ key, setting, scope }) => {
  const value = choices[key]; const view = surface(scope);
  const target = scope === 'user' ? userFile : projectFile;
  const other = scope === 'user' ? projectFile : userFile;
  const before = fs.readFileSync(target); const otherBefore = fs.readFileSync(other);
  const initial = view.host.openSettings(scope).values[key];
  const stage = async () => {
    if (setting.choices || key === 'theme') await view.choose(`Choose ${formatSetting(value)}`);
    else {
      await view.press('\r');
      if (key === 'tui.statusItems') {
        // Canonical checkboxes: use the form's actual current selection, then
        // toggle through keyboard events without invoking its apply directly.
        const current = normalizeStatusItems((initial.stored ?? initial.requested) as readonly string[] | undefined);
        for (let index = 0; index < STATUS_ITEMS.length; index++) {
          const id = STATUS_ITEMS[index].id;
          if (current.includes(id) !== (value as readonly string[]).includes(id)) await view.press(' ');
          if (index + 1 < STATUS_ITEMS.length) await view.press('\x1b[B');
        }
      } else {
        await view.press('\x15');
        const lines = Array.isArray(value) ? value.map(item => typeof item === 'string' ? item : JSON.stringify(item))
          : [typeof value === 'string' ? value : JSON.stringify(value)];
        for (let index = 0; index < lines.length; index++) {
          if (index) await view.press('\n');
          await view.press(lines[index]);
        }
      }
      await view.press('\r');
    }
    expect(view.frame()).toContain('Pending:'); expect(view.frame()).toContain('▸ Apply');
  };
  try {
    await view.open(key); await stage();
    expect(fs.readFileSync(target)).toEqual(before); expect(fs.readFileSync(other)).toEqual(otherBefore);
    await view.press('\x1b'); expect(fs.readFileSync(target)).toEqual(before);
    await view.open(key); await stage(); await view.press('\r');
    const saved = view.host.openSettings(scope).values[key];
    expect(saved.stored).toEqual(value); expect(saved.requested, JSON.stringify(view.runtime.configuration.current.diagnostics)).toEqual(value);
    expect(saved.effective).toEqual(setting.policy.application === 'restart' ? initial.effective : value);
    expect(saved.restartRequired).toBe(setting.policy.application === 'restart' && !sameValue(initial.effective, value));
    expect(saved.requestedSource).toBe(scope); expect(fs.readFileSync(other)).toEqual(otherBefore);
    const [rootKey, leaf] = setting.path;
    expect(readRuntimeConfigEditAt(target).values).toEqual({ schemaVersion: 1, [rootKey]: leaf ? { [leaf]: value } : value });
    expect(fs.readFileSync(target, 'utf8')).toContain(`// ${scope} preferences`);
    await view.open(key);
    expect(view.frame()).toContain(`Stored: ${formatSetting(value).slice(0, 20)}`);
    await view.choose('Remove stored value'); await view.press('\r');
    expect(settingValue(readRuntimeConfigEditAt(target).values, setting)).toBeUndefined();
    expect(fs.readFileSync(other)).toEqual(otherBefore);
    await view.open(key); expect(view.frame()).toContain('Stored: unset');
    const removed = view.host.openSettings(scope).values[key];
    expect(removed.effective).toEqual(initial.effective); expect(removed.requested).toEqual(initial.requested);
    expect(removed.restartRequired).toBe(false);
  } finally { view.overlay.close(); }
});

it.each([
  { key: 'maxTurns', user: 20, project: 8, changed: 24, effective: 24, source: 'user', removed: 8 },
  { key: 'allowedTools', user: ['read', 'write'], project: ['read'], changed: ['read', 'bash'],
    effective: ['read'], source: 'project + user', removed: ['read'] },
  { key: 'disabledTools', user: ['fixture.a'], project: ['fixture.b'], changed: ['fixture.c'],
    effective: ['fixture.b', 'fixture.c'], source: 'project + user', removed: ['fixture.b'] },
  { key: 'denyRules', user: [{ tool: 'bash', pattern: 'user' }], project: [{ tool: 'write', pattern: 'project' }],
    changed: [{ tool: 'bash', pattern: 'changed' }], effective: [{ tool: 'write', pattern: 'project' }, { tool: 'bash', pattern: 'changed' }],
    source: 'project + user', removed: [{ tool: 'write', pattern: 'project' }] },
  { key: 'enableMcpTools', user: true, project: false, changed: true, effective: false,
    source: 'project', removed: false },
  { key: 'tui.composerShape', user: 'band', project: 'box', changed: 'rail', effective: 'box',
    source: 'project', removed: 'box' },
  { key: 'pathRules', user: [{ path: 'user', settings: { maxTurns: 2 } }], project: [{ path: 'project', settings: { maxTurns: 3 } }],
    changed: [{ path: 'changed', settings: { maxTurns: 4 } }],
    effective: [{ path: 'project', settings: { maxTurns: 3 } }, { path: 'changed', settings: { maxTurns: 4 } }],
    source: 'project + user', removed: [{ path: 'project', settings: { maxTurns: 3 } }] },
])('keeps $key stored edits separate from effective source policy when another scope contributes', async test => {
  const setting = CONFIG_SETTINGS.find(item => item.key === test.key)!;
  const [rootKey, leaf] = setting.path;
  const config = (value: unknown) => ({ schemaVersion: 1, [rootKey]: leaf ? { [leaf]: value, diagrams: 'streaming' } : value });
  fs.writeFileSync(userFile, JSON.stringify(config(test.user)));
  fs.writeFileSync(projectFile, JSON.stringify(config(test.project)));
  const projectBefore = fs.readFileSync(projectFile); const view = surface('user');
  try {
    expect(view.host.openSettings('user').values[test.key].stored).toEqual(test.user);
    const saved = await view.host.openSettings('user').save(test.key, test.changed);
    expect(saved.applied).toBe(true);
    expect(view.host.openSettings('user').values[test.key]).toMatchObject({
      stored: test.changed, effective: test.effective, source: test.source,
    });
    expect(fs.readFileSync(projectFile)).toEqual(projectBefore);
    const removed = await view.host.openSettings('user').save(test.key, undefined);
    expect(removed.applied).toBe(true);
    expect(view.host.openSettings('user').values[test.key]).toMatchObject({ stored: undefined, effective: test.removed });
    expect(fs.readFileSync(projectFile)).toEqual(projectBefore);
    if (leaf) expect(readRuntimeConfigEditAt(userFile).values.tui?.diagrams).toBe('streaming');
  } finally { view.overlay.close(); }
});
