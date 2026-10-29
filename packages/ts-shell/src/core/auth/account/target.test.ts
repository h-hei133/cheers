import { describe, expect, it } from 'vitest';
import { BUILTIN_PROVIDERS, mergeProviders, providerEndpoint, type CatalogProvider } from '../../models/catalog.js';
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

describe('captured native OpenAI request protocol', () => {
  const target = { provider: 'openai', model: 'o4-mini', baseUrl: 'https://api.openai.com/v1/' };

  it('selects Responses only for the exact native address and a model declaring that protocol', () => {
    expect(providerCredentialEndpoint(BUILTIN_PROVIDERS, target)).toBe('openai-responses');
    expect(providerEndpoint(BUILTIN_PROVIDERS, 'openai', target.baseUrl, target.model)).toBe('openai-responses');
    expect(providerCredentialEndpoint(BUILTIN_PROVIDERS, { ...target, model: 'gpt-5.3-codex' })).toBe('openai-responses');
    for (const baseUrl of ['https://relay.invalid/v1', 'https://api.openai.com/v10', 'https://api.openai.com.evil.invalid/v1',
      'http://api.openai.com/v1', 'https://api.openai.com/v1?proxy=1']) {
      expect(providerCredentialEndpoint(BUILTIN_PROVIDERS, { ...target, baseUrl })).toBeUndefined();
    }
    for (const model of [undefined, 'unlisted', 'gpt-4o', 'gpt-5.3', 'gpt-5.1-mini']) {
      expect(providerCredentialEndpoint(BUILTIN_PROVIDERS, { ...target, model })).toBeUndefined();
    }
    const catalog = mergeProviders(BUILTIN_PROVIDERS, [{ id: 'openai', models: [{ id: target.model, reasoning: false }] }]);
    expect(providerCredentialEndpoint(catalog, target)).toBe('openai-responses');
    const disabled = mergeProviders(BUILTIN_PROVIDERS, [{ id: 'openai', models: [{ id: target.model,
      compat: { endpoint: 'openai-compatible' } }] }]);
    expect(providerCredentialEndpoint(disabled, target)).toBeUndefined();
    const reasoningOnly = mergeProviders(BUILTIN_PROVIDERS, [{ id: 'openai', models: [{ id: 'custom-reasoning', reasoning: true }] }]);
    expect(providerCredentialEndpoint(reasoningOnly, { ...target, model: 'custom-reasoning' })).toBeUndefined();
  });

  it('preserves explicit protocols, exact relay ownership and account issuer authority', () => {
    const explicit = mergeProviders(BUILTIN_PROVIDERS, [{ id: 'openai', endpoint: 'openai-compatible' }]);
    expect(providerCredentialEndpoint(explicit, target)).toBe('openai-compatible');
    const relay = mergeProviders(BUILTIN_PROVIDERS, [{ id: 'relay', runtime: 'openai', baseUrl: target.baseUrl,
      models: [{ id: target.model, reasoning: true }] }]);
    expect(providerCredentialEndpoint(relay, target)).toBeUndefined();
    expect(providerCredentialEndpoint(explicit, { ...account(), model: target.model })).toBe('openai-account-responses');
    const ambiguous = [...relay, { ...relay.at(-1)!, id: 'duplicate' }];
    expect(providerCredentialEndpoint(ambiguous, target)).toBeUndefined();
  });

  it('keeps the exact coding model route behind provider, address and explicit protocol ownership', () => {
    const coding = { ...target, model: 'gpt-5.3-codex' };
    for (const baseUrl of ['https://relay.invalid/v1', 'https://api.openai.com/v10',
      'https://api.openai.com.evil.invalid/v1', 'https://api.openai.com/v1?route=1']) {
      expect(providerCredentialEndpoint(BUILTIN_PROVIDERS, { ...coding, baseUrl })).toBeUndefined();
    }
    const explicit = mergeProviders(BUILTIN_PROVIDERS, [{ id: 'openai', endpoint: 'openai-compatible' }]);
    expect(providerCredentialEndpoint(explicit, coding)).toBe('openai-compatible');
    const relay = mergeProviders(BUILTIN_PROVIDERS, [{ id: 'relay', runtime: 'openai', baseUrl: target.baseUrl,
      models: [{ id: coding.model, reasoning: true }] }]);
    expect(providerCredentialEndpoint(relay, coding)).toBeUndefined();
    expect(providerCredentialEndpoint(explicit, { ...account(), model: coding.model })).toBe('openai-account-responses');
  });
});
