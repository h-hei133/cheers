import { afterEach, expect, it } from 'vitest';
import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import type { CatalogProvider } from './catalog.js';
import { availabilitySnapshot, endpointLabel } from './availability.js';
import { credentialIdentityFor } from '../auth/account/pool.js';
import { ownedConnectionCredential } from '../auth/account/presence.js';
import { noteCredentialRateLimit, resetCredentialBackoffForTests } from '../auth/account/backoff.js';

afterEach(resetCredentialBackoffForTests);

const catalog: CatalogProvider[] = [
  { id: 'openai', label: 'OpenAI', runtime: 'openai', auth: 'api-key', envVar: 'OPENAI_API_KEY',
    models: [{ id: 'gpt-a', contextWindow: 200_000 }] },
  { id: 'relay', label: 'Relay', runtime: 'openai-compatible', auth: 'api-key', baseUrl: 'https://relay.example/v1',
    models: [{ id: 'relay-model' }] },
  { id: 'empty', label: 'Empty', runtime: 'vertex', auth: 'api-key', models: [] },
];

function config(value: Partial<RuntimeConfig>): RuntimeConfig {
  return { provider: 'openai', providerConnections: [], providerCredentials: {}, ...value } as unknown as RuntimeConfig;
}

const connection = (id: string, provider: RuntimeConfig['provider'], extra: Record<string, unknown> = {}) => ({
  id, provider, authType: 'api-key' as const, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra,
});

it('reports legacy and environment credentials without inventing a connection', () => {
  const envOnly = availabilitySnapshot({ config: config({ providerCredentials: { openai: { apiKey: 'sk-secret-value' } } }), catalog, env: {} });
  expect(envOnly.providers.find(provider => provider.provider === 'openai')).toMatchObject({ state: 'ready', credential: 'present', connections: [] });
  expect(JSON.stringify(envOnly)).not.toContain('sk-secret-value');

  const fromEnv = availabilitySnapshot({ config: config({}), catalog, env: { OPENAI_API_KEY: 'sk-env-secret' } });
  expect(fromEnv.providers.find(provider => provider.provider === 'openai')).toMatchObject({ state: 'ready', credential: 'present' });
  expect(JSON.stringify(fromEnv)).not.toContain('sk-env-secret');

  const missing = availabilitySnapshot({ config: config({}), catalog, env: {} });
  expect(missing.providers.find(provider => provider.provider === 'openai')).toMatchObject({ state: 'credential-missing', credential: 'missing' });
});

it('keeps pending, error and missing credentials distinct per connection', () => {
  const snapshot = availabilitySnapshot({ config: config({ providerConnections: [
    connection('pending', 'openai', { status: 'pending' }),
    connection('broken', 'openai', { status: 'error' }),
    connection('bare', 'openai'),
  ] }), catalog, env: {} });
  const projected = snapshot.providers.find(provider => provider.provider === 'openai')!;
  expect(projected.connections.map(item => [item.connectionId, item.state])).toEqual([
    ['pending', 'pending'], ['broken', 'error'], ['bare', 'credential-missing'],
  ]);
  expect(projected.state).toBe('pending');
});

it('distinguishes two relays of one provider and redacts their endpoints', () => {
  const snapshot = availabilitySnapshot({ config: config({ activeProviderConnectionId: 'second', providerConnections: [
    connection('first', 'openai-compatible', { apiKey: 'key-one', baseUrl: 'https://user:pass@one.example/v1?token=secret' }),
    connection('second', 'openai-compatible', { apiKey: 'key-two', baseUrl: 'https://two.example/v1' }),
  ] }), catalog, env: {} });
  expect(snapshot.activeConnectionId).toBe('second');
  const projected = snapshot.providers.find(provider => provider.provider === 'openai-compatible')!;
  expect(projected.connections.map(item => [item.connectionId, item.endpoint, item.state])).toEqual([
    ['first', 'one.example/v1', 'ready'], ['second', 'two.example/v1', 'ready'],
  ]);
  expect(JSON.stringify(snapshot)).not.toMatch(/key-one|key-two|pass|secret/);
});

