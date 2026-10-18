import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, type OpenAIAccountAuthConfig, type RuntimeConfigFile } from '../../../config/runtimeConfig.js';
import { resolveProviderCredential } from '../../shell/providerCredentials.js';
import { renewStoredAccount } from './renewal.js';
import * as store from '../../../session/store/sessionFileStore.js';
import * as authorization from '../../../provider/request/authorization.js';
import * as persistence from '../../../config/persistence.js';
import { ConfigWriteError } from '../../../config/outcome.js';
import { acquireRefreshLease, markRefreshDispatched, markRefreshUnknown, refreshLineage } from './lease.js';
import { projectModelSelection } from '../../../session/model/projection.js';

let home: string;
let root: string;
let file: string;
const auth = (name = 'a'): OpenAIAccountAuthConfig => ({ type: 'openai-chatgpt-account', accessToken: `old-${name}`,
  refreshToken: `refresh-${name}`, expiresAt: 1, accountId: name });
const connection = (id: string) => ({ id, provider: 'openai' as const, authType: 'account-auth' as const,
  accountAuth: { openai: auth(id) }, baseUrl: 'https://account.invalid/v1', status: 'connected' as const,
  createdAt: '2026-01-01', updatedAt: id === 'a' ? '2026-01-03' : '2026-01-02' });
const initial = (): RuntimeConfigFile => ({ provider: 'openai', activeProviderConnectionId: 'a',
  providerConnections: [connection('a'), connection('b')], providerCredentials: { openai: { accountAuth: { openai: auth() } } } });
function write(value: RuntimeConfigFile) { fs.writeFileSync(file, JSON.stringify(value)); }
function read(): RuntimeConfigFile { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function response() { return new Response(JSON.stringify({ access_token: 'fresh-a', refresh_token: 'rotated-a', expires_in: 3600 }),
  { headers: { 'Content-Type': 'application/json' } }); }
function request(change: () => void = () => {}) {
  const resolution = resolveProviderCredential({ runtimeConfig: getRuntimeConfig(root), env: {} });
  const fetchImpl = vi.fn(async () => { change(); return response(); }) as unknown as typeof fetch;
  return { workspaceRoot: root, resolution, fetchImpl };
}
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'account-renewal-')); root = path.join(home, 'workspace');
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true }); fs.mkdirSync(path.join(home, '.cheers'));
  file = path.join(home, '.cheers', 'config.json');
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('OPENAI_API_KEY', '');
  write(initial());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

it('renews only the captured account and its exact mirror while preserving other settings and ordering', async () => {
  const before = read(); const input = request(() => write({ ...read(), theme: 'light' }));
  const result = await renewStoredAccount(input); const saved = read();
  expect(result).toMatchObject({ stored: true, writeState: 'persisted', accountAuth: { accessToken: 'fresh-a', refreshToken: 'rotated-a', accountId: 'a' } });
  expect(saved.providerConnections?.[0]?.accountAuth?.openai).toEqual(result.accountAuth);
  expect(saved.providerConnections?.[1]).toEqual(before.providerConnections?.[1]);
  expect(saved.providerConnections?.[0]?.updatedAt).toBe(before.providerConnections?.[0]?.updatedAt);
  expect(saved.providerCredentials?.openai?.accountAuth?.openai).toEqual(result.accountAuth);
  expect(saved.theme).toBe('light'); expect(input.fetchImpl).toHaveBeenCalledOnce();
});

it('does not replace a different fallback account and keeps config-source renewal distinct', async () => {
  write({ ...initial(), providerCredentials: { openai: { accountAuth: { openai: auth('fallback') } } } });
  const result = await renewStoredAccount(request()); expect(result.stored).toBe(true);
  expect(read().providerCredentials?.openai?.accountAuth?.openai).toEqual(auth('fallback'));
  write({ provider: 'openai', providerCredentials: { openai: { baseUrl: 'https://config.invalid/v1', accountAuth: { openai: auth() } } } });
  const second = await renewStoredAccount(request()); expect(second.stored).toBe(true);
  expect(read().providerConnections).toBeUndefined(); expect(read().providerCredentials?.openai?.accountAuth?.openai).toEqual(second.accountAuth);
});

