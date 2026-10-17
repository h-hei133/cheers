import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath, CONFIG_FIELDS } from '../runtimeConfig.js';
import { projectTrust } from '../../core/security/trust/store.js';
import { createConfigInputs } from '../inputs/selection.js';
import { scopedRuntimeConfig, assertScopedModel } from './projection.js';
import { resolveConfigScope, resolveConfigTargets } from './resolution.js';
import { SCOPE_FIELDS } from './registry.js';

let home: string;
let root: string;
let user: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'config-scope-'));
  root = path.join(home, 'repo'); fs.mkdirSync(root); fs.mkdirSync(path.join(root, 'a/..cache'), { recursive: true });
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_MAX_TURNS', '');
  user = getUserRuntimeConfigPath(); fs.mkdirSync(path.dirname(user), { recursive: true });
  projectTrust.setProjectTrust(root, 'session-only');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });
function project(value: unknown) { fs.writeFileSync(path.join(root, '.cheers.json'), JSON.stringify(value)); }

it('applies broad then narrow per source, equivalent prefixes in order, and later base sources last', () => {
  project({ maxTurns: 1, pathRules: [
    { path: 'a/..cache', settings: { maxTurns: 3 } }, { path: 'a', settings: { maxTurns: 2 } },
    { path: './a/..cache', settings: { maxTurns: 4 } },
  ] });
  const original = getRuntimeConfig(root); const selected = scopedRuntimeConfig(original, path.join(root, 'a/..cache/new'));
  expect(selected.maxTurns).toBe(4); expect(selected.configDiagnostics).toContain('Equivalent configuration scope prefixes use declaration order.');
  expect(scopedRuntimeConfig(original, path.join(root, 'ab')).maxTurns).toBe(1);
  expect(original.maxTurns).toBe(1); expect(Object.isFrozen(selected)).toBe(true);
  fs.writeFileSync(user, '{"maxTurns":5}');
  expect(scopedRuntimeConfig(getRuntimeConfig(root), path.join(root, 'a/..cache/new')).maxTurns).toBe(5);
  vi.stubEnv('CHEERS_MAX_TURNS', '6');
  expect(scopedRuntimeConfig(getRuntimeConfig(root), path.join(root, 'a')).maxTurns).toBe(6);
});

it('binds user and explicit-file paths to their own canonical declaration directories', () => {
  fs.writeFileSync(user, JSON.stringify({ pathRules: [{ path: '../repo/a', settings: { maxTurns: 8 } }] }));
  const dir = path.join(home, 'inputs'); fs.mkdirSync(dir);
  const file = path.join(dir, 'overlay.json'); fs.writeFileSync(file, JSON.stringify({ pathRules: [{ path: '../repo/a', settings: { maxTurns: 9 } }] }));
  const inputs = createConfigInputs([{ path: file, source: 'user' }], home);
  const config = getRuntimeConfig(root, undefined, inputs);
  expect(scopedRuntimeConfig(config, path.join(root, 'a')).maxTurns).toBe(9);
  expect(resolveConfigScope(config.configScopes!, path.join(root, 'a')).matches.map(rule => rule.file)).toEqual([user, file]);
  expect(scopedRuntimeConfig(config, root).maxTurns).toBe(15);
});

it('intersects allowlists and preserves parent denials, disabled lists and false switches', () => {
  project({ allowedTools: ['read', 'write'], pathRules: [
    { path: '.', settings: { allowedTools: ['read'], disabledTools: ['write'], denyRules: [{ tool: 'bash' }], enableMcpTools: false } },
    { path: 'a', settings: { allowedTools: ['read', 'bash'], disabledTools: [], denyRules: [], enableMcpTools: true } },
  ] });
  const config = getRuntimeConfig(root); const selected = scopedRuntimeConfig(config, path.join(root, 'a'));
  expect(selected.allowedTools).toEqual(['read']); expect(selected.disabledTools).toEqual(['write']);
  expect(selected.denyRules).toEqual([{ tool: 'bash' }]); expect(selected.enableMcpTools).toBe(false);
  fs.writeFileSync(user, JSON.stringify({ pathRules: [{ path: '../repo/a', settings: { allowedTools: [] } }] }));
  expect(scopedRuntimeConfig(getRuntimeConfig(root), path.join(root, 'a')).allowedTools).toEqual([]);
});

