import { describe, expect, it } from 'vitest';
import { serviceTierCapability } from './serviceTier.js';
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