it('renews the explicitly selected session account while leaving the profile default and its mirror unchanged', async () => {
  const before = read();
  const config = projectModelSelection(getRuntimeConfig(root), { connectionId: 'b', connectionScope: 'session', provider: 'openai', model: 'gpt-5.3-codex' });
  const resolution = resolveProviderCredential({ runtimeConfig: config, env: {} });
  expect(resolution.selection?.connectionId).toBe('b');
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ access_token: 'fresh-b', refresh_token: 'rotated-b', expires_in: 3600 }),
    { headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
  const result = await renewStoredAccount({ workspaceRoot: root, resolution, fetchImpl });
  expect(result).toMatchObject({ stored: true, writeState: 'persisted', accountAuth: { accessToken: 'fresh-b', accountId: 'b' } });
  expect(fetchImpl).toHaveBeenCalledOnce();
  expect(read().activeProviderConnectionId).toBe('a');
  expect(read().providerConnections?.[0]).toEqual(before.providerConnections?.[0]);
  expect(read().providerCredentials).toEqual(before.providerCredentials);
  expect(read().providerConnections?.[1]?.accountAuth?.openai).toEqual(result.accountAuth);
});

it('renews an explicitly selected provider account without borrowing or updating a named account', async () => {
  const before = read();
  const config = projectModelSelection(getRuntimeConfig(root), { connectionScope: 'provider', provider: 'openai', model: 'gpt-5.3-codex' });
  const resolution = resolveProviderCredential({ runtimeConfig: config, env: {} });
  expect(resolution.selection?.credentialScope).toBe('provider');
  expect(resolution.credential?.source).toBe('config');
  expect(resolution.credential?.connectionId).toBeUndefined();
  const fetchImpl = vi.fn(async () => response()) as unknown as typeof fetch;
  const result = await renewStoredAccount({ workspaceRoot: root, resolution, fetchImpl });
  expect(result).toMatchObject({ stored: true, writeState: 'persisted', accountAuth: { accessToken: 'fresh-a' } });
  expect(read().providerConnections).toEqual(before.providerConnections);
  expect(read().activeProviderConnectionId).toBe('a');
  expect(read().providerCredentials?.openai?.accountAuth?.openai).toEqual(result.accountAuth);
  expect(fetchImpl).toHaveBeenCalledOnce();
});

it.each(['pool', 'credential'])('refuses a late provider-account renewal after its %s authorization changes', async change => {
  const config = projectModelSelection(getRuntimeConfig(root), { connectionScope: 'provider', provider: 'openai', model: 'gpt-5.3-codex' });
  const resolution = resolveProviderCredential({ runtimeConfig: config, env: {} });
  const before = read();
  const fetchImpl = vi.fn(async () => {
    write(change === 'pool' ? { ...read(), accountPool: { openai: { connections: ['a'] } } }
      : { ...read(), providerCredentials: {} });
    return response();
  }) as unknown as typeof fetch;
  const result = await renewStoredAccount({ workspaceRoot: root, resolution, fetchImpl });
  expect(result).toMatchObject({ stored: false, writeState: 'unchanged' });
  expect(result.accountAuth).toBeUndefined();
  expect(read().providerConnections).toEqual(before.providerConnections);
  expect(fetchImpl).toHaveBeenCalledOnce();
});

it.each(['delete', 'relogin'])('refuses a late session-account rotation after %s without changing the default account', async change => {
  const before = read();
  const config = projectModelSelection(getRuntimeConfig(root), { connectionId: 'b', connectionScope: 'session', provider: 'openai', model: 'gpt-5.3-codex' });
  const resolution = resolveProviderCredential({ runtimeConfig: config, env: {} });
  const fetchImpl = vi.fn(async () => {
    write({ ...read(), providerConnections: change === 'delete' ? [connection('a')]
      : [connection('a'), { ...connection('b'), accountAuth: { openai: auth('new-b') } }] });
    return response();
  }) as unknown as typeof fetch;
  const result = await renewStoredAccount({ workspaceRoot: root, resolution, fetchImpl });
  expect(result).toMatchObject({ stored: false, writeState: 'unchanged' });
  expect(result.accountAuth).toBeUndefined(); expect(fetchImpl).toHaveBeenCalledOnce();
  expect(read().providerConnections?.[0]).toEqual(before.providerConnections?.[0]);
  expect(read().providerCredentials).toEqual(before.providerCredentials);
});

