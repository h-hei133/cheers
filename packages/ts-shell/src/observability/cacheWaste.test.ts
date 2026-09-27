import { describe, expect, it } from "vitest";
import { summarizeCacheUsage } from "./cacheWaste.js";

describe("summarizeCacheUsage", () => {
  it("reports cache reads as a percentage of prompt tokens over the retained history", () => {
    const result = summarizeCacheUsage([
      { promptTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 1000, bucketKey: "p/m", timestamp: 1, reportedCache: true, kind: "request" },
      { promptTokens: 2000, cacheReadTokens: 1500, cacheWriteTokens: 0, bucketKey: "p/m", timestamp: 2, reportedCache: true, kind: "request" },
    ]);

    expect(result).toEqual({ promptTokens: 3000, cacheReadTokens: 1500, hitRate: 50, requestCount: 2 });
  });

  it("does not claim a hit rate when no request reports cache accounting", () => {
    const result = summarizeCacheUsage([
      { promptTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0, bucketKey: "p/m", timestamp: 1, reportedCache: false, kind: "request" },
    ]);

    expect(result).toEqual({ promptTokens: 0, cacheReadTokens: 0, hitRate: undefined, requestCount: 0 });
  });
});
