import { projectTrust } from '../core/security/trust/store.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CONFIG_FIELDS, getRuntimeConfig, getUserRuntimeConfigPath } from './runtimeConfig.js';
import { ConfigState, type ConfigBinding } from './state.js';
import { projectSessionModel } from '../session/model/projection.js';
import * as selection from '../session/model/state.js';

let root: string;
let file: string;
let binding: ConfigBinding;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-origins-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_MAX_TURNS', '');
  file = getUserRuntimeConfigPath(); fs.mkdirSync(path.dirname(file), { recursive: true });
  binding = { workspaceRoot: root, sessionId: 'one', trustRevision: 'trusted-1', overrides: {} };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function user(value: unknown) { fs.writeFileSync(file, JSON.stringify(value)); }
function project(value: unknown) { fs.writeFileSync(path.join(root, '.cheers.json'), JSON.stringify(value)); }

it('explains defaults, ordinary precedence, environment and frozen launch overrides', () => {
    projectTrust.setProjectTrust(root, 'session-only');
  project({ maxTurns: 10, theme: 'project', offline: false });
  user({ maxTurns: 20, theme: 'user' }); vi.stubEnv('CHEERS_MAX_TURNS', '30');
  const config = getRuntimeConfig(root, { theme: 'launch' }); const trace = config.configProvenance;
  expect(config.maxTurns).toBe(30); expect(config.theme).toBe('launch');
  expect(trace.maxTurns).toMatchObject({ sources: ['environment'], shadowed: ['project', 'user'] });
  expect(trace.theme).toMatchObject({ sources: ['override'], shadowed: ['project', 'user'] });
  expect(trace.offline.sources).toEqual(['project']); expect(trace.temperature.sources).toEqual(['default']);
  expect(trace.contextWindow.sources).toEqual(['default']); expect(config.contextWindow).toBeUndefined();
});

it('attributes TUI leaves independently, including empty project status fallback', () => {
  project({ tui: { diagrams: 'off', statusItems: [], composerShape: 'rail' } });
  user({ tui: { diagrams: 'streaming', statusItems: ['cost'], composerShape: 'box' } });
  const config = getRuntimeConfig(root); const trace = config.configProvenance.tui;
  expect(config.tui).toEqual({ diagrams: 'off', statusItems: ['cost'], composerShape: 'rail' });
  expect(trace.children?.composerShape).toMatchObject({ sources: ['project'], shadowed: ['user'] });
  expect(trace.children?.diagrams).toMatchObject({ sources: ['project'], shadowed: ['user'] });
  expect(trace.children?.statusItems).toMatchObject({ sources: ['user'], shadowed: ['project'] });
  expect(trace.sources).toEqual(['project', 'user']);
});

it('uses the default input shape when absent and rejects unsupported shapes without losing valid lower leaves', () => {
  const defaults = getRuntimeConfig(root);
  expect(defaults.tui?.composerShape ?? 'default').toBe('default');
  expect(defaults.configProvenance.tui.sources).toEqual(['default']);
  project({ tui: { composerShape: 'field' } });
  user({ tui: { composerShape: 'unknown', diagrams: 'off' } });
  const config = getRuntimeConfig(root);
  expect(config.configValidation.valid).toBe(false);
  expect(config.tui).toEqual({ composerShape: 'field', diagrams: 'off' });
  expect(config.configProvenance.tui.children?.composerShape.sources).toEqual(['project']);
  expect(config.configDiagnostics.join(' ')).toContain('tui.composerShape: invalid-value');
});

