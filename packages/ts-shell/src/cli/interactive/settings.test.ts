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

let root: string;
let file: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
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
  expect(await draft.save('attentionOnIdle', true)).toContain('Effective for the next operation');
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
  expect(await draft.save('attentionOnIdle', true)).toContain('conflict');
  expect(fs.readFileSync(file)).toEqual(before);
  expect(context.runtimeConfig.attentionOnIdle).toBe(false); expect(applied).not.toHaveBeenCalled();
});

it('reports saved but launch-overridden settings separately from the effective value', async () => {
  const context = runtime({ attentionOnIdle: false, offline: true });
  const notice = await openSettings(context, vi.fn()).save('attentionOnIdle', true);
  expect(notice).toContain('keeps its launch override');
  expect(context.runtimeConfig.attentionOnIdle).toBe(false);
  expect(openSettings(context, vi.fn()).values.attentionOnIdle.source).toBe('override');
  expect(getRuntimeConfig(root).attentionOnIdle).toBe(true);
});

it('does not claim a baseline-equal choice was saved when a concurrent writer changed it', async () => {
  fs.writeFileSync(file, '{"attentionOnIdle":false}');
  const context = runtime(); const applied = vi.fn(); const draft = openSettings(context, applied);
  fs.writeFileSync(file, '{"attentionOnIdle":true}');
  const notice = await draft.save('attentionOnIdle', false);
  expect(notice).toContain('selected value is not confirmed'); expect(notice).not.toContain('launch override');
  expect(notice).not.toContain('Saved to'); expect(applied).not.toHaveBeenCalled();
  expect(getRuntimeConfig(root).attentionOnIdle).toBe(true); expect(context.runtimeConfig.attentionOnIdle).toBe(false);
});

it.each([['0', true, false], ['1', false, true]] as const)('reports the actual offline policy with environment override %s', async (env, chosen, expected) => {
  vi.stubEnv('CHEERS_OFFLINE', env);
  const context = runtime(); const draft = openSettings(context, vi.fn());
  expect(draft.values.offline.effective).toBe(expected);
  expect(draft.values.offline.source).toBe('environment');
  const notice = await draft.save('offline', chosen);
  expect(notice).toContain('CHEERS_OFFLINE environment override'); expect(notice).not.toContain('Effective for');
  expect(getRuntimeConfig(root).offline).toBe(chosen);
  expect(openSettings(context, vi.fn()).values.offline.effective).toBe(expected);
});

it('reports unverifiable saved selection without applying or leaking read errors', async () => {
  const context = runtime(); const applied = vi.fn(); const draft = openSettings(context, applied);
  vi.spyOn(configFiles, 'readRuntimeConfigEditAt').mockImplementation(() => { throw new Error('private file detail'); });
  const notice = await draft.save('attentionOnIdle', true);
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
  const notice = await draft.save('attentionOnIdle', true);
  expect(notice).toContain('Saved to your user configuration'); expect(notice).toContain('not applied (rejected)');
  expect(context.runtimeConfig.attentionOnIdle).toBe(false); expect(context.configuration.current.admissionBlocked).toBe(true);
  expect(applied).not.toHaveBeenCalled();
});

it.each(['unchanged', 'unknown', 'persisted'] as const)('preserves the %s save outcome without publishing', async state => {
  const context = runtime(); const applied = vi.fn(); const draft = openSettings(context, applied);
  vi.spyOn(configFiles, 'writeRuntimeConfigFileAt').mockImplementation(() => { throw new ConfigWriteError('write-failed', state); });
  const result = await draft.save('attentionOnIdle', true);
  expect(result).toContain(state === 'unchanged' ? 'did not write' : state === 'unknown' ? 'unverified' : 'lock cleanup failed');
  expect(result).not.toContain('Effective'); expect(applied).not.toHaveBeenCalled();
});

it('invalidates a menu after a substrate transition and consumes an applied choice once', async () => {
  const context = runtime(); const draft = openSettings(context, vi.fn());
  applyShellSubstrateTransition(context, { cwd: root });
  expect(await draft.save('attentionOnIdle', true)).toContain('Reopen Settings');
  expect(fs.readFileSync(file, 'utf8')).toBe('{}');
  const current = openSettings(context, vi.fn());
  await current.save('attentionOnIdle', true);
  expect(await current.save('attentionOnIdle', false)).toContain('Reopen Settings');
  expect(getRuntimeConfig(root).attentionOnIdle).toBe(true);
});

