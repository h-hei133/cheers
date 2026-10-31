import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProfileContext, withProfile, type ProfileContext } from '../../../core/paths/profile/context.js';
import { createProfile } from '../context.js';
import { planExport } from './plan.js';
import { applyExport } from './runtime.js';
import { readRuntimeConfigFileAt, readRuntimeConfigEditAt, writeRuntimeConfigFileAt } from '../../runtimeConfig.js';
import { getRuntimeConfig } from '../../runtimeConfig.js';
import { scopedRuntimeConfig } from '../../scope/projection.js';
import * as store from '../../../session/store/sessionFileStore.js';

let home: string; let source: ProfileContext; let target: ProfileContext;
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporary, { recursive: true });
  home = fs.mkdtempSync(path.join(temporary, 'profile-export-'));
  source = createProfileContext({ name: 'source', homeDir: home, env: {} });
  target = createProfile('rollback', source).profile;
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(home, { recursive: true, force: true }); });
function write(name: string, value: unknown, owner = source) {
  fs.writeFileSync(path.join(owner.root, name), JSON.stringify(value), { mode: 0o600 });
}
function exportCurrent() {
  return withProfile(source, () => { const plan = planExport(source, target.id); return applyExport(plan, plan.digest); });
}

it('exports current credentials and embedded defaults without exposing secrets or copying live state', () => {
  const auth = { provider: 'openai', activeProviderConnectionId: 'relay', providerCredentials: { openai: { apiKey: '${EXPORT_SECRET}', baseUrl: 'https://independent.invalid/v1', model: 'old-provider' } },
    providerConnections: [{ id: 'relay', provider: 'openai', status: 'connected', authType: 'api-key', apiKey: 'synthetic-current', baseUrl: 'https://relay.invalid/v1', model: 'old-named', thinkingEffort: 'high' }],
    accountPool: { openai: { connections: ['relay'], baseUrl: 'https://relay.invalid/v1' } }, unknownAuth: { token: 'synthetic-unknown' } };
  write('auth.json', auth);
  write('config.json', { maxTurns: 17, contextWindow: 12000, modelPreferences: { providers: { openai: { model: 'provider-model', thinkingEffort: null, serviceTier: 'flex' } },
    connections: [{ id: 'relay', provider: 'openai', model: 'named-model', thinkingEffort: null, serviceTier: 'priority' }] } });
  write('current-session.json', { active: true }); write('models.json', { providers: {} });
  const originals = ['config.json', 'auth.json'].map(name => fs.readFileSync(path.join(source.root, name)));
  withProfile(source, () => {
    const plan = planExport(source, target.id);
    expect(JSON.stringify(plan)).not.toMatch(/synthetic|EXPORT_SECRET|apiKey|modelPreferences/);
    expect(applyExport({ ...plan }, plan.digest).status).toBe('rejected');
    expect(fs.readdirSync(target.root)).toEqual([]);
    expect(applyExport(plan, plan.digest).status).toBe('complete');
  });
  expect(fs.readdirSync(target.root)).toEqual(['config.json']);
  const exported = JSON.parse(fs.readFileSync(path.join(target.root, 'config.json'), 'utf8'));
  expect(exported.modelPreferences).toBeUndefined();
  expect(exported.providerCredentials.openai).toEqual({ ...auth.providerCredentials.openai, model: 'provider-model', thinkingEffort: null, serviceTier: 'flex' });
  expect(exported.providerConnections[0]).toEqual({ ...auth.providerConnections[0], model: 'named-model', thinkingEffort: null, serviceTier: 'priority' });
  expect(exported.accountPool).toEqual(auth.accountPool); expect(exported.activeProviderConnectionId).toBe('relay');
  expect(exported.unknownAuth).toEqual(auth.unknownAuth); expect(exported.contextWindow).toBe(12000);
  expect(['config.json', 'auth.json'].map(name => fs.readFileSync(path.join(source.root, name)))).toEqual(originals);
  if (process.platform !== 'win32') expect(fs.statSync(path.join(target.root, 'config.json')).mode & 0o777).toBe(0o600);
});

