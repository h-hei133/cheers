import { expect, it } from 'vitest';
import { importCatalog } from './catalog.js';

const document = (cost: unknown) => JSON.stringify({ providers: { fixture: { models: [{ id: 'meter', cost }] } } });

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