it.each(['relogin', 'delete', 'selection', 'endpoint', 'fallback-order', 'provider', 'model'])('refuses a delayed response after %s changes', kind => {
  if (kind === 'fallback-order') write({ ...initial(), activeProviderConnectionId: undefined });
  const input = request(() => {
    const latest = read(); const records = [...latest.providerConnections!];
    if (kind === 'relogin') records[0] = { ...records[0]!, accountAuth: { openai: auth('new-login') } };
    if (kind === 'delete') records.splice(0, 1);
    if (kind === 'endpoint') records[0] = { ...records[0]!, baseUrl: 'https://new.invalid/v1' };
    if (kind === 'model') records[0] = { ...records[0]!, model: 'concurrent-model' };
    if (kind === 'fallback-order') records[1] = { ...records[1]!, updatedAt: '2026-01-04' };
    write({ ...latest, providerConnections: records,
      ...(kind === 'selection' || kind === 'delete' ? { activeProviderConnectionId: 'b' } : {}),
      ...(kind === 'provider' ? { provider: 'google' } : {}) });
  });
  return renewStoredAccount(input).then(result => {
    expect(result.stored).toBe(false); expect(result.accountAuth).toBeUndefined(); expect(result.writeState).toBe('unchanged');
    expect(result.failure).toBeDefined(); expect(fs.readFileSync(file, 'utf8')).not.toContain('"fresh-a"');
  });
});

it('checks a fallback selector again inside the configuration lock', async () => {
  write({ ...initial(), activeProviderConnectionId: undefined }); const input = request(); const lock = store.withFileLock;
  vi.spyOn(store, 'withFileLock').mockImplementation((name, run, options) => lock(name, () => {
    const current = read(); write({ ...current, providerConnections: [current.providerConnections![0]!,
      { ...current.providerConnections![1]!, updatedAt: '2026-01-04' }] }); return run();
  }, options));
  const result = await renewStoredAccount(input);
  expect(result).toMatchObject({ stored: false, writeState: 'unchanged' }); expect(result.accountAuth).toBeUndefined();
  expect(fs.readFileSync(file, 'utf8')).not.toContain('"fresh-a"');
});

it('never hands unverified tokens to a caller when a writer silently drops the save', async () => {
  const before = fs.readFileSync(file); vi.spyOn(store, 'writeTextFileAtomic').mockImplementation(() => {});
  const result = await renewStoredAccount(request());
  expect(result).toMatchObject({ stored: false, writeState: 'unknown' }); expect(result.accountAuth).toBeUndefined();
  expect(fs.readFileSync(file)).toEqual(before); expect(result.failure).toContain('verification-failed');
});

it('verifies current selection after the write instead of returning a merely saved target token', async () => {
  const writer = store.writeTextFileAtomic;
  vi.spyOn(store, 'writeTextFileAtomic').mockImplementation((name, text) => {
    writer(name, text); write({ ...read(), activeProviderConnectionId: 'b' });
  });
  const result = await renewStoredAccount(request());
  expect(result).toMatchObject({ stored: false, writeState: 'unknown' }); expect(result.accountAuth).toBeUndefined();
  expect(read().activeProviderConnectionId).toBe('b');
});

it('lets shared callers independently confirm the same rotated credential without changing account metadata', async () => {
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  const input = request(); const fetchImpl = vi.fn(async () => { await pending; return response(); }) as unknown as typeof fetch;
  const first = renewStoredAccount({ ...input, fetchImpl }); const second = renewStoredAccount({ ...input, fetchImpl });
  release(); const results = await Promise.all([first, second]);
  expect(fetchImpl).toHaveBeenCalledOnce(); expect(results.every(result => result.stored)).toBe(true);
  expect(results.map(result => result.writeState).sort()).toEqual(['persisted', 'unchanged']);
  expect(results[0].accountAuth).toEqual(results[1].accountAuth);
});

