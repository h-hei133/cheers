import { describe, expect, it } from 'vitest';
import { BUILTIN_PROVIDERS, type CatalogProvider } from '../../models/catalog.js';
import type { ProviderCredentialResolution } from '../credential.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from './target.js';

function account(baseUrl?: string): ProviderCredentialResolution {
  return { provider: 'openai', expectedEnvVarName: 'OPENAI_API_KEY', ...(baseUrl ? { baseUrl } : {}),
    credential: { provider: 'openai', source: 'config', envVarName: 'OPENAI_API_KEY', authMode: 'account-auth',
      accountAuth: { type: 'openai-chatgpt-account', accessToken: 'synthetic', refreshToken: 'synthetic', expiresAt: 1 } } };
}

describe('captured account endpoint', () => {
  const foreign: readonly CatalogProvider[] = [{ id: 'openai', runtime: 'openai', label: 'Fixture', auth: 'oauth',
    baseUrl: 'https://foreign.invalid/v1', models: [] }];

  it('ignores catalogue relocation and uses the issuer account route', () => {
    for (const catalog of [foreign, BUILTIN_PROVIDERS, [], [{ ...foreign[0]!, baseUrl: ' https://api.openai.com/v1/ ' }]]) {
      expect(providerCredentialBaseUrl(catalog, account())).toBe('https://chatgpt.com/backend-api');
      expect(providerCredentialEndpoint(catalog, account())).toBe('openai-account-responses');
    }
  });

  it('refuses an explicitly configured address outside the issuer route', () => {
    expect(() => providerCredentialBaseUrl(foreign, account('https://owner.invalid/v1'))).toThrow('account issuer');
    expect(providerCredentialBaseUrl(foreign, account(' https://chatgpt.com/backend-api/ '))).toBe('https://chatgpt.com/backend-api');
  });

  it('retains catalogue fallback for API keys', () => {
    const credential = account().credential!;
    const resolution = { ...account(), credential: { ...credential, authMode: 'api-key' as const, accountAuth: undefined, apiKey: 'synthetic' } };
    expect(providerCredentialBaseUrl(foreign, resolution)).toBe('https://foreign.invalid/v1');
  });

  it('uses the subscription-issued endpoint and refuses a conflicting selected target', () => {
    const credential = account().credential!;
    const resolution: ProviderCredentialResolution = { ...account(), provider: 'github-copilot', credential: { ...credential,
      provider: 'github-copilot', accountAuth: { type: 'subscription', provider: 'github-copilot',
        accessToken: 'tid=synthetic;proxy-ep=proxy.individual.githubcopilot.com', refreshToken: 'synthetic',
        expiresAt: 1, baseUrl: 'https://api.individual.githubcopilot.com' } } };
    expect(providerCredentialBaseUrl(foreign, resolution)).toBe('https://api.individual.githubcopilot.com');
    expect(() => providerCredentialBaseUrl(foreign, { ...resolution, baseUrl: 'https://foreign.invalid/v1' })).toThrow('account issuer');
  });
});
