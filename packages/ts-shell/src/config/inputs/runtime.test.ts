import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath, getUserAuthPath } from '../runtimeConfig.js';
import { createConfigInputs } from './selection.js';
import { projectTrust } from '../../core/security/trust/store.js';
import * as document from '../document.js';
import { createProfileContext, withProfile } from '../../core/paths/profile/context.js';

let root: string;
let user: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-inputs-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_MAX_TURNS', '');
  user = getUserRuntimeConfigPath(); fs.mkdirSync(path.dirname(user), { recursive: true });
  projectTrust.setProjectTrust(root, 'session-only');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function write(name: string, values: unknown): string {
  const file = path.join(root, name); fs.writeFileSync(file, JSON.stringify(values)); return file;
}
function inputs(names: string[], source: 'user' | 'project' = 'user') {
  return createConfigInputs(names.map(file => ({ path: file, source })), root);
}

it('joins primary model preferences before explicit records replace their defaults and origins', () => {
  fs.writeFileSync(user, JSON.stringify({ modelPreferences: { providers: { openai: { model: 'primary-provider', thinkingEffort: 'high' } },
    connections: [{ id: 'relay', provider: 'openai', model: 'primary-model', thinkingEffort: 'low' }] } }));
  fs.writeFileSync(getUserAuthPath(), JSON.stringify({ provider: 'openai', activeProviderConnectionId: 'relay',
    providerConnections: [{ id: 'relay', provider: 'openai', apiKey: 'synthetic-primary' }] }), { mode: 0o600 });
  const file = write('explicit.json', { providerCredentials: { openai: { model: 'explicit-provider' } },
    providerConnections: [{ id: 'relay', provider: 'openai', apiKey: 'synthetic-explicit', model: 'explicit-model' }] });
  const config = getRuntimeConfig(root, undefined, inputs([file]));
  expect(config.providerConnections[0]).toMatchObject({ apiKey: 'synthetic-explicit', model: 'explicit-model' });
  expect(config.providerConnections[0].thinkingEffort).toBeUndefined();
  expect(config.providerCredentials.openai).toEqual({ model: 'explicit-provider' });
  expect(config.configProvenance.providerConnections.children?.['0'].children?.model.files?.[0]).toMatchObject({ path: file, position: 0 });
  expect(config.configProvenance).not.toHaveProperty('modelPreferences');
});

it('accepts explicit user preference envelopes with raw references and refuses orphan identities', () => {
  vi.stubEnv('PREFERENCE_MODEL', 'effective-input');
  const file = write('preferences.json', { providerConnections: [{ id: 'relay', provider: 'openai', model: 'legacy-input' }],
    modelPreferences: { providers: { openai: { model: '$PREFERENCE_MODEL' } },
      connections: [{ id: 'relay', provider: 'openai', model: '${PREFERENCE_MODEL}', thinkingEffort: null }] } });
  const config = getRuntimeConfig(root, undefined, inputs([file]));
  expect(config.providerConnections[0]).toMatchObject({ model: 'effective-input', thinkingEffort: null });
  expect(config.providerCredentials.openai?.model).toBe('effective-input');
  expect(config.configProvenance.providerConnections.children?.['0'].children?.model).toMatchObject({ environmentReference: true, files: [expect.objectContaining({ path: file, position: 0 })] });
  expect(fs.readFileSync(file, 'utf8')).toContain('${PREFERENCE_MODEL}');
  const orphan = write('orphan.json', { modelPreferences: { connections: [{ id: 'missing', provider: 'openai', model: 'unused' }] } });
  expect(() => getRuntimeConfig(root, undefined, inputs([orphan]))).toThrow('Explicit config input');
});

it('rejects project preference envelopes before accessing their environment references', () => {
  const file = write('project-preferences.json', { modelPreferences: { providers: { openai: { model: '$MISSING_PRIVATE_PREFERENCE' } } } });
  const config = getRuntimeConfig(root, undefined, inputs([file], 'project'));
  expect(config.providerCredentials).toEqual({});
  expect(config.configDiagnostics.join(' ')).toContain('source-not-allowed');
  expect(config.configDiagnostics.join(' ')).not.toContain('MISSING_PRIVATE_PREFERENCE');
});

