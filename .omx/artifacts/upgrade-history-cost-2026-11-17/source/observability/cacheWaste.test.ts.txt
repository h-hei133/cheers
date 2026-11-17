import { describe, expect, it } from "vitest";
import { CACHE_TTL_MS, formatCacheMissNotice, summarizeCacheUsage } from "./cacheWaste.js";

describe("summarizeCacheUsage", () => {
  it("reports cache reads as a percentage of prompt tokens over the retained history", () => {
    const result = summarizeCacheUsage([
      { promptTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 1000, cacheReadReported: true, cacheWriteReported: true,
        bucketKey: "p/m", timestamp: 1, reportedCache: true, kind: "request" },
      { promptTokens: 2000, cacheReadTokens: 1500, cacheWriteTokens: 0, cacheReadReported: true, cacheWriteReported: true,
        bucketKey: "p/m", timestamp: 2, reportedCache: true, kind: "request" },
    ]);

    expect(result).toEqual({ promptTokens: 3000, cacheReadTokens: 1500, hitRate: 50, requestCount: 2 });
  });

  it("does not claim a hit rate when no request reports cache accounting", () => {
    const result = summarizeCacheUsage([
      { promptTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0, cacheReadReported: false, cacheWriteReported: false,
        bucketKey: "p/m", timestamp: 1, reportedCache: false, kind: "request" },
    ]);

    expect(result).toEqual({ promptTokens: 0, cacheReadTokens: 0, hitRate: undefined, requestCount: 0 });
  });
});

it('describes an idle gap as possible expiry rather than a measured provider TTL', () => {
  const notice = formatCacheMissNotice({ missedTokens: 10_000, missedCost: 0.009,
    idleMs: CACHE_TTL_MS + 1_000, modelChanged: false });
  expect(notice).toContain('Estimated cache miss');
  expect(notice).toContain('possible expiry');
  expect(notice).not.toContain('> TTL');
});