it('does not trust a shared response with different account metadata or expose provider failures', async () => {
  vi.spyOn(authorization, 'renewAccountAuthIfExpiring').mockResolvedValueOnce({ renewed: false,
    accountAuth: { ...auth('wrong-account'), accessToken: 'PRIVATE_FRESH' } });
  const before = fs.readFileSync(file); const mismatch = await renewStoredAccount(request());
  expect(mismatch.accountAuth).toBeUndefined(); expect(mismatch.stored).toBe(false); expect(fs.readFileSync(file)).toEqual(before);
  const input = request(); input.fetchImpl = vi.fn(async () => { throw new Error('PRIVATE_FAILURE_BODY'); }) as unknown as typeof fetch;
  const failure = await renewStoredAccount(input); expect(failure.accountAuth).toBeUndefined();
  expect(JSON.stringify([mismatch, failure])).not.toContain('PRIVATE');
});

it('finishes conditional storage after exchange even if operation admission is revoked', async () => {
  let revoked = false; const input = request(() => { revoked = true; });
  const result = await renewStoredAccount({ ...input, admission: () => revoked ? 'operation ended' : undefined });
  expect(result.stored).toBe(true); expect(read().providerConnections?.[0]?.accountAuth?.openai).toEqual(result.accountAuth);
  expect(revoked).toBe(true);
});

it.each(['accessToken', 'refreshToken', 'accountId'])('rejects changed environment reference %s before saving', async field => {
  vi.stubEnv('RENEWAL_VALUE', field === 'accessToken' ? 'old-a' : field === 'refreshToken' ? 'refresh-a' : 'a');
  const value = initial(); value.providerConnections![0]!.accountAuth!.openai = { ...auth(), [field]: '${RENEWAL_VALUE}' };
  write(value); const before = fs.readFileSync(file);
  const result = await renewStoredAccount(request(() => vi.stubEnv('RENEWAL_VALUE', 'changed')));
  expect(result).toMatchObject({ stored: false, writeState: 'unchanged' }); expect(result.accountAuth).toBeUndefined();
  expect(fs.readFileSync(file)).toEqual(before);
});

it('renews interpolated credentials without copying unrelated placeholders into tokens', async () => {
  vi.stubEnv('RENEWAL_ACCESS', 'old-a'); vi.stubEnv('RENEWAL_REFRESH', 'refresh-a');
  const value = initial(); value.providerConnections![0]!.accountAuth!.openai = {
    ...auth(), accessToken: '${RENEWAL_ACCESS}', refreshToken: '${RENEWAL_REFRESH}',
  }; write(value);
  const result = await renewStoredAccount(request());
  expect(result).toMatchObject({ stored: true, accountAuth: { accessToken: 'fresh-a', refreshToken: 'rotated-a' } });
  expect(read().providerConnections?.[1]).toEqual(value.providerConnections?.[1]);
});

it('rejects a configuration symlink switch without writing either credential store', async () => {
  const first = path.join(home, 'first.json'); const second = path.join(home, 'second.json');
  fs.renameSync(file, first); fs.writeFileSync(second, fs.readFileSync(first)); fs.symlinkSync(first, file);
  const before = fs.readFileSync(first); const input = request(() => { fs.unlinkSync(file); fs.symlinkSync(second, file); });
  const result = await renewStoredAccount(input);
  expect(result).toMatchObject({ stored: false, writeState: 'unchanged' }); expect(result.accountAuth).toBeUndefined();
  expect(fs.readFileSync(first)).toEqual(before); expect(fs.readFileSync(second)).toEqual(before);
});

it('checks source authority again inside the configuration lock', async () => {
  const first = path.join(home, 'first.json'); const second = path.join(home, 'second.json');
  fs.renameSync(file, first); fs.writeFileSync(second, fs.readFileSync(first)); fs.symlinkSync(first, file);
  const before = fs.readFileSync(first); const input = request(); const lock = store.withFileLock;
  vi.spyOn(store, 'withFileLock').mockImplementation((name, run, options) => lock(name, () => {
    fs.unlinkSync(file); fs.symlinkSync(second, file); return run();
  }, options));
  const result = await renewStoredAccount(input);
  expect(result).toMatchObject({ stored: false, writeState: 'unchanged' }); expect(result.accountAuth).toBeUndefined();
  expect(fs.readFileSync(first)).toEqual(before); expect(fs.readFileSync(second)).toEqual(before);
});