it('retains all security collection constraints and per-item contributors', () => {
  project({ allowedTools: ['read', 'write'], disabledTools: ['edit'], denyRules: [{ tool: 'bash' }], enableMcpTools: false });
  user({ allowedTools: ['read', 'bash'], disabledTools: ['edit', 'bash'], denyRules: [{ tool: 'write' }], enableMcpTools: true });
  const config = getRuntimeConfig(root, { allowedTools: ['read'] }); const trace = config.configProvenance;
  expect(config.allowedTools).toEqual(['read']); expect(trace.allowedTools.sources).toEqual(['project', 'user', 'override']);
  expect(trace.allowedTools.children?.['0'].sources).toEqual(['project', 'user', 'override']);
  expect(trace.disabledTools.children?.['0'].sources).toEqual(['project', 'user']);
  expect(trace.disabledTools.children?.['1'].sources).toEqual(['user']);
  expect(trace.denyRules.children?.['0'].children?.tool.sources).toEqual(['project']);
  expect(trace.denyRules.children?.['1'].children?.tool.sources).toEqual(['user']);
  expect(trace.enableMcpTools).toMatchObject({ sources: ['project'], shadowed: ['user'] });
  user({ allowedTools: [] });
  expect(getRuntimeConfig(root).configProvenance.allowedTools.sources).toEqual(['project', 'user']);
});

it('explains rejected sources and invalid values without including arbitrary keys or input contents', () => {
    projectTrust.setProjectTrust(root, 'session-only');
  project({ providerConnections: [{ id: 'private-id', provider: 'openai', apiKey: '$PRIVATE_VARIABLE' }], maxTurns: 12 });
  user({ maxTurns: 'private-value', 'private-unknown-key': 'private-value' });
  const config = getRuntimeConfig(root); const trace = config.configProvenance;
  expect(trace.providerConnections).toMatchObject({ sources: ['default'], rejected: [{ source: 'project', reason: 'source-not-allowed' }] });
  expect(trace.maxTurns).toMatchObject({ sources: ['project'], rejected: [{ source: 'user', reason: 'invalid-value' }] });
  expect(JSON.stringify(trace)).not.toMatch(/private|PRIVATE/);
});

it('names safety projections separately from valid source settings', () => {
  project({ allowedTools: false });
  const config = getRuntimeConfig(root, { allowUntrustedHooks: true });
  for (const field of ['allowedTools', 'denyRules', 'enableMcpTools', 'allowUntrustedHooks']) {
    expect(config.configProvenance[field].sources).toEqual(['safety']);
  }
  expect(config.configProvenance.allowedTools.rejected).toEqual([{ source: 'project', reason: 'invalid-value' }]);
});

it('tracks normalized and generated connection leaves and environment references without their values', () => {
  vi.stubEnv('PRIVATE_KEY', 'private-secret');
  user({ providerConnections: [{ id: 'private-id', provider: 'openai', apiKey: '${PRIVATE_KEY}', baseUrl: 'https://private.invalid///', createdAt: '  ' }],
    providerCredentials: { openai: { apiKey: '$$PRIVATE_KEY', model: '$PRIVATE_KEY' } },
    modelTokenBudgets: { 'private-model-id': { reserveTokens: 100 } } });
  const config = getRuntimeConfig(root); const trace = config.configProvenance;
  expect(JSON.stringify(trace)).not.toMatch(/private|PRIVATE/);
  const connection = trace.providerConnections.children?.['0'].children;
  expect(connection?.apiKey).toMatchObject({ sources: ['user'], environmentReference: true });
  expect(connection?.baseUrl).toMatchObject({ sources: ['user'], normalized: true });
  for (const key of ['authType', 'status', 'createdAt', 'updatedAt']) expect(connection?.[key].sources).toEqual(['derived']);
  expect(trace.providerCredentials.children?.openai.children?.apiKey.environmentReference).toBeUndefined();
  expect(trace.providerCredentials.children?.openai.children?.model.environmentReference).toBe(true);
  expect(trace.modelTokenBudgets.children?.['0'].children?.reserveTokens.sources).toEqual(['user']);
  expect(JSON.stringify(trace)).not.toMatch(/private|PRIVATE/);
});

