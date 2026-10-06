import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath, getProjectConfigPath } from './runtimeConfig.js';
import { projectTrust } from '../core/security/trust/store.js';
import { configurationAdmission, initialConfiguration, refreshConfiguration } from '../core/shell/configuration.js';
import { tuiFields } from './fields.js';
import * as runtimeFiles from './runtimeConfig.js';
import * as themes from '../presentation/theme/selection.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-trust-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_MAX_TURNS', '');
  fs.mkdirSync(path.join(root, '.agents'));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function project(value: unknown, directory = root) { fs.writeFileSync(getProjectConfigPath(directory), JSON.stringify(value)); }
function user(value: unknown) { const file = getUserRuntimeConfigPath(); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); }

it.each(['undecided', 'untrusted', 'unavailable'])('filters sensitive project inputs under %s while preserving valid personal values and diagnostic privacy', decision => {
  if (decision === 'untrusted') projectTrust.setProjectTrust(root, 'untrusted');
  if (decision === 'unavailable') { user({}); fs.writeFileSync(path.join(root, '.cheers', 'trust.json'), '{PRIVATE_TRUST_CONTENT'); }
  project({ theme: 'PRIVATE_THEME', maxTurns: 77, temperature: 0.3, maxOutputTokens: 2222, contextWindow: 12345,
    modelTokenBudgets: { PRIVATE_MODEL: { reserveTokens: 999 } }, instructionBudgetBytes: 222, agentMode: 'build', offline: false,
    retryEnabled: true, retryMaxRetries: 6, providerBodyTimeoutMs: 1234, steeringMode: 'all' });
  user({ maxTurns: 11, temperature: 0.1 });
  const config = getRuntimeConfig(root);
  expect(config.maxTurns).toBe(11); expect(config.temperature).toBe(0.1);
  expect(config.theme).not.toBe('PRIVATE_THEME'); expect(config.maxOutputTokens).not.toBe(2222);
  expect(config.contextWindow).toBeUndefined(); expect(config.modelTokenBudgets).toEqual({});
  expect(config.instructionBudgetBytes).toBe(32768); expect(config.retryMaxRetries).not.toBe(6);
  expect(config.providerBodyTimeoutMs).not.toBe(1234); expect(config.steeringMode).toBe('one-at-a-time');
  expect(config.configValidation).toEqual({ valid: true, securityBlocked: false });
  const reason = decision === 'undecided' ? 'trust-not-established' : decision === 'untrusted' ? 'trust-denied' : 'trust-unavailable';
  expect(config.configProvenance.theme.rejected).toEqual([{ source: 'project', reason }]);
  expect(config.configDiagnostics.join(' ')).toContain(reason);
  expect(JSON.stringify([config.configDiagnostics, config.configProvenance])).not.toContain('PRIVATE');
});

it('retains safe restrictions, disabled values and project-first display leaves without trust', () => {
  project({ schemaVersion: 1, allowedTools: ['read', 'write'], disabledTools: ['bash'], hiddenToolPrefixes: ['browser_'],
    denyRules: [{ tool: 'write' }], enableMcpTools: false, instructionBudgetBytes: 0, offline: true, agentMode: 'plan',
    retryEnabled: false, retryMaxRetries: 0, providerRetryMaxRetries: 0, attentionOnIdle: true,
    tuiMode: 'regular', tui: { diagrams: 'off', statusItems: ['model'] } });
  user({ allowedTools: ['read', 'bash'], disabledTools: [], enableMcpTools: true, tui: { diagrams: 'streaming', statusItems: ['cost'] } });
  const config = getRuntimeConfig(root);
  expect(config).toMatchObject({ allowedTools: ['read'], disabledTools: ['bash'], hiddenToolPrefixes: ['browser_'], denyRules: [{ tool: 'write' }],
    enableMcpTools: false, instructionBudgetBytes: 0, offline: true, agentMode: 'plan', retryEnabled: false,
    retryMaxRetries: 0, providerRetryMaxRetries: 0, attentionOnIdle: true, tuiMode: 'regular', tui: { diagrams: 'off', statusItems: ['model'] } });
  expect(config.configDiagnostics).toEqual([]);
});

