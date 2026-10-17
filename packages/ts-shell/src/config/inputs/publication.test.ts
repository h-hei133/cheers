import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath } from '../runtimeConfig.js';
import { createConfigInputs } from './selection.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig, switchActiveSession } from '../../core/shell/runtimeContext.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { SessionManager } from '../../session/SessionManager.js';
import * as themes from '../../presentation/theme/selection.js';
import { userCatalogPath } from '../../core/models/catalogStore.js';
import { readFreshConfiguration } from '../../core/commands/configuration.js';
import { openSettings } from '../../cli/interactive/settings.js';
import * as documents from '../document.js';
import { runConnectCommand } from '../../core/commands/connectCommandRuntime.js';

let root: string;
let file: string;
let user: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-input-publication-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_MAX_TURNS', '');
  file = path.join(root, 'overlay.json'); fs.writeFileSync(file, '{"maxTurns":31,"theme":"dark"}');
  user = getUserRuntimeConfigPath(); fs.mkdirSync(path.dirname(user), { recursive: true }); fs.writeFileSync(user, '{/* keep */"maxTurns":11}');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const inputs = createConfigInputs([{ path: file, source: 'user' }], root);
  return createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
    rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
    session: new SessionManager().createNew(root), runtimeConfig: getRuntimeConfig(root, { offline: true }, inputs), runtimeConfigOverrides: { offline: true } });
}

it('retains the complete accepted config, catalogue and theme on bad reload, then publishes one complete good candidate', () => {
  const shell = fixture(); const before = shell.configuration.current;
  let installed = 'dark';
  const prepare = vi.spyOn(themes, 'prepareThemeSelection').mockImplementation(theme => () => { installed = theme!; });
  fs.writeFileSync(userCatalogPath(), '{"providers":{"overlay-test":{"models":[{"id":"new"}]}}}');
  fs.writeFileSync(file, '{broken');
  const invalid = refreshShellRuntimeConfig(shell);
  expect(invalid.status).toBe('rejected'); expect(invalid.admissionBlocked).toBe(true);
  expect(shell.configuration.current.config).toBe(before.config); expect(shell.configuration.current.catalog).toBe(before.catalog);
  expect(installed).toBe('dark'); expect(prepare).not.toHaveBeenCalled();
  expect(configurationAdmission(shell)()).toContain('Configuration safety validation');
  fs.writeFileSync(file, '{"maxTurns":41,"theme":"light"}');
  const revision = shell.configuration.current.revision;
  expect(refreshShellRuntimeConfig(shell).status).toBe('applied');
  expect(shell.configuration.current.revision).toBe(revision + 1);
  expect(shell.runtimeConfig.maxTurns).toBe(41); expect(shell.runtimeConfig.offline).toBe(true); expect(installed).toBe('light');
  expect(shell.configuration.current.catalog.some(provider => provider.id === 'overlay-test')).toBe(true);
  expect(shell.configuration.current.admissionBlocked).toBe(false);
});

it('keeps ordinary invalid values nonblocking, but missing explicit files block until recovered', () => {
  const shell = fixture(); const before = shell.runtimeConfig;
  fs.writeFileSync(file, '{"maxTurns":"wrong"}');
  expect(refreshShellRuntimeConfig(shell)).toMatchObject({ status: 'rejected', admissionBlocked: false });
  expect(shell.runtimeConfig).toBe(before);
  fs.unlinkSync(file);
  expect(refreshShellRuntimeConfig(shell)).toMatchObject({ status: 'rejected', admissionBlocked: true });
  expect(shell.runtimeConfig).toBe(before);
  fs.writeFileSync(file, '{"maxTurns":51}');
  expect(refreshShellRuntimeConfig(shell)).toMatchObject({ status: 'applied', admissionBlocked: false });
});

it('preserves fixed input selection across session/workspace rebinding and fresh command readbacks', () => {
  const shell = fixture(); const selection = shell.runtimeConfig.configInputs;
  const next = path.join(root, 'next'); fs.mkdirSync(next);
  const session = new SessionManager().createNew(next);
  switchActiveSession(shell, session, next, { cwd: next, projectRoot: next, targetPathBase: next });
  expect(refreshShellRuntimeConfig(shell).status).toBe('applied');
  expect(shell.runtimeConfig.maxTurns).toBe(31); expect(shell.runtimeConfig.configInputs).toEqual(selection);
  const fresh = readFreshConfiguration({ cwd: next, runtimeConfig: shell.runtimeConfig, readConfiguration: () => shell.configuration.current });
  expect(fresh.maxTurns).toBe(31); expect(fresh.offline).toBe(true);
});