it('validates advanced numbers before writing and applies a valid request setting', async () => {
  const context = runtime(); const applied = vi.fn(); const draft = openSettings(context, applied);
  expect(await draft.save('maxTurns', 0)).toContain('Invalid value');
  expect(fs.readFileSync(file, 'utf8')).toBe('{}'); expect(applied).not.toHaveBeenCalled();
  expect(await draft.save('maxTurns', 25)).toContain('Effective for the next operation');
  expect(context.runtimeConfig.maxTurns).toBe(25); expect(applied).toHaveBeenCalledOnce();
});

it('keeps project targeting explicit and reports ordinary user precedence', async () => {
    projectTrust.setProjectTrust(root, 'session-only');
  fs.writeFileSync(file, '{"maxTurns":20}'); const context = runtime();
  const draft = openSettings(context, vi.fn(), 'project');
  expect(await draft.save('maxTurns', 10)).toContain('follows user policy');
  expect(JSON.parse(fs.readFileSync(getProjectConfigPath(root), 'utf8')).maxTurns).toBe(10);
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).maxTurns).toBe(20);
  expect(context.runtimeConfig.maxTurns).toBe(20);
});

it('shows renderer defaults and accepted display preferences while a restart is pending', async () => {
  const context = runtime(); const draft = openSettings(context, vi.fn(), 'project');
  expect(draft.values['tui.diagrams']).toMatchObject({ effective: 'streaming', requested: undefined, source: 'default', restartRequired: false });
  expect(await draft.save('tui.diagrams', 'off')).toContain('Restart required');
  expect(context.runtimeConfig.tui?.diagrams).toBeUndefined();
  expect(context.configuration.current.requested.tui?.diagrams).toBe('off');
  expect(openSettings(context, vi.fn(), 'project').values['tui.diagrams']).toMatchObject({ effective: 'streaming', requested: 'off', requestedSource: 'project', restartRequired: true });
});

it('saves one nested display leaf and retains concurrent sibling changes and comments', async () => {
  fs.writeFileSync(file, '// preferences\n{"tui":{"statusItems":["cost"]}}');
  const context = runtime(); const draft = openSettings(context, vi.fn());
  fs.writeFileSync(file, '// preferences\n{"tui":{"statusItems":["model"]}}');
  expect(await draft.save('tui.diagrams', 'off')).toContain('Saved to your user');
  expect(fs.readFileSync(file, 'utf8')).toContain('// preferences');
  expect(configFiles.readUserRuntimeConfigFile().tui).toEqual({ statusItems: ['model'], diagrams: 'off' });
});

it('removes only the selected stored field and exposes the remaining project value', async () => {
    projectTrust.setProjectTrust(root, 'session-only');
  fs.writeFileSync(file, '{"maxTurns":20,"offline":true}');
  fs.writeFileSync(getProjectConfigPath(root), '{"maxTurns":8}'); const context = runtime();
  expect(await openSettings(context, vi.fn()).save('maxTurns', undefined)).toContain('Saved to your user');
  expect(configFiles.readUserRuntimeConfigFile()).toEqual({ offline: true });
  expect(context.runtimeConfig.maxTurns).toBe(8);
  expect(openSettings(context, vi.fn()).values.maxTurns).toMatchObject({ effective: 8, source: 'project', stored: undefined });
});

it.each([{ key: 'maxTurns', value: 15 }, { key: 'theme', value: 'dark' }, { key: 'agentMode', value: 'build' }])('reports saved but inactive project $key even when the fallback value is equal', async ({ key, value }) => {
  const context = runtime();
  const notice = await openSettings(context, vi.fn(), 'project').save(key, value);
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
  expect(await draft.save(key, true)).toContain('not editable'); expect(fs.readFileSync(file, 'utf8')).toBe('{}');
});

it('rejects unsupported status IDs without writing while preserving legacy loading compatibility', async () => {
  const context = runtime(); const draft = openSettings(context, vi.fn());
  expect(await draft.save('tui.statusItems', ['not-a-status-item'])).toContain('supported status');
  expect(fs.readFileSync(file, 'utf8')).toBe('{}');
  expect(await draft.save('tui.statusItems', ['cost'])).toContain('Saved');
  expect(configFiles.readUserRuntimeConfigFile().tui?.statusItems).toEqual(['cost']);
});

it('explains merged restrictions without falsely prescribing removal of a launch override', async () => {
  fs.writeFileSync(getProjectConfigPath(root), '{"allowedTools":["read"]}');
  const context = runtime({ allowedTools: ['read', 'write'] });
  const notice = await openSettings(context, vi.fn()).save('allowedTools', ['read', 'write']);
  expect(context.runtimeConfig.allowedTools).toEqual(['read']);
  expect(notice).toContain('project + user + override policy');
  expect(notice).not.toContain('restart without');
});
