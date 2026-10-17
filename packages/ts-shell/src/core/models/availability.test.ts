import { expect, it } from 'vitest';
import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import type { CatalogProvider } from './catalog.js';
import { availabilitySnapshot, endpointLabel } from './availability.js';

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