it('keeps account token records and empty preference ownership intact', () => {
  const accountAuth = { google: { type: 'google-gemini-account', accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', expiresAt: 9000000000000, clientId: 'synthetic-client' } };
  write('auth.json', { provider: 'google', providerConnections: [{ id: 'native', provider: 'google', authType: 'account-auth', status: 'connected', accountAuth, model: 'old-model', thinkingEffort: 'high' }] });
  write('config.json', { modelPreferences: { connections: [{ id: 'native', provider: 'google' }] } });
  expect(exportCurrent().status).toBe('complete');
  const exported = JSON.parse(fs.readFileSync(path.join(target.root, 'config.json'), 'utf8'));
  expect(exported.providerConnections[0].accountAuth).toEqual(accountAuth);
  expect(exported.providerConnections[0].model).toBeUndefined(); expect(exported.providerConnections[0].thinkingEffort).toBeUndefined();
});

it('preserves cumulative restrictions and TUI leaves', () => {
  write('config.json', { allowedTools: ['read', 'write'], disabledTools: ['bash'], hiddenToolPrefixes: ['one'], denyRules: [{ tool: 'write' }], enableMcpTools: false,
    tui: { composerShape: 'default', statusItems: ['model'] } });
  write('auth.json', { allowedTools: ['read', 'bash'], disabledTools: ['read'], hiddenToolPrefixes: ['two'], denyRules: [{ tool: 'bash' }], enableMcpTools: true,
    tui: { composerShape: 'borderless' } });
  expect(exportCurrent().status).toBe('complete');
  const value = JSON.parse(fs.readFileSync(path.join(target.root, 'config.json'), 'utf8'));
  expect(value.allowedTools).toEqual(['read']); expect(value.disabledTools).toEqual(['bash', 'read']);
  expect(value.hiddenToolPrefixes).toEqual(['one', 'two']); expect(value.denyRules).toEqual([{ tool: 'write' }, { tool: 'bash' }]);
  expect(value.enableMcpTools).toBe(false);
  expect(value.tui).toEqual({ composerShape: 'borderless', statusItems: ['model'] });
});

it.each(['config.json', 'auth.json'])('preserves a single %s rule owner and its actual scoped result', name => {
  const workspace = path.join(home, 'workspace'); fs.mkdirSync(workspace);
  write(name, { maxTurns: 17, pathRules: [{ path: path.relative(source.root, workspace), settings: { maxTurns: 3 } }] });
  write(name === 'config.json' ? 'auth.json' : 'config.json', { provider: 'openai' });
  const before = withProfile(source, () => scopedRuntimeConfig(getRuntimeConfig(workspace), workspace).maxTurns);
  expect(before).toBe(3); expect(exportCurrent().status).toBe('complete');
  const value = JSON.parse(fs.readFileSync(path.join(target.root, 'config.json'), 'utf8'));
  expect(value.pathRules).toEqual([{ path: workspace, settings: { maxTurns: 3 } }]);
  const after = withProfile(target, () => scopedRuntimeConfig(getRuntimeConfig(workspace), workspace).maxTurns);
  expect(after).toBe(before);
});

it.each(['later-base', 'later-rule'])('refuses %s scope precedence that a legacy document cannot preserve', variant => {
  const workspace = path.join(home, 'workspace'); fs.mkdirSync(workspace);
  write('config.json', { pathRules: [{ path: workspace, settings: { maxTurns: 3 } }] });
  write('auth.json', variant === 'later-base' ? { maxTurns: 17 }
    : { pathRules: [{ path: home, settings: { maxTurns: 17 } }] });
  const before = withProfile(source, () => scopedRuntimeConfig(getRuntimeConfig(workspace), workspace).maxTurns);
  expect(before).toBe(17);
  const originals = ['config.json', 'auth.json'].map(name => fs.readFileSync(path.join(source.root, name)));
  withProfile(source, () => expect(() => planExport(source, target.id)).toThrow('scope precedence'));
  expect(fs.readdirSync(target.root)).toEqual([]);
  expect(['config.json', 'auth.json'].map(name => fs.readFileSync(path.join(source.root, name)))).toEqual(originals);
});

it.each(['config.json', 'auth.json'])('rejects changed or removed acquired %s before writing', name => {
  write('config.json', { maxTurns: 17 }); write('auth.json', { provider: 'openai' });
  withProfile(source, () => {
    const plan = planExport(source, target.id); fs.rmSync(path.join(source.root, name));
    expect(applyExport(plan, plan.digest).status).toBe('rejected'); expect(fs.readdirSync(target.root)).toEqual([]);
  });
});

it('rejects newly created auth, cancelled admission and occupied targets without overwrites', () => {
  write('config.json', { maxTurns: 17 });
  withProfile(source, () => {
    const plan = planExport(source, target.id); write('auth.json', { provider: 'openai' });
    expect(applyExport(plan, plan.digest).status).toBe('rejected'); expect(fs.readdirSync(target.root)).toEqual([]);
    const fresh = planExport(source, target.id);
    expect(applyExport(fresh, fresh.digest, () => 'Cancelled.').status).toBe('rejected');
    write('config.json', { retained: true }, target);
    const bytes = fs.readFileSync(path.join(target.root, 'config.json'));
    expect(applyExport(fresh, fresh.digest).status).toBe('rejected');
    expect(fs.readFileSync(path.join(target.root, 'config.json'))).toEqual(bytes);
    expect(() => planExport(source, source.id)).toThrow();
    expect(() => planExport(source, target.id)).toThrow();
  });
});

it('refuses a source change during staging and cleans private scratch before consumer publication', () => {
  write('config.json', { maxTurns: 17 });
  const original = fs.fsyncSync;
  vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => { original(fd); write('config.json', { maxTurns: 19 }); });
  expect(exportCurrent().status).toBe('rejected'); expect(fs.readdirSync(target.root)).toEqual([]);
});

it('reports retained lock cleanup as unknown even after a prepublication refusal', () => {
  write('config.json', { maxTurns: 17 });
  const originalSync = fs.fsyncSync;
  vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => { originalSync(fd); write('config.json', { maxTurns: 19 }); });
  vi.spyOn(store, 'withFileLock').mockImplementation((file, action, options) => {
    fs.writeFileSync(file, 'synthetic-retained-lock');
    try { return action(); }
    finally { options?.onReleaseError?.(); }
  });
  expect(exportCurrent().status).toBe('unknown'); expect(fs.readdirSync(target.root)).toEqual(['.profile-export.lock']);
});

