import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runReloadCommand } from './reloadCommandRuntime.js';
import { getRuntimeConfig, getUserRuntimeConfigPath, getProjectConfigPath } from '../../config/runtimeConfig.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig, applyShellSubstrateTransition } from '../shell/runtimeContext.js';
import { configurationAdmission } from '../shell/configuration.js';
import { currentTheme, defaultTheme } from '../../presentation/theme/theme.js';
import { selectTheme, selectedTheme, updateAppearance } from '../../presentation/theme/selection.js';
import { createCliProviderRuntimeBridge } from '../../cli/provider/cliProviderRuntimeBridge.js';

let root: string;
let file: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'reload-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
  file = getUserRuntimeConfigPath(); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{"maxTurns":12,"theme":"dark"}');
  selectTheme('dark');
});
afterEach(() => { selectTheme('dark'); updateAppearance('dark'); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function runtime(overrides = {}) {
  const context = createShellRuntimeContext({ cwd: path.join(root, 'subdir'), originalCwd: root,
    projectRoot: root, rootMode: 'direct', targetPathBase: root, gitRoot: null,
    gitContext: { insideGit: false, root: null, branch: null, isClean: true },
    runtimeConfig: getRuntimeConfig(root, overrides), runtimeConfigOverrides: overrides,
    session: { id: 'reload-session', createdAt: 'now', updatedAt: 'now', status: 'active', turns: [] },
  });
  return { context, command: { cwd: context.cwd, refreshRuntimeConfig: () => refreshShellRuntimeConfig(context) } };
}

it('publishes valid settings from the project root and reports their application boundary', async () => {
  const { context, command } = runtime();
  const projectFile = getProjectConfigPath(root); fs.mkdirSync(path.dirname(projectFile), { recursive: true });
  fs.writeFileSync(projectFile, '{"instructionBudgetBytes":0}');
  fs.writeFileSync(file, '{"maxTurns":7,"theme":"light","tuiMode":"regular"}');
  const result = await runReloadCommand([], command);
  expect(context.runtimeConfig.maxTurns).toBe(7); expect(context.runtimeConfig.instructionBudgetBytes).toBe(0);
  expect(defaultTheme.name).toBe('light');
  expect(result.output).toContain('maxTurns: changed (next operation)');
  expect(result.output).toContain('Applied theme `light`');
  expect(result.output).toContain('Restart required: tuiMode');
  expect(context.runtimeConfig.tuiMode).toBe('fullscreen');
  expect(context.configuration.current.requested.tuiMode).toBe('regular');
  const again = await runReloadCommand([], command);
  expect(again.output).toContain('No configuration values changed.');
  expect(again.output).toContain('Restart required: tuiMode');
});

it('keeps all accepted settings and theme when theme preparation fails', async () => {
  const { context, command } = runtime(); const before = context.runtimeConfig; const revision = defaultTheme.colorRevision;
  fs.writeFileSync(file, '{"theme":"no-such-theme","maxTurns":7}');
  const result = await runReloadCommand([], command);
  expect(result.output).toContain('reload rejected'); expect(result.output).not.toContain('Re-read configuration.');
  expect(context.runtimeConfig).toBe(before); expect(defaultTheme.colorRevision).toBe(revision);
  expect(currentTheme()).toBe('dark');
});

it.each(['{"maxTurns":"wrong"}', '{broken', '{"allowedTools":false}'])('rejects %s without provider or settings fallback', async text => {
  fs.writeFileSync(file, JSON.stringify({ maxTurns: 12, providerCredentials: { openai: { apiKey: 'synthetic-first-key', model: 'first-model', baseUrl: 'http://127.0.0.1:1' } } }));
  const { context, command } = runtime(); const before = context.runtimeConfig;
  const bridge = createCliProviderRuntimeBridge({ runtimeConfig: () => context.runtimeConfig, options: {}, env: {} });
  const credential = bridge.resolveCredentialSnapshot();
  expect(credential.model).toBe('first-model');
  const admission = configurationAdmission(context);
  fs.writeFileSync(file, text);
  const result = await runReloadCommand([], command);
  expect(result.output).toContain('reload rejected'); expect(context.runtimeConfig).toBe(before);
  expect(bridge.resolveCredentialSnapshot()).toEqual(credential);
  expect(Boolean(admission())).toBe(text !== '{"maxTurns":"wrong"}');
  fs.writeFileSync(file, '{"maxTurns":9}');
  expect((await runReloadCommand([], command)).output).toContain('Re-read configuration.');
  expect(admission()).toBeUndefined(); expect(context.runtimeConfig.maxTurns).toBe(9);
});

it('preserves explicit launch overrides and applies automatic appearance', async () => {
  const { context, command } = runtime({ theme: 'auto', offline: true });
  updateAppearance('light');
  fs.writeFileSync(file, '{"theme":"dark","offline":false}');
  await runReloadCommand([], command);
  expect(context.runtimeConfig.theme).toBe('auto'); expect(context.runtimeConfig.offline).toBe(true);
  expect(selectedTheme()).toBe('auto'); expect(currentTheme()).toBe('light');
  expect(Object.isFrozen(context.runtimeConfigOverrides)).toBe(true);
});

it('revokes old operations across same-session transitions and retires background work on rejection', () => {
  const { context } = runtime(); const admission = configurationAdmission(context);
  const oldBackground = context.configuration.backgroundSignal;
  fs.writeFileSync(file, '{"maxTurns":"wrong"}');
  refreshShellRuntimeConfig(context);
  expect(oldBackground.aborted).toBe(true); expect(admission()).toBeUndefined();
  fs.writeFileSync(file, '{}');
  applyShellSubstrateTransition(context, { cwd: root });
  applyShellSubstrateTransition(context, { cwd: path.join(root, 'subdir') });
  expect(admission()).toContain('start a new operation');
});

it('prepares themes on workspace transitions and blocks the new binding on preparation failure', () => {
  const { context } = runtime();
  fs.writeFileSync(file, '{"theme":"light"}');
  applyShellSubstrateTransition(context, { cwd: root });
  expect(currentTheme()).toBe('light'); expect(context.runtimeConfig.theme).toBe('light');
  fs.writeFileSync(file, '{"theme":"missing-fixture"}');
  applyShellSubstrateTransition(context, { cwd: path.join(root, 'subdir') });
  expect(currentTheme()).toBe('light'); expect(context.runtimeConfig.theme).toBe('light');
  expect(configurationAdmission(context)()).toContain('safety validation failed');
});

it('reports missing sessions and unexpected refresh errors without claiming success', async () => {
  expect((await runReloadCommand([], { cwd: root })).output).toContain('Restart');
  const result = await runReloadCommand([], { cwd: root, refreshRuntimeConfig: () => { throw new Error('private detail'); } });
  expect(result.output).toContain('unverified'); expect(result.output).not.toContain('private detail');
});