it('keeps a catalogue provider without models and an uncatalogued connection visible', () => {
  const snapshot = availabilitySnapshot({ config: config({ providerConnections: [connection('orphan', 'bedrock', { apiKey: 'k' })] }), catalog, env: {} });
  expect(snapshot.providers.find(provider => provider.provider === 'vertex')?.models).toEqual([]);
  expect(snapshot.providers.find(provider => provider.provider === 'bedrock')).toMatchObject({ catalogued: false, state: 'ready' });
});

it('never claims a measured round trip', () => {
  const snapshot = availabilitySnapshot({ config: config({ providerCredentials: { openai: { apiKey: 'k' } } }), catalog, env: {} });
  for (const provider of snapshot.providers) expect(provider.measured).toBe('unknown');
});

it('shows only a host and path from an endpoint', () => {
  expect(endpointLabel('https://user:pass@host.example:8443/v1/?token=secret#frag')).toBe('host.example:8443/v1');
  expect(endpointLabel('not a url')).toBeUndefined();
  expect(endpointLabel('')).toBeUndefined();
});

it('counts only usable authorized members and never borrows ambient credentials for a pool', () => {
  const snapshot = availabilitySnapshot({ config: config({ providerConnections: [
    connection('usable', 'openai', { apiKey: 'synthetic-own' }),
    connection('bare', 'openai'),
    connection('outside', 'openai', { apiKey: 'synthetic-outside' }),
    connection('pending', 'openai', { apiKey: 'synthetic-pending', status: 'pending' }),
    connection('error', 'openai', { apiKey: 'synthetic-error', status: 'error' }),
  ], providerCredentials: { openai: { apiKey: 'synthetic-profile' } },
  accountPool: { openai: { connections: ['usable', 'bare', 'pending', 'error'] } } }),
  catalog, env: { OPENAI_API_KEY: 'synthetic-env' } });
  const provider = snapshot.providers.find(item => item.provider === 'openai')!;
  expect(provider).toMatchObject({ state: 'ready', credential: 'present', pool: { members: 4, available: 1 } });
  expect(provider.connections.map(item => [item.connectionId, item.state])).toEqual([
    ['usable', 'ready'], ['bare', 'credential-missing'], ['outside', 'pool-unavailable'], ['pending', 'pending'], ['error', 'error'],
  ]);
  expect(JSON.stringify(snapshot)).not.toContain('synthetic-');
});

it.each([
  { members: ['inside'], slots: [connection('inside', 'openai')], available: 0 },
  { members: ['missing'], slots: [connection('outside', 'openai', { apiKey: 'synthetic' })], available: 0 },
  { members: ['inside', 'missing'], slots: [connection('inside', 'openai', { apiKey: 'synthetic' })], available: 0 },
  { members: ['inside', ' inside '], slots: [connection('inside', 'openai', { apiKey: 'synthetic' })], available: 0 },
  { members: ['inside'], slots: [connection('inside', 'openai', { apiKey: 'synthetic' }), connection(' inside ', 'openai', { apiKey: 'synthetic' })], available: 0 },
  { members: ['inside', 'foreign'], slots: [connection('inside', 'openai', { apiKey: 'synthetic' }), connection('foreign', 'anthropic', { apiKey: 'synthetic' })], available: 0 },
  { members: ['inside'], slots: [connection('inside', 'openai', { apiKey: 'synthetic', baseUrl: 'https://other.invalid/v1' })], baseUrl: 'https://owned.invalid/v1', available: 0 },
  { members: ['inside'], slots: [connection('inside', 'openai', { apiKey: 'synthetic', baseUrl: 'https://owned.invalid/v1/' })], baseUrl: 'https://owned.invalid/v1', available: 1 },
])('projects the complete captured topology before availability: %j', ({ members, slots, baseUrl, available }) => {
  const snapshot = availabilitySnapshot({ config: config({ providerConnections: slots,
    providerCredentials: { openai: { apiKey: 'synthetic-profile' } },
    accountPool: { openai: { connections: members, ...(baseUrl ? { baseUrl } : {}) } } }), catalog, env: { OPENAI_API_KEY: 'synthetic-env' } });
  expect(snapshot.providers.find(provider => provider.provider === 'openai')).toMatchObject({
    state: available ? 'ready' : 'pool-unavailable', credential: available ? 'present' : 'missing',
    pool: { members: members.length, available },
  });
});

