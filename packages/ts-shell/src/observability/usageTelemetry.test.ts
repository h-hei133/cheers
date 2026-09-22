import { describe, expect, it } from "vitest";
import {
  USAGE_RATES,
  estimateUsageCost,
  getSessionUsage,
  recordSessionUsage,
  resetSessionUsage,
} from "./usageTelemetry.js";
import type { ModelCostRates } from "../core/models/catalog.js";

/**
 * What a session spent.
 *
 * The cost is a multiplication, so the thing worth testing is which rates went
 * into it: a published price list and a fallback constant produce the same shape
 * of number and completely different claims.
 */

const PUBLISHED: ModelCostRates = {
  promptPerMTok: 3,
  completionPerMTok: 15,
  cacheReadPerMTok: 0.3,
  cacheWritePerMTok: 3.75,
};

describe("session usage", () => {
  it("accumulates cache traffic across turns", () => {
    resetSessionUsage("cache-session");
    recordSessionUsage("cache-session", { promptTokens: 100, cacheReadTokens: 900, cacheWriteTokens: 50 });
    recordSessionUsage("cache-session", { promptTokens: 100, cacheReadTokens: 600, cacheWriteTokens: 25 });

    const usage = getSessionUsage("cache-session");
    expect(usage.cacheReadTokens).toBe(1_500);
    expect(usage.cacheWriteTokens).toBe(75);
    resetSessionUsage("cache-session");
  });

  it("reports zero cache traffic for a provider that never mentions it", () => {
    resetSessionUsage("no-cache");
    recordSessionUsage("no-cache", { promptTokens: 100, completionTokens: 10 });

    const usage = getSessionUsage("no-cache");
    expect(usage.cacheReadTokens).toBe(0);
    expect(usage.cacheWriteTokens).toBe(0);
    resetSessionUsage("no-cache");
  });

  it("prices with the published rates when there are any", () => {
    resetSessionUsage("priced");
    recordSessionUsage("priced", {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    });

    const usage = getSessionUsage("priced");
    // 3 + 15 + 0.3 + 3.75 per million, one million of each.
    expect(estimateUsageCost(usage, PUBLISHED)).toBeCloseTo(22.05, 6);
    resetSessionUsage("priced");
  });

  it("prices differently under the fallback rates", () => {
    // The two must not be interchangeable: a report that cannot tell a published
    // price from a constant is not telling the reader anything.
    resetSessionUsage("fallback");
    recordSessionUsage("fallback", { promptTokens: 1_000_000, completionTokens: 1_000_000 });

    const usage = getSessionUsage("fallback");
    const withPublished = estimateUsageCost(usage, PUBLISHED);
    const withFallback = estimateUsageCost(usage, USAGE_RATES);

    expect(withPublished).toBeCloseTo(18, 6);
    expect(withFallback).toBeCloseTo(0.42, 6);
    expect(withPublished).not.toBeCloseTo(withFallback, 6);
    resetSessionUsage("fallback");
  });

  it("does not charge for cache traffic when the rates do not price it", () => {
    // A rate list without cache prices is a model that does not charge for them
    // separately, not a reason to invent a rate.
    resetSessionUsage("unpriced-cache");
    recordSessionUsage("unpriced-cache", {
      promptTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    });

    const usage = getSessionUsage("unpriced-cache");
    const withoutCacheRates: ModelCostRates = { promptPerMTok: 1, completionPerMTok: 2 };
    expect(estimateUsageCost(usage, withoutCacheRates)).toBeCloseTo(1, 6);
    resetSessionUsage("unpriced-cache");
  });
});