it('requires affirmative trust for ordinary project settings while source bans and user precedence still apply', () => {
  projectTrust.setProjectTrust(root, 'trusted');
  project({ maxTurns: 12, contextWindow: 30000, theme: 'project', provider: 'anthropic', cacheWarming: 'idle', allowUntrustedHooks: true });
  user({ maxTurns: 10 });
  const config = getRuntimeConfig(root, { theme: 'launch', instructionBudgetBytes: 123 });
  expect(config).toMatchObject({ maxTurns: 10, contextWindow: 30000, theme: 'launch', instructionBudgetBytes: 123, provider: 'openai', allowUntrustedHooks: false });
  expect(config.cacheWarming).not.toBe('idle');
  expect(config.configProvenance.maxTurns).toMatchObject({ sources: ['user'], shadowed: ['project'] });
  expect(config.configProvenance.provider.rejected).toEqual([{ source: 'project', reason: 'source-not-allowed' }]);
});

it('does not bypass invalid security input when project values are filtered or launch overrides are present', () => {
  project({ theme: 'PRIVATE', allowedTools: null });
  const config = getRuntimeConfig(root, { allowedTools: ['write'], allowUntrustedHooks: true });
  expect(config).toMatchObject({ allowedTools: [], enableMcpTools: false, allowUntrustedHooks: false, denyRules: [{ tool: '*' }] });
  expect(config.configValidation).toEqual({ valid: false, securityBlocked: true });
});

it('reloads a previously trusted snapshot before initial publication after revocation', () => {
  project({ maxTurns: 77 }); projectTrust.setProjectTrust(root, 'trusted');
  const runtimeConfig = getRuntimeConfig(root); expect(runtimeConfig.maxTurns).toBe(77);
  projectTrust.setProjectTrust(root, 'untrusted');
  const source = { projectRoot: root, session: { id: 'initial-trust' }, runtimeConfig };
  const context = { ...source, configuration: initialConfiguration(source) };
  expect(context.configuration.current.config.maxTurns).toBe(15);
  expect(context.configuration.current.config.configTrust.decision).toBe('untrusted');
  expect(configurationAdmission(context)()).toBeUndefined();
});

it('reloads for the final resumed workspace instead of applying another workspace snapshot', () => {
  const other = path.join(root, 'other'); fs.mkdirSync(other); project({ maxTurns: 77 }); project({ offline: true }, other);
  projectTrust.setProjectTrust(root, 'trusted');
  const source = { projectRoot: other, session: { id: 'different-root' }, runtimeConfig: getRuntimeConfig(root) };
  const config = initialConfiguration(source).current.config;
  expect(config.maxTurns).toBe(15); expect(config.offline).toBe(true); expect(config.configTrust.workspaceRoot).toBe(other);
});

it('invalidates admission when a workspace alias changes target without a trust-file edit', () => {
  const first = path.join(root, 'first'); const second = path.join(root, 'second'); const alias = path.join(root, 'alias');
  fs.mkdirSync(first); fs.mkdirSync(second); fs.symlinkSync(first, alias, 'dir');
  project({ maxTurns: 77 }, first); projectTrust.setProjectTrust(first, 'trusted');
  const source = { projectRoot: alias, session: { id: 'alias' }, runtimeConfig: getRuntimeConfig(alias) };
  const context = { ...source, configuration: initialConfiguration(source) }; const admission = configurationAdmission(context);
  expect(admission()).toBeUndefined();
  fs.rmSync(alias); fs.symlinkSync(second, alias, 'dir');
  expect(admission()).toBeDefined(); expect(configurationAdmission(context)()).toBeDefined();
  expect(refreshConfiguration(context).status).toBe('applied'); expect(context.configuration.current.config.maxTurns).toBe(15);
});

it('enforces TUI leaf trust independently and retains the rejected leaf origin through user fallback', () => {
  const original = tuiFields.diagrams;
  tuiFields.diagrams = { ...original, projectTrust: 'required' };
  try {
    project({ tui: { diagrams: 'off', statusItems: ['model'] } }); user({ tui: { diagrams: 'streaming' } });
    const config = getRuntimeConfig(root);
    expect(config.tui).toEqual({ diagrams: 'streaming', statusItems: ['model'] });
    expect(config.configProvenance.tui.children?.diagrams).toMatchObject({ sources: ['user'], rejected: [{ source: 'project', reason: 'trust-not-established' }] });
    expect(config.configProvenance.tui.children?.statusItems.sources).toEqual(['project']);
  } finally { tuiFields.diagrams = original; }
});