it('keeps failed lock cleanup visible with the confirmed write state and no usable token', async () => {
  vi.spyOn(persistence, 'persistConfigEdit').mockImplementation(() => { throw new ConfigWriteError('lock-failed', 'persisted', true); });
  const input = request(); const result = await renewStoredAccount(input);
  expect(input.fetchImpl).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ stored: false, writeState: 'persisted', cleanupFailed: true });
  expect(result.failure).toContain('write state: persisted; lock cleanup failed'); expect(result.accountAuth).toBeUndefined();
});

it('rejects a new preferred configuration while renewing a fallback source', async () => {
  const preferred = file; const legacy = path.join(home, '.cheer', 'config.json');
  fs.mkdirSync(path.dirname(legacy)); fs.renameSync(preferred, legacy); file = legacy;
  const before = fs.readFileSync(legacy); const input = request(() => fs.writeFileSync(preferred, before));
  const result = await renewStoredAccount(input);
  expect(result).toMatchObject({ stored: false, writeState: 'unchanged' }); expect(result.accountAuth).toBeUndefined();
  expect(fs.readFileSync(legacy)).toEqual(before); expect(fs.readFileSync(preferred)).toEqual(before);
});

it.each(['clientId', 'accountEmail'])('rejects shared Google tokens carrying different %s metadata', async field => {
  const google = { type: 'google-gemini-account' as const, accessToken: 'old', refreshToken: 'refresh', expiresAt: 1,
    clientId: 'client-a', accountEmail: 'a@example.test' };
  write({ provider: 'google', providerCredentials: { google: { accountAuth: { google } } } });
  const renewal = vi.spyOn(authorization, 'renewAccountAuthIfExpiring').mockResolvedValue({ renewed: false,
    accountAuth: { ...google, [field]: 'different', accessToken: 'PRIVATE_FRESH' } });
  const before = fs.readFileSync(file); const result = await renewStoredAccount(request());
  expect(result).toMatchObject({ stored: false, writeState: 'unchanged' }); expect(result.accountAuth).toBeUndefined();
  expect(renewal).toHaveBeenCalledOnce(); expect(result.failure).toBeDefined();
  expect(JSON.stringify(result)).not.toContain('PRIVATE'); expect(fs.readFileSync(file)).toEqual(before);
});

it.each(['same-provider', 'other-provider'])('rejects ambiguous normalized connection IDs before exchange (%s)', async kind => {
  const value = initial(); value.providerConnections![1] = kind === 'same-provider'
    ? { ...connection('b'), id: ' a ' }
    : { id: ' a ', provider: 'google', authType: 'api-key', apiKey: 'test-google', status: 'connected' };
  write(value); const before = fs.readFileSync(file); const input = request();
  const result = await renewStoredAccount(input);
  expect(result).toMatchObject({ stored: false, writeState: 'unchanged' }); expect(result.failure).toBeDefined();
  expect(input.fetchImpl).not.toHaveBeenCalled(); expect(fs.readFileSync(file)).toEqual(before);
});

it.each(['active', 'dangling'])('guards cross-provider selection topology inside the config-slot lock (%s)', async kind => {
  write({ activeProviderConnectionId: 'a', providerConnections: [
    { id: 'g', provider: 'google', authType: 'api-key', apiKey: 'test-google', status: 'connected' },
    { id: kind === 'active' ? 'a' : 'o', provider: 'openai', authType: 'api-key', status: 'connected' },
  ], providerCredentials: { openai: { accountAuth: { openai: auth() } } } });
  const input = request(); expect(input.resolution.credential?.source).toBe('config');
  const lock = store.withFileLock;
  vi.spyOn(store, 'withFileLock').mockImplementation((name, run, options) => lock(name, () => {
    const current = read(); write({ ...current, providerConnections: [
      { ...current.providerConnections![0]!, id: 'a' }, current.providerConnections![1]!,
    ] }); return run();
  }, options));
  const result = await renewStoredAccount(input);
  expect(input.fetchImpl).toHaveBeenCalledOnce(); expect(result).toMatchObject({ stored: false, writeState: 'unchanged' });
  expect(result.accountAuth).toBeUndefined(); expect(read().providerCredentials?.openai?.accountAuth?.openai).toEqual(auth());
});

