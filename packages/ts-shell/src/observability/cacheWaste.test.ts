import { describe, expect, it } from "vitest";
import type { ModelCostRates } from "../core/models/catalog.js";
import { CACHE_TTL_MS, NOISE_FLOOR_TOKENS } from "./cacheWaste.js";
import { findCacheWaste, type CacheRateLookup } from "./cacheWaste.js";
import type { UsageHistoryEntry } from "./usageTelemetry.js";

/**
 * The numbers here are the ones a wrong answer would be plausible with: a miss
 * just under the noise floor, a prompt that shrank, a model that changed. What is
 * asserted is the money and the token count, because those are what a user reads
 * and what a plausible mistake would corrupt.
 */

/** Rates in dollars per million tokens, which is how providers publish them. */
const RATES: Record<string, ModelCostRates> = {
  "alpha/fast": { promptPerMTok: 3, completionPerMTok: 15, cacheReadPerMTok: 0.3, cacheWritePerMTok: 3.75 },
  "alpha/slow": { promptPerMTok: 6, completionPerMTok: 30, cacheReadPerMTok: 0.6, cacheWritePerMTok: 7.5 },
};

const rateFor: CacheRateLookup = (provider, model) => RATES[`${provider}/${model}`];

/** One request, with the prompt total derived the way the recorder derives it. */
function request(input: {
  readonly input: number;
  readonly cacheRead?: number;
  readonly cacheWrite?: number;
  readonly bucketKey?: string;
  readonly timestamp?: number;
}): UsageHistoryEntry {
  const cacheRead = input.cacheRead ?? 0;
  const cacheWrite = input.cacheWrite ?? 0;
  return {
    promptTokens: input.input + cacheRead + cacheWrite,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    bucketKey: input.bucketKey ?? "alpha/fast",
    timestamp: input.timestamp ?? 0,
    reportedCache: cacheRead + cacheWrite > 0,
    kind: "request",
  };
}

const reset = (timestamp: number): UsageHistoryEntry => ({
  promptTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  bucketKey: "alpha/fast",
  timestamp,
  reportedCache: true,
  kind: "context-reset",
});

describe("findCacheWaste", () => {
  it("counts the prompt that was sent before and billed in full again", () => {
    // A 100k prompt, then the same conversation with only 1k read from cache.
    // 99k of it was already sent, so that is what was re-billed.
    const report = findCacheWaste(
      [request({ input: 100_000 }), request({ input: 99_000, cacheRead: 1_000 })],
      rateFor,
    );

    expect(report.totals.missCount).toBe(1);
    expect(report.misses[0]?.missedTokens).toBe(99_000);
    // 3.00 - 0.30 per million, applied to 99k tokens.
    expect(report.misses[0]?.missedCost).toBeCloseTo((2.7 / 1_000_000) * 99_000, 6);
  });

  it("counts nothing for the first request, which had nothing to reuse", () => {
    const report = findCacheWaste([request({ input: 100_000 })], rateFor);
    expect(report.totals.missCount).toBe(0);
    expect(report.totals.missedTokens).toBe(0);
  });

  it("counts nothing when the prompt was read from cache", () => {
    // The same conversation, fully cached: 100k sent, 100k read.
    const report = findCacheWaste(
      [request({ input: 100_000 }), request({ input: 0, cacheRead: 100_000 })],
      rateFor,
    );
    expect(report.totals.missCount).toBe(0);
  });

  /**
   * The prompt is 100k both times. What varies is how much of it came from the
   * cache, so the shortfall is exactly the difference: 100k minus the reads.
   */
  it("leaves a shortfall at the noise floor uncounted", () => {
    // Cache breakpoints land somewhere inside the text, so a boundary this close
    // is how the mechanism works rather than a failure of it.
    const current = request({ input: NOISE_FLOOR_TOKENS, cacheRead: 100_000 - NOISE_FLOOR_TOKENS });
    expect(current.promptTokens).toBe(100_000);
    const report = findCacheWaste([request({ input: 100_000 }), current], rateFor);

    expect(report.totals.missCount).toBe(0);
  });

  it("counts a shortfall just above the noise floor", () => {
    const current = request({ input: NOISE_FLOOR_TOKENS + 1, cacheRead: 100_000 - NOISE_FLOOR_TOKENS - 1 });
    expect(current.promptTokens).toBe(100_000);
    const report = findCacheWaste([request({ input: 100_000 }), current], rateFor);

    expect(report.totals.missCount).toBe(1);
    expect(report.misses[0]?.missedTokens).toBe(NOISE_FLOOR_TOKENS + 1);
  });

  it("does not charge for tokens the current request never sent", () => {
    // The prompt shrank — the conversation was trimmed, or a turn carried less.
    // Only what was actually sent again could have been cached.
    const report = findCacheWaste(
      [request({ input: 200_000 }), request({ input: 5_000 })],
      rateFor,
    );
    expect(report.misses[0]?.missedTokens).toBe(5_000);
  });

  it("does not count the prompt that follows a rebuilt context", () => {
    // A compaction replaces the conversation, so this prompt shares nothing with
    // the one before it and every token in it would otherwise look like a miss.
    const report = findCacheWaste(
      [request({ input: 200_000 }), reset(1), request({ input: 100_000 })],
      rateFor,
    );
    expect(report.totals.missCount).toBe(0);
  });

  it("says a model change is a change rather than silently dropping it", () => {
    const report = findCacheWaste(
      [
        request({ input: 100_000, bucketKey: "alpha/fast" }),
        request({ input: 100_000, bucketKey: "alpha/slow" }),
      ],
      rateFor,
    );
    expect(report.totals.missCount).toBe(1);
    expect(report.misses[0]?.modelChanged).toBe(true);
  });

  it("reports the idle gap between requests", () => {
    const report = findCacheWaste(
      [request({ input: 100_000, timestamp: 1_000 }), request({ input: 50_000, cacheRead: 0, timestamp: 1_000 + CACHE_TTL_MS + 1 })],
      rateFor,
    );
    expect(report.misses[0]?.idleMs).toBe(CACHE_TTL_MS + 1);
  });

  it("judges nothing for a model with no published rates", () => {
    // The tokens are known and the money is not. Guessing a rate would produce a
    // figure that reads as measured.
    const report = findCacheWaste(
      [
        request({ input: 100_000, bucketKey: "unknown/model" }),
        request({ input: 100_000, bucketKey: "unknown/model" }),
      ],
      rateFor,
    );
    expect(report.totals.missCount).toBe(0);
  });

  it("does not report a negative cost when reads are priced above the full rate", () => {
    const inverted: CacheRateLookup = () => ({
      promptPerMTok: 1,
      completionPerMTok: 2,
      cacheReadPerMTok: 10,
    });
    const report = findCacheWaste(
      [request({ input: 100_000 }), request({ input: 100_000 })],
      inverted,
    );
    expect(report.misses[0]?.missedCost).toBe(0);
  });

  it("sums several misses into the totals", () => {
    const report = findCacheWaste(
      [
        request({ input: 100_000 }),
        request({ input: 100_000 }),
        request({ input: 100_000 }),
      ],
      rateFor,
    );
    expect(report.totals.missCount).toBe(2);
    expect(report.totals.missedTokens).toBe(200_000);
  });
});
