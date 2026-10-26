import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CONFIG_SETTINGS, formatSetting, settingValue, type SettingsScope } from '../../../../config/settings.js';
import { getProjectConfigPath, getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt } from '../../../../config/runtimeConfig.js';
import { createShellRuntimeContext } from '../../../../core/shell/runtimeContext.js';
import { projectTrust } from '../../../../core/security/trust/store.js';
import { writeCatalogCache } from '../../../../core/models/catalogStore.js';
import { openSettings } from '../../settings.js';
import { OverlayHost } from '../../overlay.js';
import { settingsPicker } from '../settings.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';
import { themePreferences } from '../../../../presentation/theme/preview.js';
import { selectTheme } from '../../../../presentation/theme/selection.js';
import { sameValue } from '../../../../config/values.js';
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
    overlay.handleKey(parseKeyEvent(raw), (picker, ids) => {
      work = picker.apply(ids).then(outcome => { if (outcome?.next) overlay.open(outcome.next); });
    });
    await work; await settle();
  };
  const choose = async (label: string) => {
    for (let attempt = 0; attempt < 30 && !frame().includes(`▸ ${label}`); attempt++) await press('\x1b[B');
    expect(frame()).toContain(`▸ ${label}`); await press('\r');
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