it('preserves raw identity references in each selected and mirrored slot during successful rotation', async () => {
  vi.stubEnv('RENEWAL_ACCOUNT', 'a'); const value = initial();
  value.providerConnections![0]!.accountAuth!.openai = { ...auth(), accountId: '${RENEWAL_ACCOUNT}' };
  value.providerCredentials!.openai!.accountAuth!.openai = { ...auth(), accountId: ' a ' }; write(value);
  const input = request(); const result = await renewStoredAccount(input);
  expect(result).toMatchObject({ stored: true, accountAuth: { accountId: 'a', accessToken: 'fresh-a' } });
  expect(input.fetchImpl).toHaveBeenCalledOnce();
  expect(read().providerConnections?.[0]?.accountAuth?.openai?.accountId).toBe('${RENEWAL_ACCOUNT}');
  expect(read().providerCredentials?.openai?.accountAuth?.openai?.accountId).toBe(' a ');
  expect(read().providerCredentials?.openai?.accountAuth?.openai?.accessToken).toBe('fresh-a');
});

it('preserves Google client and email references during successful rotation', async () => {
  vi.stubEnv('RENEWAL_CLIENT', 'client-a'); vi.stubEnv('RENEWAL_EMAIL', 'a@example.test');
  const google = { type: 'google-gemini-account' as const, accessToken: 'old', refreshToken: 'refresh', expiresAt: 1,
    clientId: '${RENEWAL_CLIENT}', accountEmail: '${RENEWAL_EMAIL}' };
  write({ provider: 'google', providerCredentials: { google: { accountAuth: { google } } } });
  const input = request(); const result = await renewStoredAccount(input);
  expect(input.fetchImpl).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ stored: true, accountAuth: { accessToken: 'fresh-a', clientId: 'client-a', accountEmail: 'a@example.test' } });
  expect(read().providerCredentials?.google?.accountAuth?.google).toEqual({ ...google,
    accessToken: 'fresh-a', refreshToken: 'rotated-a', expiresAt: result.accountAuth!.expiresAt });
});

it('rejects a real shared exchange from another account identity with the same refresh token', async () => {
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  const input = request(); const fetchImpl = vi.fn(async () => { await pending; return response(); }) as unknown as typeof fetch;
  const first = authorization.renewAccountAuthIfExpiring({ provider: 'openai',
    credential: { accountAuth: { ...auth(), accountId: 'other-account' } }, fetchImpl });
  const second = renewStoredAccount({ ...input, fetchImpl }); release();
  const [, rejected] = await Promise.all([first, second]);
  expect(fetchImpl).toHaveBeenCalledOnce(); expect(rejected).toMatchObject({ stored: false, writeState: 'unchanged' });
  expect(rejected.failure).toBeDefined(); expect(rejected.accountAuth).toBeUndefined();
  expect(read().providerConnections?.[0]?.accountAuth?.openai).toEqual(auth());
});

it('checks normalized identity after storage verification even when raw selectors remain identical', async () => {
  vi.stubEnv('RENEWAL_ACCOUNT', 'a'); const value = initial();
  value.providerConnections![0]!.accountAuth!.openai = { ...auth(), accountId: '${RENEWAL_ACCOUNT}' }; write(value);
  const persist = persistence.persistConfigEdit;
  vi.spyOn(persistence, 'persistConfigEdit').mockImplementation((...args) => {
    const result = persist(...args); vi.stubEnv('RENEWAL_ACCOUNT', 'new-identity'); return result;
  });
  const result = await renewStoredAccount(request());
  expect(result).toMatchObject({ stored: false, writeState: 'persisted' }); expect(result.accountAuth).toBeUndefined();
  expect(result.failure).toContain('verification-failed');
});

