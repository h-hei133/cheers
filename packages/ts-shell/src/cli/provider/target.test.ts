import { afterEach, beforeEach, expect, it } from 'vitest';
import { delegatedTarget } from './target.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import type { ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';

beforeEach(() => { createAdvisorHarness(false, false); });
afterEach(cleanupAdvisorHarnesses);

const main: ProviderCredentialResolution = { provider: 'openai', model: 'primary-model', baseUrl: 'http://127.0.0.1:1/v1', expectedEnvVarName: 'OPENAI_API_KEY',
  credential: { provider: 'openai', authMode: 'api-key', apiKey: 'synthetic-review-only', model: 'primary-model', baseUrl: 'http://127.0.0.1:1/v1', source: 'cli', envVarName: 'OPENAI_API_KEY' } };

it('resolves an exact connected connection and requested model rather than its configured model or main binding', () => {
  const connection = { id: 'review-connection', provider: 'openai' as const, status: 'connected' as const, authType: 'api-key' as const,
    apiKey: 'synthetic-connection-only', baseUrl: 'http://127.0.0.1:2/v1', model: 'configured-model', createdAt: '2026-10-01', updatedAt: '2026-10-01' };
  const config = { ...getRuntimeConfig(), providerConnections: [connection], activeProviderConnectionId: 'main',
    sessionConnection: { id: 'main', provider: 'openai' }, providerCredentials: {} };
  expect(delegatedTarget('review-connection/requested-model', main, config)).toMatchObject({ provider: 'openai', model: 'requested-model', baseUrl: connection.baseUrl,
    credential: { connectionId: connection.id, model: 'requested-model', source: 'connection', apiKey: connection.apiKey } });
});

it.each(['pending', 'error', 'missing-key'] as const)('rejects %s exact connection without falling back to the main or configured credential', status => {
  const connection = { id: 'review-connection', provider: 'openai' as const, status: status === 'missing-key' ? 'connected' as const : status,
    authType: 'api-key' as const, apiKey: status === 'missing-key' ? undefined : 'synthetic-connection-only', baseUrl: 'http://127.0.0.1:2/v1', createdAt: '2026-10-01', updatedAt: '2026-10-01' };
  const config = { ...getRuntimeConfig(), providerConnections: [connection], providerCredentials: { openai: { apiKey: 'synthetic-fallback-must-not-be-used' } } };
  expect(() => delegatedTarget('review-connection/requested-model', main, config)).toThrow(/unavailable|credential/);
});

it('rejects unsupported account-auth override and an unavailable provider instead of choosing the main model', () => {
  const account: ProviderCredentialResolution = { ...main, credential: { ...main.credential!, authMode: 'account-auth', apiKey: undefined,
    accountAuth: { type: 'openai-chatgpt-account', accessToken: 'synthetic-account-only', refreshToken: 'synthetic-refresh', expiresAt: Date.now() + 60000 } } };
  expect(() => delegatedTarget('unsupported-model-for-account-auth', account)).toThrow(/unavailable|endpoint/);
  expect(() => delegatedTarget('unknown-provider/requested-model', main, getRuntimeConfig())).toThrow(/unavailable|endpoint/);
});

it('supports an explicit bare delegated model only on the captured provider', () => {
  expect(delegatedTarget('review-model', main)).toMatchObject({ provider: 'openai', model: 'review-model', credential: { model: 'review-model', apiKey: main.credential!.apiKey } });
});

