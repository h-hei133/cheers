import { describe, expect, it } from 'vitest';
import { captureCostSchedule, captureModelRates, MAX_COST_TIERS, selectCostRates } from './pricing.js';

const base = { promptPerMTok: 1, completionPerMTok: 2, cacheReadPerMTok: 0.1, cacheWritePerMTok: 1.25 };
const selected = (schedule: unknown, tokens: number, complete = true) => selectCostRates(captureCostSchedule(schedule), {
  inputTokens: tokens, inputComplete: complete,
});

describe('request price schedules', () => {
  it('uses a strict threshold and the highest unsorted override for all categories', () => {
    const schedule = { ...base, tiers: [
      { inputTokensAbove: 200, promptPerMTok: 8, cacheReadPerMTok: 0 },
      { inputTokensAbove: 100, promptPerMTok: 4, completionPerMTok: 40, cacheReadPerMTok: 0.4, cacheWritePerMTok: 5 },
    ] };
    expect(selected(schedule, 100)).toEqual(base);
    expect(selected(schedule, 101)).toEqual({ promptPerMTok: 4, completionPerMTok: 40, cacheReadPerMTok: 0.4, cacheWritePerMTok: 5 });
    expect(selected(schedule, 200)).toEqual({ promptPerMTok: 4, completionPerMTok: 40, cacheReadPerMTok: 0.4, cacheWritePerMTok: 5 });
    expect(selected(schedule, 201)).toEqual({ ...base, promptPerMTok: 8, cacheReadPerMTok: 0 });
  });

  it('captures nested overrides and thresholds before retained caller data changes', () => {
    const tier = { inputTokensAbove: 100, promptPerMTok: 3 };
    const source = { ...base, tiers: [tier] };
    const captured = captureCostSchedule(source)!;
    source.completionPerMTok = 99; tier.inputTokensAbove = 1000; tier.promptPerMTok = 88; source.tiers.length = 0;
    expect(selectCostRates(captured, { inputTokens: 101, inputComplete: true })).toEqual({ ...base, promptPerMTok: 3 });
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured.tiers)).toBe(true);
    expect(Object.isFrozen(captured.tiers?.[0])).toBe(true);
  });

  it('keeps incomplete input unknown while flat prices need no threshold evidence', () => {
    const schedule = captureCostSchedule({ ...base, tiers: [{ inputTokensAbove: 0, promptPerMTok: 3 }] });
    for (const input of [{ inputTokens: 1 }, { inputTokens: 1, inputComplete: false },
      { inputTokens: -1, inputComplete: true }, { inputTokens: 1.5, inputComplete: true },
      { inputTokens: Number.MAX_SAFE_INTEGER + 1, inputComplete: true }, { inputComplete: true }]) {
      expect(selectCostRates(schedule, input)).toBeNull();
    }
    expect(selectCostRates(captureCostSchedule(base), {})).toEqual(base);
    expect(selectCostRates(null, { inputTokens: 1, inputComplete: true })).toBeNull();
  });

  it('never supplies a missing price with zero or a lower tier price', () => {
    const partial = { promptPerMTok: 1, tiers: [{ inputTokensAbove: 0, completionPerMTok: 0 }] };
    expect(selected(partial, 0)).toEqual({ promptPerMTok: 1 });
    expect(selected(partial, 1)).toEqual({ promptPerMTok: 1, completionPerMTok: 0 });
    expect(captureModelRates({ promptPerMTok: 0 })).toEqual({ promptPerMTok: 0 });
    expect(captureModelRates({ cacheReadPerMTok: 0 })).toEqual({ cacheReadPerMTok: 0 });
    expect(captureModelRates(null)).toBeNull();
  });

  it.each([-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1, '100', null])('rejects the invalid threshold %s', threshold => {
    expect(() => captureCostSchedule({ ...base, tiers: [{ inputTokensAbove: threshold, promptPerMTok: 3 }] })).toThrow('Invalid model pricing');
  });

  it('rejects ambiguous or unbounded schedules', () => {
    for (const tiers of [{}, [{ inputTokensAbove: 100 }, { inputTokensAbove: 100 }],
      Array.from({ length: MAX_COST_TIERS + 1 }, (_, inputTokensAbove) => ({ inputTokensAbove }))]) {
      expect(() => captureCostSchedule({ ...base, tiers })).toThrow('Invalid model pricing');
    }
  });

  it('rejects non-data prices without executing accessors or serialization hooks', () => {
    let calls = 0;
    const accessor = { ...base, get tiers() { calls++; return []; } };
    const tier = { inputTokensAbove: 1, get promptPerMTok() { calls++; return 3; } };
    const hooked = { ...base, toJSON() { calls++; return base; } };
    for (const value of [accessor, { ...base, tiers: [tier] }, hooked, new Proxy(base, {})]) {
      expect(() => captureCostSchedule(value)).toThrow('Invalid model pricing');
    }
    expect(calls).toBe(0);
  });
});