it('keeps project trust and rejects every unregistered field before resolving secrets', () => {
  project({ pathRules: [{ path: 'a', settings: { temperature: 0.1, allowedTools: [] } }] });
  projectTrust.setProjectTrust(root, 'untrusted');
  const config = scopedRuntimeConfig(getRuntimeConfig(root), path.join(root, 'a'));
  expect(config.temperature).toBe(0.7); expect(config.allowedTools).toEqual([]);
  expect(config.configProvenance.temperature.rejected).toContainEqual({ source: 'project', reason: 'trust-denied' });
  for (const key of ['provider', 'providerCredentials', 'providerConnections', 'activeProviderConnectionId', 'allowUntrustedHooks', 'theme', 'tui', 'pathRules']) {
    project({ pathRules: [{ path: 'a', settings: { [key]: '$PRIVATE_SCOPE_VALUE' } }] });
    const rejected = getRuntimeConfig(root);
    expect(rejected.configValidation).toMatchObject({ valid: false, securityBlocked: true });
    expect(rejected.allowedTools).toEqual([]);
    expect(rejected.configDiagnostics.join(' ')).not.toMatch(/PRIVATE_SCOPE_VALUE|providerCredentials/);
  }
});

it('keeps aliases equivalent and refuses changed prefixes or declaration identities', () => {
  fs.symlinkSync('a', path.join(root, 'alias'));
  project({ pathRules: [{ path: 'alias', settings: { maxTurns: 2 } }] });
  const config = getRuntimeConfig(root);
  expect(scopedRuntimeConfig(config, path.join(root, 'alias')).maxTurns).toBe(2);
  expect(scopedRuntimeConfig(config, path.join(root, 'a')).maxTurns).toBe(2);
  fs.mkdirSync(path.join(root, 'b')); fs.unlinkSync(path.join(root, 'alias')); fs.symlinkSync('b', path.join(root, 'alias'));
  expect(() => scopedRuntimeConfig(config, path.join(root, 'a'))).toThrow(/identity/i);
});

it('meets all target restrictions and refuses incompatible ordinary settings without choosing the first', () => {
  fs.mkdirSync(path.join(root, 'b'));
  project({ pathRules: [{ path: 'a', settings: { allowedTools: ['read'], maxTurns: 2 } }, { path: 'b', settings: { allowedTools: ['write'], maxTurns: 3 } }] });
  const scopes = getRuntimeConfig(root).configScopes!;
  expect(resolveConfigTargets(scopes, [path.join(root, 'a/new'), path.join(root, 'b/new')]).settings.allowedTools).toEqual([]);
  expect(() => resolveConfigTargets(scopes, [path.join(root, 'a'), path.join(root, 'b')], 'session')).toThrow(/conflicting/);
});

it('never substitutes the global model for configured no-match or empty restrictions', () => {
  project({ pathRules: [{ path: 'a', settings: { allowedModels: ['openai/permitted'] } }] });
  const selected = scopedRuntimeConfig(getRuntimeConfig(root), path.join(root, 'a'));
  expect(() => assertScopedModel(selected, { provider: 'openai', model: 'other' })).toThrow(/not permitted/);
  expect(() => assertScopedModel(selected, { provider: 'openai', model: 'permitted' })).not.toThrow();
  expect(() => assertScopedModel({ allowedModels: [] }, { provider: 'openai', model: 'permitted' })).toThrow(/not permitted/);
  expect(() => assertScopedModel({}, { provider: 'openai', model: 'permitted' })).not.toThrow();
});

it('registers only public, sourced, validated operation fields with actual consumers', () => {
  for (const [key, scope] of Object.entries(SCOPE_FIELDS)) {
    const field = CONFIG_FIELDS[key as keyof typeof SCOPE_FIELDS];
    expect(field.scope).toEqual(scope); expect(field.sensitivity).toBe('public');
    expect(field.validate).toBeTypeOf('function'); expect(scope.consumers.length).toBeGreaterThan(0);
  }
});