it('resolves relative files once, retains repeated positions, and applies env and overrides last', () => {
  write('.cheers.json', { maxTurns: 10, theme: 'project' }); fs.writeFileSync(user, '{"maxTurns":20,"theme":"user"}');
  const first = write('first.json', { maxTurns: 30, theme: 'first' });
  write('second.json', { maxTurns: 40, theme: 'second' });
  const selected = inputs(['first.json', 'second.json', 'first.json']);
  const other = path.join(root, 'other'); fs.mkdirSync(other);
  expect(getRuntimeConfig(other, undefined, selected).maxTurns).toBe(30);
  expect(getRuntimeConfig(root, undefined, selected).configSources.slice(-3)).toEqual([first, path.join(root, 'second.json'), first]);
  vi.stubEnv('CHEERS_MAX_TURNS', '50');
  const config = getRuntimeConfig(root, { theme: 'launch' }, selected);
  expect(config.maxTurns).toBe(50); expect(config.theme).toBe('launch');
  expect(config.configInputs).toBe(selected);
  expect(Object.isFrozen(selected.files)).toBe(true);
});

it('keeps all security restrictions across personal overlays, including deliberate empty sets', () => {
  write('.cheers.json', { allowedTools: ['read', 'write'], disabledTools: ['edit'], denyRules: [{ tool: 'bash' }], enableMcpTools: false });
  write('one.json', { allowedTools: ['read', 'bash'], disabledTools: ['write'], denyRules: [{ tool: 'write' }], enableMcpTools: true });
  write('two.json', { allowedTools: [], disabledTools: [], denyRules: [], enableMcpTools: true, allowUntrustedHooks: true });
  const config = getRuntimeConfig(root, { allowedTools: ['read'] }, inputs(['one.json', 'two.json']));
  expect(config.allowedTools).toEqual([]); expect(config.disabledTools).toEqual(['edit', 'write']);
  expect(config.denyRules).toEqual([{ tool: 'bash' }, { tool: 'write' }]);
  expect(config.enableMcpTools).toBe(false); expect(config.allowUntrustedHooks).toBe(false);
});

it('keeps project leaf priority while later inputs of the same source win and empty status reveals the user', () => {
  write('.cheers.json', { tui: { diagrams: 'off', statusItems: ['model'] } });
  fs.writeFileSync(user, '{"tui":{"diagrams":"streaming","statusItems":["cost"],"composerShape":"box"}}');
  write('personal.json', { tui: { diagrams: 'streaming', statusItems: ['time'], composerShape: 'rail' } });
  write('project.json', { tui: { statusItems: [] } });
  const selected = createConfigInputs([{ path: 'personal.json', source: 'user' }, { path: 'project.json', source: 'project' }], root);
  const config = getRuntimeConfig(root, undefined, selected);
  expect(config.tui).toEqual({ diagrams: 'off', statusItems: ['time'], composerShape: 'rail' });
  expect(config.configProvenance.tui.children?.statusItems.sources).toEqual(['user']);
  expect(config.configProvenance.tui.children?.composerShape.files?.[0].position).toBe(0);
});

it('does not promote project inputs or resolve their rejected credential references', () => {
  const file = write('project.json', { source: 'user', providerConnections: [{ apiKey: '$MISSING_INPUT_SECRET' }], theme: 'unsafe-theme', allowedTools: [] });
  projectTrust.setProjectTrust(root, 'untrusted');
  const config = getRuntimeConfig(root, undefined, inputs([file], 'project'));
  expect(config.providerConnections).toEqual([]); expect(config.allowedTools).toEqual([]); expect(config.theme).toBe('dark');
  expect(config.configProvenance.providerConnections.rejected).toContainEqual({ source: 'project', reason: 'source-not-allowed' });
  expect(config.configProvenance.providerConnections.rejectedFiles?.[0]).toMatchObject({ path: file, source: 'project', position: 0, reason: 'source-not-allowed' });
  expect(config.configDiagnostics.join(' ')).not.toContain('MISSING_INPUT_SECRET');
});

it('records raw file revisions and shadowed origins without retaining private values or arbitrary map keys', () => {
  const first = write('one.json', { maxTurns: 31, providerCredentials: { openai: { apiKey: 'private-token' } }, modelTokenBudgets: { 'private-model': { reserveTokens: 1 } } });
  const second = write('two.json', { maxTurns: 41 });
  const config = getRuntimeConfig(root, undefined, inputs([first, second]));
  const trace = config.configProvenance.maxTurns;
  expect(trace.files).toEqual([{ path: second, revision: createHash('sha256').update(fs.readFileSync(second)).digest('hex'), source: 'user', position: 1 }]);
  expect(trace.shadowedFiles).toContainEqual(expect.objectContaining({ path: first, position: 0 }));
  expect(JSON.stringify(config.configProvenance)).not.toMatch(/private-token|private-model/);
});

