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
  expect(() => delegatedTarget('unsupported-model-for-account-auth', account)).toThrow(/unavailable/);
  expect(() => delegatedTarget('unknown-provider/requested-model', main, getRuntimeConfig())).toThrow(/unavailable/);
});

it('supports an explicit bare delegated model only on the captured provider', () => {
  expect(delegatedTarget('review-model', main)).toMatchObject({ provider: 'openai', model: 'review-model', credential: { model: 'review-model', apiKey: main.credential!.apiKey } });
});
