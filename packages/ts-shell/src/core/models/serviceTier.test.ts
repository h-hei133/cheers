import { describe, expect, it } from 'vitest';
import { configuredServiceTier, serviceTierCapability } from './serviceTier.js';
import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { BUILTIN_PROVIDERS } from './catalog.js';
import { withSessionServiceTier } from '../commands/model/serviceTier.js';
import { projectModelSelection } from '../../session/model/projection.js';

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

it('binds a session tier to its model and credential scope without replacing either stored default', () => {
  const config = { provider: 'openai', activeProviderConnectionId: 'named',
    providerConnections: [{ id: 'named', provider: 'openai', model: 'base', serviceTier: 'priority' },
      { id: 'sibling', provider: 'openai', model: 'selected', serviceTier: 'default' }],
    providerCredentials: { openai: { model: 'base', serviceTier: 'priority' }, google: { serviceTier: 'default' } },
  } as RuntimeConfig;
  const resolution = (provider: 'openai' | 'google' = 'openai', model = 'selected', connectionId?: string) => ({ provider, model,
    credential: { provider, model, connectionId, authMode: 'api-key' as const, source: 'cli' as const, envVarName: 'FIXTURE' } });
  const selection = { connectionId: 'named', provider: 'openai', model: 'selected', serviceTier: 'flex' } as const;
  const projected = projectModelSelection(config, selection);
  expect(projected.providerConnections[0].serviceTier).toBe('priority');
  expect(projected.providerCredentials).toBe(config.providerCredentials);
  expect(configuredServiceTier(projected, resolution())).toBe('flex');
  expect(configuredServiceTier(projected, resolution('openai', 'selected', 'named'))).toBe('flex');
  expect(configuredServiceTier(projected, resolution('openai', 'selected', 'sibling'))).toBe('default');
  expect(configuredServiceTier(projected, resolution('openai', 'other', 'named'))).toBe('priority');
  expect(configuredServiceTier(projected, resolution('google'))).toBe('default');
  expect(configuredServiceTier(projectModelSelection(config, { ...selection, connectionScope: 'session' }), resolution())).toBe('priority');
  const provider = projectModelSelection(config, { connectionScope: 'provider', provider: 'openai', model: 'selected', serviceTier: 'flex' });
  expect(configuredServiceTier(provider, resolution())).toBe('flex');
  expect(configuredServiceTier(provider, resolution('openai', 'selected', 'named'))).toBe('priority');
  expect(configuredServiceTier(projectModelSelection(projected, { ...selection, serviceTier: undefined }), resolution())).toBe('priority');
  expect(config.providerConnections[0].model).toBe('base');
  expect(config).not.toHaveProperty('sessionServiceTier');
});
