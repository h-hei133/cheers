import { describe, expect, it } from 'vitest';
import { BUILTIN_PROVIDERS, type CatalogProvider } from '../../models/catalog.js';
import type { ProviderCredentialResolution } from '../credential.js';
import { providerCredentialBaseUrl } from './target.js';

function account(baseUrl?: string): ProviderCredentialResolution {
  return { provider: 'openai', expectedEnvVarName: 'OPENAI_API_KEY', ...(baseUrl ? { baseUrl } : {}),
    credential: { provider: 'openai', source: 'config', envVarName: 'OPENAI_API_KEY', authMode: 'account-auth',
      accountAuth: { type: 'openai-chatgpt-account', accessToken: 'synthetic', refreshToken: 'synthetic', expiresAt: 1 } } };
}

describe('captured account endpoint', () => {
  const foreign: readonly CatalogProvider[] = [{ id: 'openai', runtime: 'openai', label: 'Fixture', auth: 'oauth',
    baseUrl: 'https://foreign.invalid/v1', models: [] }];

  it('refuses a catalogue relocation without a captured account address', () => {
    expect(() => providerCredentialBaseUrl(foreign, account())).toThrow('catalogue cannot override');
    expect(providerCredentialBaseUrl(BUILTIN_PROVIDERS, account())).toBe('https://api.openai.com/v1');
    expect(providerCredentialBaseUrl([], account())).toBe('https://api.openai.com/v1');
    expect(providerCredentialBaseUrl([{ ...foreign[0]!, baseUrl: ' https://api.openai.com/v1/ ' }], account())).toBe('https://api.openai.com/v1');
  });

  it('uses the configured account address independently of other catalogue endpoints', () => {
    expect(providerCredentialBaseUrl(foreign, account('https://owner.invalid/v1'))).toBe('https://owner.invalid/v1');
  });

  it('retains catalogue fallback for API keys', () => {
    const credential = account().credential!;
    const resolution = { ...account(), credential: { ...credential, authMode: 'api-key' as const, accountAuth: undefined, apiKey: 'synthetic' } };
    expect(providerCredentialBaseUrl(foreign, resolution)).toBe('https://foreign.invalid/v1');
  });

  it('uses the subscription-issued endpoint and refuses a conflicting selected target', () => {
    const credential = account().credential!;
    const resolution: ProviderCredentialResolution = { ...account(), provider: 'github-copilot', credential: { ...credential,
      provider: 'github-copilot', accountAuth: { type: 'subscription', accessToken: 'synthetic', refreshToken: 'synthetic',
        expiresAt: 1, baseUrl: 'https://api.individual.githubcopilot.com' } } };
    expect(providerCredentialBaseUrl(foreign, resolution)).toBe('https://api.individual.githubcopilot.com');
    expect(() => providerCredentialBaseUrl(foreign, { ...resolution, baseUrl: 'https://foreign.invalid/v1' })).toThrow('account credential binding');
  });
});
