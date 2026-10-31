import { describe, expect, it } from 'vitest';
import { configuredServiceTier, serviceTierCapability } from './serviceTier.js';
import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { BUILTIN_PROVIDERS } from './catalog.js';
import { withSessionServiceTier } from '../commands/model/serviceTier.js';

describe('service tier capability', () => {
  const catalog = [{ id: 'openai', models: [{ id: 'reasoning', serviceTiers: ['priority', 'flex'] }] }];

  it('accepts only tiers declared by the selected provider/model', () => {
    expect(serviceTierCapability(catalog, 'openai', 'reasoning', 'priority')).toBe('supported');
    expect(serviceTierCapability(catalog, 'openai', 'reasoning', 'ultrafast')).toBe('unsupported');
  });

  it('keeps absent model metadata unknown instead of inventing support', () => {
    expect(serviceTierCapability(catalog, 'openai', 'custom', 'priority')).toBe('unverified');
  });

  it('uses the admitted native model protocol for tier support', () => {
    expect(serviceTierCapability(BUILTIN_PROVIDERS, 'openai', 'o4-mini', 'priority')).toBe('supported');
    expect(serviceTierCapability(BUILTIN_PROVIDERS, 'openai', 'o4-mini', 'flex')).toBe('supported');
    expect(serviceTierCapability(BUILTIN_PROVIDERS, 'openai', 'o4-mini', 'fast')).toBe('unsupported');
    expect(serviceTierCapability(BUILTIN_PROVIDERS, 'openai', 'o4-mini', 'priority',
      'https://chatgpt.com/backend-api', 'openai-account-responses')).toBe('unsupported');
  });

  it('removes a previously selected session tier when reset', () => {
    const selection = { connectionId: 'fixture', provider: 'openai', model: 'reasoning', serviceTier: 'flex' } as const;
    expect(withSessionServiceTier(selection, undefined)).toEqual({ connectionId: 'fixture', provider: 'openai', model: 'reasoning' });
  });
});

it('keeps tier ownership on the resolved provider and inherits only an absent connection default', () => {
  const config = { providerConnections: [
    { id: 'same-id', provider: 'anthropic', serviceTier: 'priority' },
    { id: 'selected', provider: 'openai', serviceTier: 'flex' },
  ], providerCredentials: { openai: { serviceTier: 'default' } } } as RuntimeConfig;
  const resolution = (connectionId?: string) => ({ provider: 'openai' as const,
    credential: { provider: 'openai' as const, authMode: 'api-key' as const, source: 'connection' as const,
      envVarName: 'OPENAI_API_KEY', connectionId } });
  expect(configuredServiceTier(config, resolution('selected'))).toBe('flex');
  expect(configuredServiceTier(config, resolution('same-id'))).toBe('default');
  expect(configuredServiceTier(config, resolution())).toBe('default');
  expect(configuredServiceTier({ ...config, providerConnections: [{ ...config.providerConnections[1], serviceTier: undefined }] }, resolution('selected'))).toBe('default');
  expect(configuredServiceTier(undefined, resolution('selected'))).toBeUndefined();
});
