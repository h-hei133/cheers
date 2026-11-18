import { expect, it } from 'vitest';
import { importCatalog } from './catalog.js';

const document = (cost: unknown) => JSON.stringify({ providers: { fixture: { models: [{ id: 'meter', cost }] } } });

it('preserves independent cache capabilities across profile export and import', () => {
  const compat = { promptCacheKey: true, supportsLongCacheRetention: false, supportsExplicitPromptCacheMode: true };
  const body = JSON.stringify({ providers: { fixture: { baseUrl: 'https://relay.fixture/v1', models: [{ id: 'meter', compat }] } } });
  expect(JSON.parse(importCatalog(body)).providers.fixture.models[0].compat).toEqual(compat);
});

it('imports partial schedules, explicit zero and context thresholds without dropping the overrides', () => {
  const cost = { promptPerMTok: 1, cacheReadPerMTok: 0.1, tiers: [{ inputTokensAbove: 100, promptPerMTok: 3, completionPerMTok: 0 }] };
  const imported = JSON.parse(importCatalog(document(cost)));
  expect(imported.providers.fixture.models[0].cost).toEqual(cost);
  expect(imported.providers.fixture.models[0].cost).not.toHaveProperty('completionPerMTok');
});

it.each([{ tiers: [{ inputTokensAbove: -1 }] }, { tiers: [{ inputTokensAbove: 0.5 }] },
  { tiers: [{ inputTokensAbove: Number.MAX_SAFE_INTEGER + 1 }] },
  { tiers: [{ inputTokensAbove: 100 }, { inputTokensAbove: 100 }] },
  { tiers: Array.from({ length: 65 }, (_, inputTokensAbove) => ({ inputTokensAbove })) },
  { tiers: [{ inputTokensAbove: 1, cacheWritePerMTok: -1 }] }])('rejects malformed or ambiguous imported schedules', cost => {
  expect(() => importCatalog(document(cost))).toThrow(/invalid|Invalid/);
});

it.each([
  { providers: [{}] },
  { providers: { fixture: { baseUrl: [{}] } } },
  { providers: { fixture: { models: [[{}]] } } },
])('uses the catalog validation error for mismatched array shapes', input => {
  expect(() => importCatalog(JSON.stringify(input))).toThrow('Imported catalog contains invalid declared data.');
});

it('drops undeclared own names even when they match properties on Object.prototype', () => {
  const input = '{"constructor":42,"providers":{"fixture":{"toString":"extra","models":[{"id":"meter","__proto__":{},"valueOf":1}]}}}';
  expect(JSON.parse(importCatalog(input))).toEqual({ providers: { fixture: { models: [{ id: 'meter' }] } } });
});