it('lets a shared follower recover storage after its leader fails to write', async () => {
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  const input = request(); const fetchImpl = vi.fn(async () => { await pending; return response(); }) as unknown as typeof fetch;
  const writer = store.writeTextFileAtomic;
  vi.spyOn(store, 'writeTextFileAtomic').mockImplementationOnce(() => { throw new Error('PRIVATE_WRITE_FAILURE'); }).mockImplementation(writer);
  const first = renewStoredAccount({ ...input, fetchImpl }); const second = renewStoredAccount({ ...input, fetchImpl });
  release(); const [leader, follower] = await Promise.all([first, second]);
  expect(leader).toMatchObject({ stored: false, writeState: 'unknown' }); expect(leader.accountAuth).toBeUndefined();
  expect(follower).toMatchObject({ stored: true, writeState: 'persisted', accountAuth: { accessToken: 'fresh-a' } });
  expect(fetchImpl).toHaveBeenCalledOnce(); expect(JSON.stringify(leader)).not.toContain('PRIVATE');
});

it('verifies selection after the atomic writer has already confirmed a saved rotation', async () => {
  const persist = persistence.persistConfigEdit;
  vi.spyOn(persistence, 'persistConfigEdit').mockImplementation((...args) => {
    const result = persist(...args); write({ ...read(), activeProviderConnectionId: 'b' }); return result;
  });
  const result = await renewStoredAccount(request());
  expect(result).toMatchObject({ stored: false, writeState: 'persisted' }); expect(result.accountAuth).toBeUndefined();
  expect(result.failure).toContain('verification-failed');
  expect(read().providerConnections?.[0]?.accountAuth?.openai?.accessToken).toBe('fresh-a');
});

it('classifies an identical rotation completed just before locking as unchanged and preserves unrelated edits', async () => {
  const lock = store.withFileLock;
  vi.spyOn(store, 'withFileLock').mockImplementation((name, run, options) => lock(name, () => {
    const current = read(); const fresh = { ...auth(), accessToken: 'fresh-a', refreshToken: 'rotated-a', expiresAt: 9999999999999 };
    write({ ...current, theme: 'light', providerConnections: current.providerConnections!.map(record => record.id === 'a'
      ? { ...record, accountAuth: { openai: fresh } } : record), providerCredentials: { openai: { accountAuth: { openai: fresh } } } });
    return run();
  }, options));
  vi.spyOn(authorization, 'renewAccountAuthIfExpiring').mockResolvedValue({ renewed: false,
    accountAuth: { ...auth(), accessToken: 'fresh-a', refreshToken: 'rotated-a', expiresAt: 9999999999999 } });
  const result = await renewStoredAccount(request());
  expect(result).toMatchObject({ stored: true, writeState: 'unchanged' }); expect(read().theme).toBe('light');
});

it('refuses to send when another process may have spent the refresh token', async () => {
  const lineage = { provider: 'openai' as const, credentialId: 'openai:a', generation: 'other', refreshToken: 'refresh-a' };
  const key = refreshLineage(lineage);
  expect(acquireRefreshLease({ ...lineage, owner: 'other-process' }).acquired).toBe(true);
  markRefreshDispatched(key, 'other-process');
  const input = request();
  const result = await renewStoredAccount({ ...input, fetchImpl: vi.fn() as unknown as typeof fetch });
  expect(result).toMatchObject({ stored: false, writeState: 'unchanged' });
  expect(result.accountAuth).toBeUndefined();
  expect(result.failure).toMatch(/another process/i);
  expect(input.fetchImpl).not.toHaveBeenCalled();
  expect(read().providerConnections?.[0]?.accountAuth?.openai).toEqual(auth());
});

it('refuses replay after an unknown renewal outcome from another process', async () => {
  const lineage = { provider: 'openai' as const, credentialId: 'openai:a', generation: 'other', refreshToken: 'refresh-a' };
  const key = refreshLineage(lineage);
  acquireRefreshLease({ ...lineage, owner: 'other-process' });
  markRefreshDispatched(key, 'other-process');
  markRefreshUnknown(key, 'other-process');
  const input = request();
  const result = await renewStoredAccount({ ...input, fetchImpl: vi.fn() as unknown as typeof fetch });
  expect(result).toMatchObject({ stored: false, writeState: 'unchanged' });
  expect(result.failure).toMatch(/reconnect|spent/i);
  expect(input.fetchImpl).not.toHaveBeenCalled();
});