it('refuses a reload candidate read through an alias ABA before preparing its resources', () => {
  const approved = path.join(root, 'approved'); const refused = path.join(root, 'refused'); const alias = path.join(root, 'alias');
  fs.mkdirSync(approved); fs.mkdirSync(refused); fs.symlinkSync(refused, alias, 'dir');
  project({ maxTurns: 77, theme: 'PRIVATE_THEME' }, approved); projectTrust.setProjectTrust(approved, 'trusted');
  projectTrust.setProjectTrust(refused, 'untrusted');
  const source = { projectRoot: alias, session: { id: 'aba' }, runtimeConfig: getRuntimeConfig(alias) };
  const context = { ...source, configuration: initialConfiguration(source) }; const before = context.configuration.current.config;
  const load = runtimeFiles.getRuntimeConfig;
  vi.spyOn(runtimeFiles, 'getRuntimeConfig').mockImplementationOnce((directory, overrides) => {
    fs.rmSync(alias); fs.symlinkSync(approved, alias, 'dir');
    const candidate = load(directory, overrides);
    fs.rmSync(alias); fs.symlinkSync(refused, alias, 'dir');
    return candidate;
  });
  const prepare = vi.spyOn(themes, 'prepareThemeSelection');
  expect(refreshConfiguration(context).status).toBe('rejected'); expect(prepare).not.toHaveBeenCalled();
  expect(context.configuration.current.config).toBe(before); expect(before.maxTurns).toBe(15);
});

it('uses the captured canonical root when an alias changes during the trust decision', () => {
  const approved = path.join(root, 'approved'); const refused = path.join(root, 'refused'); const alias = path.join(root, 'alias');
  fs.mkdirSync(approved); fs.mkdirSync(refused); fs.symlinkSync(refused, alias, 'dir');
  project({ maxTurns: 77 }, refused); projectTrust.setProjectTrust(approved, 'trusted');
  projectTrust.setProjectTrust(refused, 'untrusted');
  const decide = projectTrust.decision.bind(projectTrust);
  vi.spyOn(projectTrust, 'decision').mockImplementationOnce(selected => {
    fs.rmSync(alias); fs.symlinkSync(approved, alias, 'dir');
    const decision = decide(selected);
    fs.rmSync(alias); fs.symlinkSync(refused, alias, 'dir');
    return decision;
  });
  const config = getRuntimeConfig(alias);
  expect(config.configTrust).toMatchObject({ workspaceRoot: refused, decision: 'untrusted' });
  expect(config.maxTurns).toBe(15);
});

it('reads project values from the same canonical root used for the trust decision', () => {
  const approved = path.join(root, 'approved'); const other = path.join(root, 'other'); const alias = path.join(root, 'alias');
  fs.mkdirSync(approved); fs.mkdirSync(other); fs.symlinkSync(approved, alias, 'dir');
  project({ maxTurns: 22 }, approved); project({ maxTurns: 77 }, other); projectTrust.setProjectTrust(approved, 'trusted');
  const decide = projectTrust.decision.bind(projectTrust);
  vi.spyOn(projectTrust, 'decision').mockImplementationOnce(selected => {
    const decision = decide(selected); fs.rmSync(alias); fs.symlinkSync(other, alias, 'dir'); return decision;
  });
  const config = getRuntimeConfig(alias);
  expect(config.configTrust.workspaceRoot).toBe(approved); expect(config.maxTurns).toBe(22);
  expect(config.configSources).toContain(getProjectConfigPath(approved));
});

it('retains a freshly loaded candidate revision when trust changes before initial binding is constructed', () => {
  const other = path.join(root, 'other'); fs.mkdirSync(other); project({ maxTurns: 77 }); projectTrust.setProjectTrust(root, 'trusted');
  const source = { projectRoot: root, session: { id: 'late-revoke' }, runtimeConfig: getRuntimeConfig(other) };
  const load = runtimeFiles.getRuntimeConfig;
  vi.spyOn(runtimeFiles, 'getRuntimeConfig').mockImplementationOnce((directory, overrides) => {
    const candidate = load(directory, overrides); projectTrust.setProjectTrust(root, 'untrusted'); return candidate;
  });
  const context = { ...source, configuration: initialConfiguration(source) };
  expect(configurationAdmission(context)()).toBeDefined();
  expect(context.configuration.current.binding.trustRevision).toBe(context.configuration.current.config.configTrust.revision);
});
