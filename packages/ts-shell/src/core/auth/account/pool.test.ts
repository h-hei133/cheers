import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile, type ProviderConnectionConfig, type RuntimeConfig } from '../../../config/runtimeConfig.js';
import { resolveProviderCredential } from '../../shell/providerCredentials.js';
import { credentialGeneration, credentialIdentityFor, selectPooledConnection } from './pool.js';
import { credentialBackoffRemaining, noteCredentialRateLimit, resetCredentialBackoffForTests } from './backoff.js';
import { createProfileContext, withProfile } from '../../paths/profile/context.js';

let home: string;
let root: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'account-pool-'));
  root = path.join(home, 'repo'); fs.mkdirSync(root);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  fs.mkdirSync(path.dirname(getUserRuntimeConfigPath()), { recursive: true });
});
afterEach(() => { resetCredentialBackoffForTests(); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

const connection = (id: string, extra: Record<string, unknown> = {}) => ({
  id, provider: 'openai' as const, authType: 'api-key' as const, apiKey: `key-${id}`, model: 'gpt',
  createdAt: '2026-01-01', updatedAt: '2026-01-01', status: 'connected' as const, ...extra,
});
function write(value: Record<string, unknown>) {
  writeUserRuntimeConfigFile(value as never, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
}
function config(): RuntimeConfig { return getRuntimeConfig(root); }

it('rejects pools that name missing, duplicated or foreign connections', () => {
  write({ provider: 'openai', providerConnections: [connection('a'), { ...connection('b'), provider: 'anthropic', authType: 'api-key' }],
    accountPool: { openai: { connections: ['a', 'missing'] } } });
  expect(config().configValidation.valid).toBe(false);
  expect(config().configDiagnostics.join(' ')).toContain("connection 'missing' is missing");
  write({ provider: 'openai', providerConnections: [connection('a')], accountPool: { openai: { connections: ['a', 'a'] } } });
  expect(config().configDiagnostics.join(' ')).toContain('duplicate connection');
  write({ provider: 'openai', providerConnections: [connection('a'), { ...connection('b'), provider: 'anthropic' }],
    accountPool: { openai: { connections: ['b'] } } });
  expect(config().configDiagnostics.join(' ')).toContain('belongs to another provider');
  write({ provider: 'openai', providerConnections: [connection('a', { baseUrl: 'https://one.example/v1' })],
    accountPool: { openai: { connections: ['a'], baseUrl: 'https://two.example/v1' } } });
  expect(config().configDiagnostics.join(' ')).toContain('does not use the declared endpoint');
});

it('treats an empty pool as zero authorization without falling back to env or profile keys', () => {
  write({ provider: 'openai', providerCredentials: { openai: { apiKey: 'profile-key' } },
    providerConnections: [connection('a')], accountPool: { openai: { connections: [] } } });
  const resolution = resolveProviderCredential({ runtimeConfig: config(), env: { OPENAI_API_KEY: 'env-key' } });
  expect(resolution.blocked).toBe('pool-empty');
  expect(resolution.credential).toBeUndefined();
});

it('refuses a pool whose members have no usable credential', () => {
  write({ provider: 'openai', providerConnections: [
    { ...connection('pending'), apiKey: undefined, status: 'pending' },
    { ...connection('broken'), apiKey: undefined, status: 'error' },
  ], accountPool: { openai: { connections: ['pending', 'broken'] } } });
  const resolution = resolveProviderCredential({ runtimeConfig: config(), env: { OPENAI_API_KEY: 'env-key' } });
  expect(resolution.blocked).toBe('pool-unavailable');
  expect(resolution.credential).toBeUndefined();
});

it('selects only a pool member even when environment and profile keys exist', () => {
  write({ provider: 'openai', providerCredentials: { openai: { apiKey: 'profile-key' } },
    providerConnections: [connection('a'), connection('b')], accountPool: { openai: { connections: ['b'] } } });
  const resolution = resolveProviderCredential({ runtimeConfig: config(), env: { OPENAI_API_KEY: 'env-key' } });
  expect(resolution.credential).toMatchObject({ connectionId: 'b', source: 'connection', apiKey: 'key-b' });
});

it('refuses an explicit active connection outside the pool', () => {
  write({ provider: 'openai', activeProviderConnectionId: 'outside',
    providerConnections: [connection('outside'), connection('inside')], accountPool: { openai: { connections: ['inside'] } } });
  expect(resolveProviderCredential({ runtimeConfig: config(), env: {} })).toMatchObject({ blocked: 'pool-unavailable' });
  expect(resolveProviderCredential({ runtimeConfig: config(), env: {} }).credential).toBeUndefined();
});

it('keeps session affinity and gives different sessions a deterministic order', () => {
  const base = { providerConnections: [connection('a'), connection('b'), connection('c')],
    accountPool: { openai: { connections: ['a', 'b', 'c'] } } } as unknown as RuntimeConfig;
  const first = selectPooledConnection({ config: base, provider: 'openai', sessionId: 'session-one', env: {} });
  const again = selectPooledConnection({ config: base, provider: 'openai', sessionId: 'session-one', env: {} });
  expect(again?.connection?.id).toBe(first?.connection?.id);
  const other = selectPooledConnection({ config: base, provider: 'openai', sessionId: 'session-two', env: {} });
  expect(['a', 'b', 'c']).toContain(other?.connection?.id);
});

it('does not share affinity or credential backoff across profile scopes', () => {
  const homeA = path.join(home, 'profile-a'); const homeB = path.join(home, 'profile-b');
  fs.mkdirSync(homeA); fs.mkdirSync(homeB);
  const profileA = createProfileContext({ name: 'a', homeDir: homeA });
  const profileB = createProfileContext({ name: 'b', homeDir: homeB });
  const captured = { ...config(), provider: 'openai' as const,
    providerConnections: [connection('a'), connection('b'), connection('c')],
    accountPool: { openai: { connections: ['a', 'b', 'c'] } } } as RuntimeConfig;
  const sessions = Array.from({ length: 16 }, (_, index) => `shared-${index}`);
  const selections = sessions.map(sessionId => [
    withProfile(profileA, () => selectPooledConnection({ config: captured, provider: 'openai', sessionId })?.connection?.id),
    withProfile(profileB, () => selectPooledConnection({ config: captured, provider: 'openai', sessionId })?.connection?.id),
  ] as const);
  expect(selections.some(([a, b]) => a !== b)).toBe(true);

  const key = credentialIdentityFor('openai', { connectionId: 'a', apiKey: 'key-a' })!;
  withProfile(profileA, () => noteCredentialRateLimit(key, 30_000));
  expect(withProfile(profileA, () => credentialBackoffRemaining(key))).toBeGreaterThan(0);
  expect(withProfile(profileB, () => credentialBackoffRemaining(key))).toBe(0);
});

it('derives a stable credential identity and a rotation-sensitive generation', () => {
  const before = connection('a', { authType: 'account-auth', apiKey: undefined,
    accountAuth: { openai: { type: 'openai-chatgpt-account', accessToken: 'one', refreshToken: 'r1', expiresAt: 1, accountId: 'acct' } } }) as ProviderConnectionConfig;
  const account = before.accountAuth!.openai!;
  const after = { ...before, accountAuth: { openai: { ...account, accessToken: 'two' } } };
  expect(credentialGeneration(before)).toBe(credentialGeneration(before));
  expect(credentialGeneration(before)).not.toBe(credentialGeneration(after));
  expect(credentialGeneration(before)).not.toContain('one');
});

it.each([
  { connections: ['a', 'missing'], members: [connection('a')] },
  { connections: ['a', 'a'], members: [connection('a')] },
  { connections: ['a', ' a '], members: [connection('a')] },
  { connections: ['a'], members: [connection('a'), connection('a')] },
  { connections: ['a'], members: [connection('a'), connection(' a ')] },
  { connections: ['a', 'b'], members: [connection('a'), connection('b', { provider: 'anthropic' })] },
  { connections: ['a'], members: [connection('a', { baseUrl: 'https://other.invalid/v1' })], baseUrl: 'https://owned.invalid/v1' },
])('validates captured topology before choosing any member: %j', ({ connections, members, baseUrl }) => {
  const captured = { ...config(), providerConnections: members,
    accountPool: { openai: { connections, ...(baseUrl ? { baseUrl } : {}) } } } as RuntimeConfig;
  expect(captured.configValidation.valid).toBe(true);
  expect(selectPooledConnection({ config: captured, provider: 'openai' })).toEqual({ blocked: 'pool-unavailable' });
  expect(resolveProviderCredential({ runtimeConfig: { ...captured, activeProviderConnectionId: 'a' }, env: {} }).credential).toBeUndefined();
});

it.each([{}, { cliApiKey: 'outside' }, { cliBaseUrl: 'https://outside.invalid/v1' }, { cliProvider: 'anthropic' as const }])(
  'an empty declared pool rejects explicit and CLI resolution %j', overrides => {
    const captured = { ...config(), provider: 'openai' as const, activeProviderConnectionId: 'a', providerConnections: [connection('a')],
      accountPool: { openai: { connections: [] } } };
    const resolution = resolveProviderCredential({ runtimeConfig: captured, env: { OPENAI_API_KEY: 'outside' }, ...overrides });
    expect(resolution.blocked).toBe('pool-empty');
    expect(resolution.credential).toBeUndefined();
  });

it.each([{ cliApiKey: 'outside' }, { cliBaseUrl: 'https://outside.invalid/v1' }, { cliProvider: 'anthropic' as const }])(
  'a CLI credential or target override cannot expand the declared pool %j', overrides => {
    const captured = { ...config(), provider: 'openai' as const, activeProviderConnectionId: 'a',
      providerConnections: [connection('a', { baseUrl: 'https://owned.invalid/v1' })], accountPool: { openai: { connections: ['a'] } } };
    const resolution = resolveProviderCredential({ runtimeConfig: captured, env: {}, ...overrides });
    expect(resolution.blocked).toBe('pool-required');
    expect(resolution.credential).toBeUndefined();
    expect(resolveProviderCredential({ runtimeConfig: captured, cliApiKey: 'key-a', cliBaseUrl: 'https://owned.invalid/v1/', env: {} })
      .credential).toMatchObject({ connectionId: 'a', apiKey: 'key-a', source: 'connection' });
  });

it('ignores env and profile fallback when choosing an owned-ready member', () => {
  const captured = { ...config(), provider: 'openai' as const, providerConnections: [connection('empty', { apiKey: undefined }), connection('ready')],
    providerCredentials: { openai: { apiKey: 'outside' } }, accountPool: { openai: { connections: ['empty', 'ready'] } } };
  expect(resolveProviderCredential({ runtimeConfig: captured, env: { OPENAI_API_KEY: 'outside' } }).credential)
    .toMatchObject({ connectionId: 'ready', apiKey: 'key-ready', source: 'connection' });
});

it.each(['api-key', 'account-auth'] as const)('moves ordinary affinity away from a waiting %s generation and refuses an exhausted pool', authType => {
  const first = connection('a', authType === 'account-auth' ? { authType, apiKey: undefined, accountAuth: { openai: {
    type: 'openai-chatgpt-account', accessToken: 'one', refreshToken: 'r1', expiresAt: Date.now() + 60_000,
  } } } : {});
  const captured = { ...config(), provider: 'openai' as const, providerConnections: [first, connection('b')],
    accountPool: { openai: { connections: ['a', 'b'] } } } as RuntimeConfig;
  const sessionId = `waiting-${authType}`;
  selectPooledConnection({ config: captured, provider: 'openai', connectionId: 'a', sessionId });
  const initial = resolveProviderCredential({ runtimeConfig: captured, env: {}, pool: { sessionId } });
  const identity = credentialIdentityFor(initial.provider, initial.credential)!;
  expect(initial.credential?.connectionId).toBe('a');
  expect(identity.generation).toBe(credentialGeneration(first as ProviderConnectionConfig));
  expect(identity.generation).toMatch(/^[a-f0-9]{16}$/);
  noteCredentialRateLimit(identity, 30_000);
  const next = resolveProviderCredential({ runtimeConfig: captured, env: {}, pool: { sessionId } });
  expect(next.credential?.connectionId).toBe('b');
  expect(resolveProviderCredential({ runtimeConfig: { ...captured, activeProviderConnectionId: 'a' }, env: {} }).blocked).toBe('pool-unavailable');
  noteCredentialRateLimit(credentialIdentityFor(next.provider, next.credential)!, 30_000);
  expect(resolveProviderCredential({ runtimeConfig: captured, env: {} }).blocked).toBe('pool-unavailable');
});

it.each([
  { type: 'openai-chatgpt-account', accessToken: '' },
  { type: 'openai-chatgpt-account', accessToken: '   ' },
  { type: 'google-gemini-account', accessToken: 'foreign' },
])('rejects malformed preferred account credentials without borrowing another credential: %j', account => {
  const captured = { ...config(), provider: 'openai' as const, providerConnections: [connection('invalid', {
    authType: 'account-auth', apiKey: 'own-different-mode', accountAuth: { openai: { ...account, refreshToken: 'r', expiresAt: Date.now() + 60_000 } },
  }), connection('ready')], providerCredentials: { openai: { apiKey: 'outside' } },
    accountPool: { openai: { connections: ['invalid', 'ready'] } } } as RuntimeConfig;
  expect(resolveProviderCredential({ runtimeConfig: captured, env: { OPENAI_API_KEY: 'outside' } }).credential?.connectionId).toBe('ready');
  expect(resolveProviderCredential({ runtimeConfig: { ...captured, activeProviderConnectionId: 'invalid' }, env: { OPENAI_API_KEY: 'outside' } }).credential)
    .toBeUndefined();
});

it('hashes the selected API key rather than an unused account credential', () => {
  const member = connection('mixed', { apiKey: '  selected-key  ', accountAuth: { openai: {
    type: 'openai-chatgpt-account', accessToken: 'unused-token', refreshToken: 'r', expiresAt: Date.now() + 60_000,
  } } }) as ProviderConnectionConfig;
  const captured = { ...config(), provider: 'openai' as const, providerConnections: [member], accountPool: { openai: { connections: ['mixed'] } } };
  const resolution = resolveProviderCredential({ runtimeConfig: captured, env: {} });
  expect(resolution.credential).toMatchObject({ authMode: 'api-key', apiKey: 'selected-key' });
  expect(credentialGeneration(member)).toBe(credentialIdentityFor('openai', resolution.credential)?.generation);
});

it.each([undefined, { google: { type: 'google-gemini-account', accessToken: 'foreign', refreshToken: 'r', expiresAt: Date.now() + 60_000 } }])(
  'a preferred account with no matching slot cannot use a retained API key: %j', accountAuth => {
    const captured = { ...config(), provider: 'openai' as const, providerConnections: [connection('invalid', {
      authType: 'account-auth', apiKey: 'retained-api-key', accountAuth,
    }), connection('ready')], accountPool: { openai: { connections: ['invalid', 'ready'] } } } as RuntimeConfig;
    expect(resolveProviderCredential({ runtimeConfig: captured, env: {} }).credential?.connectionId).toBe('ready');
    const pinned = resolveProviderCredential({ runtimeConfig: { ...captured, activeProviderConnectionId: 'invalid' }, env: {} });
    expect(pinned.blocked).toBe('pool-unavailable'); expect(pinned.credential).toBeUndefined();
  });

it.each(['openai-compatible', 'google-ai'] as const)('resolves an owned pool key for an API-key-only provider %s', provider => {
  const member = connection('owned', { provider, baseUrl: 'https://owned.invalid/v1' }) as ProviderConnectionConfig;
  const captured = { ...config(), provider, providerConnections: [member], accountPool: { [provider]: { connections: ['owned'] } } };
  const resolution = resolveProviderCredential({ runtimeConfig: captured, env: {} });
  expect(resolution.credential).toMatchObject({ provider, connectionId: 'owned', apiKey: 'key-owned', source: 'connection' });
  expect(credentialGeneration(member)).toBe(credentialIdentityFor(provider, resolution.credential)?.generation);
});

it('an affinity record cannot preserve a deleted or relogged credential generation', () => {
  const captured = { ...config(), provider: 'openai' as const, providerConnections: [connection('a')], accountPool: { openai: { connections: ['a'] } } };
  const before = selectPooledConnection({ config: captured, provider: 'openai', sessionId: 'generation-affinity' })!;
  const changed = { ...captured, providerConnections: [connection('a', { apiKey: 'relogged' })] };
  const after = selectPooledConnection({ config: changed, provider: 'openai', sessionId: 'generation-affinity' })!;
  expect(after.generation).not.toBe(before.generation);
  expect(selectPooledConnection({ config: { ...captured, providerConnections: [] }, provider: 'openai', sessionId: 'generation-affinity' }))
    .toEqual({ blocked: 'pool-unavailable' });
});
