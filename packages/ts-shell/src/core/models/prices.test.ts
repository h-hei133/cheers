import { expect, it } from 'vitest';
import { projectIndexPrices } from './prices.js';
import { selectCostRates } from './pricing.js';

it('projects authoritative context tiers without using the legacy threshold or service prices', () => {
  const schedule = projectIndexPrices({ input: 2, output: 12, cache_read: 0.2, cache_write: 2.5,
    tiers: [{ input: 4, output: 18, cache_read: 0.4, cache_write: 5, tier: { type: 'context', size: 272_000 } },
      { input: 20, tier: { type: 'service', name: 'priority' } }],
    context_over_200k: { input: 4, output: 18, cache_read: 0.4, cache_write: 5 } })!;
  expect(schedule.tiers).toEqual([{ inputTokensAbove: 272_000, promptPerMTok: 4, completionPerMTok: 18,
    cacheReadPerMTok: 0.4, cacheWritePerMTok: 5 }]);
  expect(selectCostRates(schedule, { inputTokens: 250_000, inputComplete: true })?.promptPerMTok).toBe(2);
  expect(selectCostRates(schedule, { inputTokens: 272_001, inputComplete: true })?.promptPerMTok).toBe(4);
});

it('retains a supported legacy threshold only when no tier array was declared', () => {
  expect(projectIndexPrices({ input: 3, context_over_200k: { input: 6, cache_read: 0 } })).toEqual({ promptPerMTok: 3,
    tiers: [{ inputTokensAbove: 200_000, promptPerMTok: 6, cacheReadPerMTok: 0 }] });
  expect(projectIndexPrices({ input: 3, tiers: [], context_over_200k: { input: 6 } })).toEqual({ promptPerMTok: 3 });
});

it('distinguishes missing, cache-only and explicitly zero base prices', () => {
  expect(projectIndexPrices(undefined)).toBeUndefined();
  expect(projectIndexPrices({})).toBeUndefined();
  expect(projectIndexPrices({ input: 1, cache_read: 0.1 })).toEqual({ promptPerMTok: 1, cacheReadPerMTok: 0.1 });
  expect(projectIndexPrices({ cache_read: 0 })).toEqual({ cacheReadPerMTok: 0 });
  expect(projectIndexPrices({ input: 0, output: 0 })).toEqual({ promptPerMTok: 0, completionPerMTok: 0 });
});

it.each([null, { input: -1 }, { input: '1' }, { tiers: {} },
  { input: 1, tiers: [{ input: 2, tier: { type: 'context', size: 1.5 } }] },
  { input: 1, tiers: [{ tier: { type: 'context', size: 2 } }, { tier: { type: 'context', size: 2 } }] }])(
  'rejects malformed published prices safely', value => {
    expect(() => projectIndexPrices(value)).toThrow(/Invalid .*pric/);
  },
);