it('projects empty authorization with zero availability and no ambient credential', () => {
  const snapshot = availabilitySnapshot({ config: config({ providerConnections: [connection('outside', 'openai', { apiKey: 'synthetic' })],
    accountPool: { openai: { connections: [] } }, providerCredentials: { openai: { apiKey: 'synthetic-profile' } } }),
  catalog, env: { OPENAI_API_KEY: 'synthetic-env' } });
  expect(snapshot.providers.find(provider => provider.provider === 'openai')).toMatchObject({
    state: 'pool-empty', credential: 'missing', pool: { members: 0, available: 0 },
    connections: [{ connectionId: 'outside', state: 'pool-unavailable' }],
  });
});

it('excludes a waiting selected generation and admits a newly rotated credential', () => {
  const waiting = connection('waiting', 'openai', { apiKey: 'synthetic-first' });
  noteCredentialRateLimit(credentialIdentityFor('openai', ownedConnectionCredential(waiting))!, 60_000);
  const captured = config({ providerConnections: [waiting], accountPool: { openai: { connections: ['waiting'] } } });
  expect(availabilitySnapshot({ config: captured, catalog, env: {} }).providers[0]).toMatchObject({
    state: 'pool-unavailable', credential: 'missing', pool: { available: 0 }, connections: [{ state: 'pool-unavailable' }],
  });
  const rotated = { ...captured, providerConnections: [{ ...waiting, apiKey: 'synthetic-second' }] };
  expect(availabilitySnapshot({ config: rotated, catalog, env: {} }).providers[0]).toMatchObject({ state: 'ready', pool: { available: 1 } });
});

it.each([
  undefined,
  { anthropic: { type: 'anthropic-claude-account', accessToken: 'synthetic-foreign' } },
  { openai: { type: 'anthropic-claude-account', accessToken: 'synthetic-wrong-type' } },
  { openai: { type: 'openai-chatgpt-account', accessToken: ' ' } },
])('refuses unavailable preferred account material without selecting a retained key: %j', accountAuth => {
  const snapshot = availabilitySnapshot({ config: config({ providerConnections: [connection('account', 'openai', {
    authType: 'account-auth', apiKey: 'synthetic-retained', accountAuth,
  })], accountPool: { openai: { connections: ['account'] } } }), catalog, env: { OPENAI_API_KEY: 'synthetic-env' } });
  expect(snapshot.providers[0]).toMatchObject({ state: 'pool-unavailable', credential: 'missing', pool: { available: 0 },
    connections: [{ state: 'credential-missing' }] });
});

it('keeps every uncatalogued connection and counts an authorized later member', () => {
  const snapshot = availabilitySnapshot({ config: config({ providerConnections: [
    connection('first', 'bedrock', { apiKey: 'synthetic-first' }), connection('second', 'bedrock', { apiKey: 'synthetic-second' }),
  ], accountPool: { bedrock: { connections: ['second'] } } }), catalog, env: {} });
  expect(snapshot.providers.find(provider => provider.provider === 'bedrock')).toMatchObject({ catalogued: false, state: 'ready',
    credential: 'present', pool: { members: 1, available: 1 }, connections: [
      { connectionId: 'first', state: 'pool-unavailable' }, { connectionId: 'second', state: 'ready' },
    ] });
});

it('does not report ready members from a rejected captured configuration', () => {
  const snapshot = availabilitySnapshot({ config: config({ providerConnections: [connection('inside', 'openai', { apiKey: 'synthetic' })],
    accountPool: { openai: { connections: ['inside'] } }, configValidation: { valid: false, securityBlocked: false } }), catalog, env: {} });
  expect(snapshot.providers[0]).toMatchObject({ state: 'pool-unavailable', credential: 'missing', pool: { available: 0 } });
});