it.each(['outside', 'missing', 'duplicate', 'foreign', 'endpoint'] as const)(
  'keeps the complete pool topology when resolving an exact delegated connection: %s', defect => {
    const connection = { id: 'review-connection', provider: 'openai' as const, status: 'connected' as const, authType: 'api-key' as const,
      apiKey: 'synthetic-connection-only', baseUrl: 'http://127.0.0.1:2/v1', createdAt: '2026-10-01', updatedAt: '2026-10-01' };
    const peer = { ...connection, id: 'peer', ...(defect === 'foreign' ? { provider: 'anthropic' as const } : {}) };
    const pool = defect === 'outside' ? ['peer'] : defect === 'missing' ? [connection.id, 'missing']
      : defect === 'duplicate' ? [connection.id, ` ${connection.id} `] : [connection.id, 'peer'];
    const config = { ...getRuntimeConfig(), providerConnections: [connection, peer], providerCredentials: {},
      accountPool: { openai: { connections: pool, ...(defect === 'endpoint' ? { baseUrl: 'http://127.0.0.1:3/v1' } : {}) } } };
    expect(() => delegatedTarget(`${connection.id}/requested-model`, main, config)).toThrow(/unavailable|credential/);
    expect(() => delegatedTarget({ provider: 'openai', connectionId: connection.id, model: 'requested-model', thinkingEffort: null }, main, config))
      .toThrow(/unavailable|credential/);
  });

it('validates the captured pool for bare and current-provider delegated models', () => {
  const connection = { id: 'main', provider: 'openai' as const, status: 'connected' as const, authType: 'api-key' as const,
    apiKey: 'synthetic-main-only', baseUrl: main.baseUrl, createdAt: '2026-10-01', updatedAt: '2026-10-01' };
  const captured = { ...main, credential: { ...main.credential!, source: 'connection' as const, connectionId: connection.id, apiKey: connection.apiKey } };
  const config = { ...getRuntimeConfig(), providerConnections: [connection], accountPool: { openai: { connections: [connection.id] } } };
  expect(delegatedTarget('review-model', captured, config).credential?.connectionId).toBe(connection.id);
  expect(delegatedTarget('openai/review-model', captured, config, [], 'current').credential?.connectionId).toBe(connection.id);
  const invalid = { ...config, accountPool: { openai: { connections: [connection.id, 'missing'] } } };
  expect(() => delegatedTarget('review-model', captured, invalid)).toThrow('Delegated model has no usable provider binding.');
  expect(() => delegatedTarget('openai/review-model', captured, invalid, [], 'current')).toThrow('Delegated model has no usable provider binding.');
  expect(() => delegatedTarget('review-model', main, config)).toThrow('Delegated model has no usable provider binding.');
});

it('a parent pool refuses exact foreign-provider connections and roles while no-pool roles retain their behavior', () => {
  const inside = { id: 'inside', provider: 'openai' as const, status: 'connected' as const, authType: 'api-key' as const,
    apiKey: 'synthetic-inside', baseUrl: main.baseUrl, createdAt: '2026-10-01', updatedAt: '2026-10-01' };
  const outside = { ...inside, id: 'outside', provider: 'anthropic' as const, apiKey: 'synthetic-outside', baseUrl: 'http://127.0.0.1:2/v1' };
  const captured = { ...main, credential: { ...main.credential!, source: 'connection' as const, connectionId: inside.id, apiKey: inside.apiKey } };
  const config = { ...getRuntimeConfig(), providerConnections: [inside, outside], activeProviderConnectionId: inside.id,
    accountPool: { openai: { connections: [inside.id] }, anthropic: { connections: [outside.id] } } };
  const role = { provider: 'anthropic', connectionId: outside.id, model: 'requested-model' };
  expect(() => delegatedTarget('outside/requested-model', captured, config)).toThrow('Delegated provider is unavailable outside the parent account pool.');
  expect(() => delegatedTarget(role, captured, config)).toThrow('Delegated provider is unavailable outside the parent account pool.');
  expect(() => delegatedTarget('anthropic/requested-model', captured, config)).toThrow('Delegated provider is unavailable outside the parent account pool.');
  const unrestricted = { ...config, accountPool: undefined };
  expect(delegatedTarget('outside/requested-model', captured, unrestricted).credential?.connectionId).toBe(outside.id);
  expect(delegatedTarget(role, captured, unrestricted).credential?.connectionId).toBe(outside.id);
});
