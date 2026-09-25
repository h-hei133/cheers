import { describe, expect, it } from "vitest";
import {
  CACHE_WARMING_MODES,
  IDLE_CONTINUATION_PROBABILITY,
  MINIMUM_EXPECTED_SAVINGS,
  cacheWarmingDelayMs,
  cacheWarmingStopReason,
  evaluateCacheWarming,
  resolveCacheWarmingMode,
} from "./cacheEconomics.js";
import type { ModelCostRates } from "./catalog.js";

/**
 * When keeping a prompt cached is worth what it costs.
 *
 * The decision spends money, so what it refuses matters as much as what it
 * chooses: warming a model whose prices are unknown would spend on a saving that
 * was never computed, and the tests below pin both directions.
 */

/** A model that publishes the rates a caching provider charges. */
const priced: ModelCostRates = {
  promptPerMTok: 3,
  completionPerMTok: 15,
  cacheReadPerMTok: 0.3,
  cacheWritePerMTok: 3.75,
};

describe("the warming delay", () => {
  it("lands before the window lapses, not on it", () => {
    // On the boundary a little clock skew makes the refresh a full-price
    // rewrite, which is the cost this exists to avoid.
    const delay = cacheWarmingDelayMs(300_000);
    expect(delay).toBe(270_000);
    expect(delay!).toBeLessThan(300_000);
  });

  it("declines a window too short to leave a margin", () => {
    // Ten seconds of margin is all the arithmetic allows; below that there is
    // nothing left to schedule against.
    expect(cacheWarmingDelayMs(10_000)).toBeUndefined();
    expect(cacheWarmingDelayMs(5_000)).toBeUndefined();
    expect(cacheWarmingDelayMs(10_001)).toBe(1);
  });

  it("declines a window that is not a number at all", () => {
    expect(cacheWarmingDelayMs(Number.NaN)).toBeUndefined();
    expect(cacheWarmingDelayMs(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe("the warming decision", () => {
  it("refuses a model that publishes no prices, and says why", () => {
    // The saving is arithmetic on prices. Without them the number would be
    // invented, and inventing one spends real money on a made-up benefit.
    const decision = evaluateCacheWarming({ promptTokens: 50_000, phase: "streaming" });

    expect(decision.action).toBe("stop");
    expect(decision.economicsAvailable).toBe(false);
    expect(cacheWarmingStopReason(decision)).toContain("no prices");
  });

  it("refuses an empty prompt even when the model is priced", () => {
    // Nothing cached is nothing to refresh.
    const decision = evaluateCacheWarming({ cost: priced, promptTokens: 0, phase: "streaming" });

    expect(decision.action).toBe("stop");
    expect(decision.economicsAvailable).toBe(false);
  });

  it("refuses when the saving would be smaller than the threshold", () => {
    // A cheap model with a short prompt: the miss costs almost nothing, so the
    // refresh costs more than it saves.
    const decision = evaluateCacheWarming({
      cost: { promptPerMTok: 0.1, completionPerMTok: 0.4, cacheReadPerMTok: 0.01 },
      promptTokens: 1_000,
      phase: "streaming",
    });

    expect(decision.economicsAvailable).toBe(true);
    expect(decision.expectedSavings).toBeLessThan(MINIMUM_EXPECTED_SAVINGS);
    expect(decision.action).toBe("stop");
  });

  it("warms when a large prompt on a priced model clears the threshold", () => {
    const decision = evaluateCacheWarming({ cost: priced, promptTokens: 200_000, phase: "streaming" });

    expect(decision.economicsAvailable).toBe(true);
    expect(decision.expectedSavings).toBeGreaterThanOrEqual(MINIMUM_EXPECTED_SAVINGS);
    expect(decision.action).toBe("warm");
    expect(cacheWarmingStopReason(decision)).toBeUndefined();
  });

  it("weighs the same inputs differently while the session waits", () => {
    // The only difference between the phases is how likely another request is.
    // While a run is under way it is certain; while the user is away it is a
    // bet, and the bet has to be worth more to be taken.
    const streaming = evaluateCacheWarming({ cost: priced, promptTokens: 60_000, phase: "streaming" });
    const idle = evaluateCacheWarming({ cost: priced, promptTokens: 60_000, phase: "idle" });

    expect(idle.continuationProbability).toBe(IDLE_CONTINUATION_PROBABILITY);
    expect(streaming.continuationProbability).toBe(1);
    expect(idle.expectedSavings).toBeLessThan(streaming.expectedSavings);
    // Same costs on both sides: the phase changes the weighting, not the prices.
    expect(idle.warmCost).toBe(streaming.warmCost);
    expect(idle.missCost).toBe(streaming.missCost);
  });

  it("charges an input rate when the model publishes no cache-write rate", () => {
    // Establishing the entry is what the miss pays for, and a model that does
    // not distinguish the two is charged its ordinary input rate.
    const noWriteRate = evaluateCacheWarming({
      cost: { promptPerMTok: 3, completionPerMTok: 15, cacheReadPerMTok: 0.3 },
      promptTokens: 100_000,
      phase: "streaming",
    });
    const withWriteRate = evaluateCacheWarming({ cost: priced, promptTokens: 100_000, phase: "streaming" });

    expect(noWriteRate.missCost).toBeGreaterThan(0);
    expect(withWriteRate.missCost).toBeGreaterThan(noWriteRate.missCost);
  });

  it("never reports a negative miss cost", () => {
    // A cache read that costs more than a write would make the difference
    // negative, and a negative miss would justify a refresh by saving nothing.
    const decision = evaluateCacheWarming({
      cost: { promptPerMTok: 1, completionPerMTok: 1, cacheReadPerMTok: 5 },
      promptTokens: 10_000,
      phase: "streaming",
    });

    expect(decision.missCost).toBe(0);
  });
});

describe("the mode", () => {
  it("accepts the three modes it defines", () => {
    for (const mode of CACHE_WARMING_MODES) {
      expect(resolveCacheWarmingMode(mode)).toBe(mode);
    }
  });

  it("falls back to the default for anything else", () => {
    // A typo in a config file must not silently pick a mode nobody chose.
    expect(resolveCacheWarmingMode("sometimes")).toBe("streaming");
    expect(resolveCacheWarmingMode(undefined)).toBe("streaming");
    expect(resolveCacheWarmingMode(7)).toBe("streaming");
  });
});
