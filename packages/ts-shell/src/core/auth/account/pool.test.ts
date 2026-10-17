import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile, type ProviderConnectionConfig, type RuntimeConfig } from '../../../config/runtimeConfig.js';
import { resolveProviderCredential } from '../../shell/providerCredentials.js';
import { credentialGeneration, selectPooledConnection } from './pool.js';

let home: string;
let root: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'account-pool-'));
  root = path.join(home, 'repo'); fs.mkdirSync(root);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  fs.mkdirSync(path.dirname(getUserRuntimeConfigPath()), { recursive: true });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

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

it('keeps an explicit active connection even when it is outside the pool', () => {
  write({ provider: 'openai', activeProviderConnectionId: 'outside',
    providerConnections: [connection('outside'), connection('inside')], accountPool: { openai: { connections: ['inside'] } } });
  expect(resolveProviderCredential({ runtimeConfig: config(), env: {} }).credential).toMatchObject({ connectionId: 'outside' });
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

it('derives a stable credential identity and a rotation-sensitive generation', () => {
  const before = connection('a', { authType: 'account-auth', apiKey: undefined,
    accountAuth: { openai: { type: 'openai-chatgpt-account', accessToken: 'one', refreshToken: 'r1', expiresAt: 1, accountId: 'acct' } } }) as ProviderConnectionConfig;
  const account = before.accountAuth!.openai!;
  const after = { ...before, accountAuth: { openai: { ...account, accessToken: 'two' } } };
  expect(credentialGeneration(before)).toBe(credentialGeneration(before));
  expect(credentialGeneration(before)).not.toBe(credentialGeneration(after));
  expect(credentialGeneration(before)).not.toContain('one');
});