it('reports a competing stage creator as unknown without removing its content', () => {
  write('config.json', { maxTurns: 17 });
  let retained = '';
  const original = fs.openSync;
  vi.spyOn(fs, 'openSync').mockImplementation((file, flags, mode) => {
    if (String(file).includes('.config-export-') && flags === 'wx') {
      retained = String(file); fs.writeFileSync(retained, 'synthetic-private', { mode: 0o600 });
    }
    return original(file, flags, mode);
  });
  expect(exportCurrent().status).toBe('unknown');
  expect(fs.readdirSync(target.root)).toEqual([path.basename(retained)]);
  expect(fs.readFileSync(retained, 'utf8')).toBe('synthetic-private');
});

it('does not remove a stage replaced before readback and reports unknown', () => {
  write('config.json', { maxTurns: 17 });
  const original = fs.fsyncSync; let replacement = '';
  vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => {
    original(fd); replacement = path.join(target.root, fs.readdirSync(target.root).find(name => name.startsWith('.config-export-'))!);
    fs.rmSync(replacement); fs.writeFileSync(replacement, 'external-replacement', { mode: 0o600 });
  });
  expect(exportCurrent().status).toBe('unknown'); expect(fs.readFileSync(replacement, 'utf8')).toBe('external-replacement');
  expect(fs.existsSync(path.join(target.root, 'config.json'))).toBe(false);
});