it('keeps positional maps aligned and drops removed credential branches from the report', () => {
  project({ modelTokenBudgets: { 'private-first': { reserveTokens: 1 }, 'private-second': { keepRecentTokens: 2 } } });
  user({ modelTokenBudgets: { 'private-second': { keepRecentTokens: 22 }, 'private-first': { reserveTokens: 11 } },
    providerCredentials: { openai: { apiKey: '  ' }, google: { model: 'private-model' } } });
  const config = getRuntimeConfig(root); const trace = config.configProvenance;
  expect(config.modelTokenBudgets).toEqual({ 'private-second': { keepRecentTokens: 22 }, 'private-first': { reserveTokens: 11 } });
  expect(trace.modelTokenBudgets.children?.['0'].children?.keepRecentTokens.sources).toEqual(['user']);
  expect(trace.modelTokenBudgets.children?.['1'].children?.reserveTokens.sources).toEqual(['user']);
  expect(config.providerCredentials.openai).toBeUndefined();
  expect(trace.providerCredentials.children?.openai).toBeUndefined();
  expect(trace.providerCredentials.children?.google.children?.model.sources).toEqual(['user']);
  expect(JSON.stringify(trace)).not.toContain('private');
});

it('marks only matching session model leaves without attributing credentials to the session', () => {
  user({ activeProviderConnectionId: 'private-id', providerConnections: [{ id: 'private-id', provider: 'openai', apiKey: 'private-key', model: 'private-base' },
    { id: 'private-other', provider: 'openai', model: 'private-second' }] });
  const config = getRuntimeConfig(root);
  vi.spyOn(selection, 'readSessionModel').mockReturnValue({ connectionId: 'private-id', provider: 'openai', model: 'private-session-model' });
  const projected = projectSessionModel(config, 'one'); const trace = projected.configProvenance;
  expect(projected.providerConnections[0].model).toBe('private-session-model');
  expect(trace.providerConnections.children?.['0'].children?.model).toMatchObject({ sources: ['session'], shadowed: ['user'] });
  expect(trace.providerConnections.children?.['0'].children?.apiKey.sources).toEqual(['user']);
  expect(trace.providerConnections.children?.['1'].children?.model.sources).toEqual(['user']);
  expect(trace.providerCredentials.children?.openai.children?.model.sources).toEqual(['session']);
  expect(config.configProvenance.providerConnections.children?.['0'].children?.model.sources).toEqual(['user']);
  expect(JSON.stringify(trace)).not.toContain('private');
  expect(projectSessionModel({ ...config, activeProviderConnectionId: 'missing' }, 'one').configProvenance).toBe(config.configProvenance);
});

it('keeps accepted provenance after disk edits/rejected reload and separates installed display from restart preferences', () => {
  project({ maxTurns: 12, tuiMode: 'regular', tui: { diagrams: 'off' } });
  const state = new ConfigState(getRuntimeConfig(root), binding); const accepted = state.current.config.configProvenance;
  user({ maxTurns: 'bad', tuiMode: 'fullscreen' });
  expect(state.publish(state.begin(binding), getRuntimeConfig(root), binding).status).toBe('rejected');
  expect(state.current.config.configProvenance).toBe(accepted);
  user({ maxTurns: 20, tuiMode: 'fullscreen' });
  expect(state.publish(state.begin(binding), getRuntimeConfig(root), binding).restartRequired).toEqual(['tuiMode']);
  expect(state.current.config.configProvenance.maxTurns.sources).toEqual(['user']);
  expect(state.current.config.configProvenance.tuiMode.sources).toEqual(['project']);
  expect(state.current.requested.configProvenance.tuiMode.sources).toEqual(['user']);
  expect(Object.isFrozen(state.current.requested.configProvenance.tuiMode.sources)).toBe(true);
  state.recordDisplay({ tui: { diagrams: 'off', statusItems: ['cost'] } });
  expect(state.current.config.configProvenance.tui.children?.diagrams.sources).toEqual(['project']);
  expect(state.current.config.configProvenance.tui.children?.statusItems?.sources).toEqual(['runtime']);
  expect(state.current.requested.configProvenance.tui.children?.statusItems).toBeUndefined();
});

it('keeps field application and privacy policy in the same registry as source and merge policy', () => {
  expect(CONFIG_FIELDS.tui.application).toBe('restart'); expect(CONFIG_FIELDS.theme.application).toBe('immediate');
  expect(CONFIG_FIELDS.offline.application).toBe('next operation'); expect(CONFIG_FIELDS.schemaVersion.application).toBe('metadata');
  expect(CONFIG_FIELDS.providerConnections.sensitivity).toBe('personal');
  expect(CONFIG_FIELDS.allowUntrustedHooks.sources).toEqual(['override']);
});