it('saves only a selected primary field and explains overlay shadowing, with no effective dump or overlay writes', async () => {
  const shell = fixture(); const before = fs.readFileSync(file);
  const draft = openSettings(shell, () => {});
  expect(draft.values.maxTurns.source).toContain(file);
  const saved = await draft.save('maxTurns', 21);
  expect(saved.applied).toBe(true); expect(saved.note).toContain(file);
  expect(shell.runtimeConfig.maxTurns).toBe(31);
  expect(fs.readFileSync(user, 'utf8')).toBe('{/* keep */"maxTurns":21}');
  expect(fs.readFileSync(file)).toEqual(before);
  fs.writeFileSync(file, '{}');
  expect(refreshShellRuntimeConfig(shell).status).toBe('applied'); expect(shell.runtimeConfig.maxTurns).toBe(21);
});

it('summarizes the actual installed and live TUI leaf file revisions after reload and display changes', () => {
  fs.writeFileSync(file, '{"tui":{"diagrams":"off","composerShape":"box"}}');
  const shell = fixture();
  const installed = shell.runtimeConfig.configProvenance.tui.files![0];
  fs.writeFileSync(file, '{"tui":{"diagrams":"streaming","composerShape":"rail"}}');
  expect(refreshShellRuntimeConfig(shell).status).toBe('applied');
  const accepted = shell.runtimeConfig.configProvenance.tui;
  const live = accepted.children!.composerShape.files![0];
  expect(live.revision).not.toBe(installed.revision);
  expect(accepted.files).toEqual(expect.arrayContaining([installed, live]));
  expect(shell.runtimeConfig.tui).toEqual({ diagrams: 'off', composerShape: 'rail' });
  shell.configuration.recordDisplay({ tui: { diagrams: 'off', composerShape: 'field' } });
  const displayed = shell.runtimeConfig.configProvenance.tui;
  expect(displayed.files).toEqual([installed]);
  expect(displayed.shadowedFiles).toContainEqual(live);
  fs.writeFileSync(file, '{}');
  expect(refreshShellRuntimeConfig(shell).status).toBe('applied');
  expect(shell.runtimeConfig.configProvenance.tui.files).toEqual([installed]);
  shell.configuration.recordDisplay({ tui: {} });
  expect(shell.runtimeConfig.configProvenance.tui.files).toBeUndefined();
});

it('rejects a file disappearing at final canonical recheck without publishing or escaping the reload contract', () => {
  const shell = fixture(); const before = shell.configuration.current;
  const prepare = vi.spyOn(themes, 'prepareThemeSelection');
  const matches = documents.configSnapshotMatches;
  vi.spyOn(documents, 'configSnapshotMatches').mockImplementation((name, snapshot) => {
    const result = matches(name, snapshot);
    if (name === file && fs.existsSync(file)) fs.unlinkSync(file);
    return result;
  });
  expect(refreshShellRuntimeConfig(shell)).toMatchObject({ status: 'rejected', admissionBlocked: true });
  expect(shell.configuration.current.config).toBe(before.config);
  expect(shell.configuration.current.catalog).toBe(before.catalog);
  expect(prepare).not.toHaveBeenCalled();
  expect(shell.configuration.current.diagnostics.join(' ')).toContain('content-changed');
});

it.each(['use', 'login', 'logout'])('reports primary storage and the overlay still supplying effective connections after %s', async action => {
  const connection = (id: string) => ({ id, provider: 'openai', apiKey: 'synthetic-input-private', model: 'gpt-4o', status: 'connected' });
  fs.writeFileSync(user, JSON.stringify({ activeProviderConnectionId: 'alpha', providerConnections: [connection('alpha'), connection('beta')] }));
  fs.writeFileSync(file, JSON.stringify({ activeProviderConnectionId: 'overlay', providerConnections: [connection('overlay')] }));
  const bytes = fs.readFileSync(file); const shell = fixture();
  const context = { cwd: root, get runtimeConfig() { return shell.runtimeConfig; },
    readConfiguration: () => shell.configuration.current, refreshRuntimeConfig: () => refreshShellRuntimeConfig(shell) };
  const args = action === 'login' ? ['login', 'openai', '--api-key', 'synthetic-new-private'] : [action, 'beta'];
  const result = await runConnectCommand(args, context);
  expect(result.output).toContain('Stored at:');
  expect(result.output).toContain('Explicit config input');
  expect(result.output).toContain(file);
  expect(result.output).not.toMatch(/Active connection switched|Default runtime provider switched|Disconnected provider connection/);
  expect(result.output).not.toMatch(/synthetic-input-private|synthetic-new-private/);
  expect(shell.runtimeConfig.activeProviderConnectionId).toBe('overlay');
  expect(shell.runtimeConfig.providerConnections.map(item => item.id)).toEqual(['overlay']);
  expect(fs.readFileSync(file)).toEqual(bytes);
  const stored = JSON.parse(fs.readFileSync(user, 'utf8'));
  if (action === 'use') expect(stored.activeProviderConnectionId).toBe('beta');
  else if (action === 'logout') expect(stored.providerConnections.some((item: { id: string }) => item.id === 'beta')).toBe(false);
  else expect(stored.providerConnections[0].apiKey).toBe('synthetic-new-private');
});
