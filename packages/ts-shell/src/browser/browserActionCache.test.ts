import { describe, expect, it } from "vitest";
import { createBrowserActionCache } from "./browserActionCache.js";
import { safeReceipt } from "./browserActionCacheEntry.test.js";

describe("browser action cache", () => {
  it("adds, gets, replaces, lists, and clears in-memory receipt entries", () => {
    const cache = createBrowserActionCache({ maxEntries: 1 });
    const first = cache.addReceipt(safeReceipt());
    const second = cache.addReceipt(safeReceipt());

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(cache.summary().entryCount).toBe(1);
    expect(cache.get("browser-receipt:browser-exec-cache-entry-local-fixture-executed")).toBeDefined();
    expect(cache.list()).toHaveLength(1);
    expect(cache.getReceipt("browser-receipt:browser-exec-cache-entry-local-fixture-executed")).toBeDefined();
    expect(cache.clear().cleared).toBe(1);
    expect(cache.summary().entryCount).toBe(0);
  });
});