it.each(['{broken', '[]', '', '{"maxTurns":0}', '{"tui":{"diagrams":5}}', '{"allowedTools":false}'])('fails startup for an explicitly invalid document: %s', text => {
  const file = write('bad.json', {}); fs.writeFileSync(file, text);
  expect(() => getRuntimeConfig(root, undefined, inputs([file]))).toThrow(/Explicit config input/);
});

it('refuses missing, excessive and non-UTF8 inputs without falling through to defaults', () => {
  expect(() => inputs(['missing.json'])).toThrow(/Explicit config input/);
  const file = write('one.json', {});
  expect(() => inputs(Array(33).fill(file))).toThrow(/resource-limit/);
  fs.writeFileSync(file, Buffer.from([0xff]));
  expect(() => getRuntimeConfig(root, undefined, inputs([file]))).toThrow(/invalid-utf8/);
  fs.writeFileSync(file, '{"padding":"' + 'x'.repeat(1024 * 1024) + '"}');
  expect(() => getRuntimeConfig(root, undefined, inputs([file]))).toThrow(/resource-limit/);
});

it('enforces the aggregate byte budget even when the same file is repeated', () => {
  const file = write('large.json', { padding: 'x'.repeat(950_000) });
  expect(() => getRuntimeConfig(root, undefined, inputs(Array(9).fill(file)))).toThrow(/resource-limit/);
});

it('detects alias retargeting and parent directory replacement but permits ordinary file replacement', () => {
  const first = write('one.json', { maxTurns: 31 }); const second = write('two.json', { maxTurns: 41 });
  const alias = path.join(root, 'alias.json'); fs.symlinkSync(first, alias);
  const selected = inputs([alias]);
  fs.unlinkSync(alias); fs.symlinkSync(second, alias);
  expect(() => getRuntimeConfig(root, undefined, selected)).toThrow(/identity-changed/);
  fs.unlinkSync(alias); fs.symlinkSync(first, alias);
  fs.renameSync(second, first);
  expect(getRuntimeConfig(root, undefined, selected).maxTurns).toBe(41);
  fs.mkdirSync(path.join(root, 'directory')); write('directory/config.json', {});
  const directory = inputs(['directory/config.json']);
  fs.renameSync(path.join(root, 'directory'), path.join(root, 'old-directory'));
  fs.mkdirSync(path.join(root, 'directory')); write('directory/config.json', {});
  expect(() => getRuntimeConfig(root, undefined, directory)).toThrow(/identity-changed/);
});

it('rejects the whole candidate when an earlier source changes during the multi-file read', () => {
  const first = write('one.json', { maxTurns: 31 }); const second = write('two.json', { theme: 'light' });
  const selected = inputs([first, second]); const original = document.readConfigSnapshot;
  vi.spyOn(document, 'readConfigSnapshot').mockImplementation(file => {
    const snapshot = original(file);
    if (file === second) fs.writeFileSync(first, '{"maxTurns":41}');
    return snapshot;
  });
  expect(() => getRuntimeConfig(root, undefined, selected)).toThrow(/changed/);
});

it('rejects another rotating account-auth owner while allowing the canonical primary alias', () => {
  const values = { providerCredentials: { openai: { accountAuth: { openai: { type: 'openai-chatgpt-account', accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', expiresAt: 12345 } } } } };
  const other = write('auth.json', values);
  expect(() => getRuntimeConfig(root, undefined, inputs([other]))).toThrow(/account-owner/);
  fs.writeFileSync(user, JSON.stringify(values));
  expect(getRuntimeConfig(root, undefined, inputs([user])).providerCredentials.openai?.accountAuth?.openai?.refreshToken).toBe('synthetic-refresh');
  const ownedAuth = path.join(path.dirname(user), 'auth.json');
  fs.writeFileSync(ownedAuth, JSON.stringify(values), { mode: 0o600 });
  expect(getRuntimeConfig(root, undefined, inputs([ownedAuth])).providerCredentials.openai?.accountAuth?.openai?.refreshToken).toBe('synthetic-refresh');
});

it('binds explicit inputs to their captured profile across asynchronous scopes', () => {
  const a = createProfileContext({ name: 'a', homeDir: root }); const b = createProfileContext({ name: 'b', homeDir: root });
  const file = write('one.json', { maxTurns: 31 });
  const selected = withProfile(a, () => inputs([file]));
  expect(withProfile(a, () => getRuntimeConfig(root, undefined, selected).maxTurns)).toBe(31);
  expect(() => withProfile(b, () => getRuntimeConfig(root, undefined, selected))).toThrow(/identity-changed/);
});
