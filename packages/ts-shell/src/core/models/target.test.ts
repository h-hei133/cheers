import { expect, it } from 'vitest';
import { catalogModel, catalogProvider, providerEndpoint, type CatalogProvider } from './catalog.js';
import { effortCapability } from './capability.js';
import { serviceTierCapability } from './serviceTier.js';
import { resolveRequestShape } from './requestShape.js';
import { resolveContextWindow, resolveModelCost } from './window.js';

const catalog: readonly CatalogProvider[] = [
  { id: 'openai', runtime: 'openai', label: 'Canonical', auth: 'api-key', models: [{ id: 'shared', contextWindow: 64000, maxTokens: 4000,
    reasoning: false, cost: { promptPerMTok: 8, completionPerMTok: 16 } }] },
  { id: 'relay-a', runtime: 'openai', label: 'Relay A', auth: 'api-key', baseUrl: 'https://a.invalid/v1', endpoint: 'openai-compatible',
    models: [{ id: 'shared', contextWindow: 16000, maxTokens: 1000, reasoning: true, thinkingLevelMap: { high: 'strong' },
      cost: { promptPerMTok: 1, completionPerMTok: 2 }, serviceTiers: ['flex'], compat: { supportsTemperature: false } }] },
  { id: 'relay-b', runtime: 'openai', label: 'Relay B', auth: 'api-key', baseUrl: 'https://b.invalid/v1', endpoint: 'anthropic-messages',
    models: [{ id: 'shared', contextWindow: 32000, maxTokens: 2000, reasoning: true, thinkingLevelMap: { high: null } }, { id: 'only-b' }] },
];

it('takes capabilities, budget, protocol and price from the exact relay instead of its canonical runtime', () => {
  const baseUrl = 'https://a.invalid/v1/';
  expect(catalogProvider(catalog, 'openai', baseUrl).entry?.id).toBe('relay-a');
  expect(providerEndpoint(catalog, 'openai', baseUrl)).toBe('openai-compatible');
  expect(catalogModel(catalog, 'openai', 'shared', baseUrl)?.maxTokens).toBe(1000);
  expect(resolveContextWindow({ catalog, provider: 'openai', model: 'shared', baseUrl })).toMatchObject({ source: 'catalog', window: 16000 });
  expect(resolveModelCost(catalog, 'openai', 'shared', baseUrl)).toEqual({ promptPerMTok: 1, completionPerMTok: 2 });
  expect(effortCapability(catalog, 'openai', 'shared', 'high', baseUrl)).toBe('supported');
  expect(serviceTierCapability(catalog, 'openai', 'shared', 'flex', baseUrl)).toBe('supported');
  expect(resolveRequestShape(catalog, 'openai', 'shared', 'high', baseUrl)).toMatchObject({ thinkingLevelName: 'strong', maxOutputCeiling: 1000, supportsTemperature: false });
});

it('preserves unknown fields and unsupported levels in another relay without borrowing canonical metadata', () => {
  const baseUrl = 'https://b.invalid/v1';
  expect(resolveModelCost(catalog, 'openai', 'shared', baseUrl)).toBeUndefined();
  expect(serviceTierCapability(catalog, 'openai', 'shared', 'flex', baseUrl)).toBe('unsupported');
  expect(providerEndpoint(catalog, 'openai', baseUrl)).toBe('anthropic-messages');
  expect(effortCapability(catalog, 'openai', 'shared', 'high', baseUrl)).toBe('unsupported');
  expect(catalogModel(catalog, 'openai', 'only-b', 'https://a.invalid/v1')).toBeUndefined();
});

it('keeps canonical models on unspecified relays without guessing an unrelated unique vendor model', () => {
  expect(catalogModel(catalog, 'openai', 'shared', 'https://a.invalid/v10')?.contextWindow).toBe(64000);
  expect(catalogModel(catalog, 'openai', 'only-b', 'https://unknown.invalid/v1')).toBeUndefined();
  expect(catalogModel(catalog, 'openai', 'only-b')).toBe(catalog[2].models[1]);
});

it('reports ambiguous relay ownership without selecting a protocol or metadata by ordering', () => {
  const entries = [...catalog, { ...catalog[1], id: 'duplicate', endpoint: 'anthropic-messages' as const }];
  const baseUrl = 'https://a.invalid/v1';
  expect(catalogProvider(entries, 'openai', baseUrl)).toEqual({ ambiguous: true, conflicts: ['relay-a', 'duplicate'] });
  expect(catalogModel(entries, 'openai', 'shared', baseUrl)).toBeUndefined();
  expect(providerEndpoint(entries, 'openai', baseUrl)).toBeUndefined();
  expect(resolveContextWindow({ catalog: entries, provider: 'openai', model: 'shared', baseUrl })).toMatchObject({ source: 'default', warning: expect.stringContaining('relay-a, duplicate') });
});

it('keeps historical provider/model-only prices independent from the current default relay', () => {
  const entries = catalog.map(entry => entry.id === 'openai' ? { ...entry, baseUrl: 'https://a.invalid/v1' } : entry);
  expect(effortCapability(entries, 'openai', 'shared', 'high')).toBe('supported');
  expect(resolveRequestShape(entries, 'openai', 'shared', 'high').thinkingLevelName).toBe('strong');
  expect(resolveContextWindow({ catalog: entries, provider: 'openai', model: 'shared' }).window).toBe(16000);
  expect(resolveModelCost(entries, 'openai', 'shared')).toEqual({ promptPerMTok: 8, completionPerMTok: 16 });
  expect(resolveModelCost(entries, 'openai', 'shared', 'https://a.invalid/v1')).toEqual({ promptPerMTok: 1, completionPerMTok: 2 });
});