it('reports a racing exclusive publication as unverified and retains the competing file', () => {
  write('config.json', { maxTurns: 17 });
  const original = fs.linkSync;
  vi.spyOn(fs, 'linkSync').mockImplementation((stage, destination) => { fs.writeFileSync(destination, 'competing-file'); original(stage, destination); });
  expect(exportCurrent().status).toBe('unknown');
  expect(fs.readdirSync(target.root)).toEqual(['config.json']);
  expect(fs.readFileSync(path.join(target.root, 'config.json'), 'utf8')).toBe('competing-file');
});

it('reports a source change after publication as unknown while preserving the exported file', () => {
  write('config.json', { maxTurns: 17 });
  const original = fs.linkSync;
  vi.spyOn(fs, 'linkSync').mockImplementation((stage, destination) => { original(stage, destination); write('config.json', { maxTurns: 19 }); });
  expect(exportCurrent().status).toBe('unknown');
  expect(fs.readdirSync(target.root)).toEqual(['config.json']);
  expect(JSON.parse(fs.readFileSync(path.join(target.root, 'config.json'), 'utf8')).maxTurns).toBe(17);
});

it('never reports completion for a destination replaced with a symlink to its private stage', () => {
  if (process.platform === 'win32') return;
  write('config.json', { maxTurns: 17 });
  const original = fs.linkSync;
  vi.spyOn(fs, 'linkSync').mockImplementation((stage, destination) => { original(stage, destination); fs.rmSync(destination); fs.symlinkSync(stage, destination); });
  expect(exportCurrent().status).toBe('unknown');
  expect(fs.lstatSync(path.join(target.root, 'config.json')).isSymbolicLink()).toBe(true);
  expect(fs.readdirSync(target.root)).toEqual(['config.json']);
});

it('does not remove a replaced private stage or report its cleanup as complete', () => {
  write('config.json', { maxTurns: 17 });
  const original = fs.linkSync;
  vi.spyOn(fs, 'linkSync').mockImplementation((stage, destination) => {
    original(stage, destination); fs.rmSync(stage); fs.writeFileSync(stage, 'external-replacement', { mode: 0o600 });
  });
  expect(exportCurrent().status).toBe('unknown');
  const stage = fs.readdirSync(target.root).find(name => name.startsWith('.config-export-'))!;
  expect(fs.readFileSync(path.join(target.root, stage), 'utf8')).toBe('external-replacement');
  expect(JSON.parse(fs.readFileSync(path.join(target.root, 'config.json'), 'utf8')).maxTurns).toBe(17);
});

it('reads and migrates the exported legacy configuration in a fresh current profile', () => {
  write('auth.json', { provider: 'openai', providerCredentials: { openai: { apiKey: 'synthetic-key' } } });
  write('config.json', { maxTurns: 17, modelPreferences: { providers: { openai: { model: 'export-model', thinkingEffort: null, serviceTier: 'flex' } } } });
  expect(exportCurrent().status).toBe('complete');
  withProfile(target, () => {
    const file = path.join(target.root, 'config.json');
    expect(readRuntimeConfigFileAt(file).providerCredentials?.openai).toMatchObject({ model: 'export-model', thinkingEffort: null, serviceTier: 'flex', apiKey: 'synthetic-key' });
    const baseline = readRuntimeConfigEditAt(file); writeRuntimeConfigFileAt(file, { maxTurns: 19 }, baseline);
    expect(readRuntimeConfigFileAt(file).providerCredentials?.openai).toMatchObject({ model: 'export-model', thinkingEffort: null, serviceTier: 'flex' });
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).providerCredentials).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(path.join(target.root, 'auth.json'), 'utf8')).providerCredentials.openai.model).toBeUndefined();
  });
});
