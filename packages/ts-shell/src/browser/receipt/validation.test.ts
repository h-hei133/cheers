import { describe, expect, it } from "vitest";
import { safeReceipt } from "../actionCacheEntry.test.js";
import { createBrowserActionCacheEntryFromReceipt } from "../actionCacheEntry.js";
import { createBrowserPersistentReceiptCacheRecord, createBrowserPersistentReceiptCacheTombstone, parseBrowserPersistentReceiptCacheRecord } from "../persistentReceiptCache.js";

function active() {
  const result = createBrowserPersistentReceiptCacheRecord({ receipt: safeReceipt(), source: "test-only" });
  if (!result.ok) throw new Error("fixture receipt rejected");
  return JSON.parse(JSON.stringify(result.record));
}

describe("persistent receipt validation", () => {
  it("accepts producer roundtrips and property reordering", () => {
    const record = active();
    record.cacheEntry = Object.fromEntries(Object.entries(record.cacheEntry).reverse());
    expect(parseBrowserPersistentReceiptCacheRecord(record)).toEqual(record);
    const tombstone = createBrowserPersistentReceiptCacheTombstone({ receiptId: "receipt", status: "deleted", source: "test-only", reason: "test", now: "2026-10-02T00:00:00.000Z" });
    expect(parseBrowserPersistentReceiptCacheRecord(JSON.parse(JSON.stringify(tombstone)))).toEqual(tombstone);
  });

  it.each([
    ["source", "future"], ["createdAt", "not-a-date"], ["warnings", [1]], ["reason", "unexpected"],
    ["createdAt", "2026-10-02 (password=FAKE_TEST_ONLY)"], ["cacheEntry.createdAt", "2026-10-02 (password=FAKE_TEST_ONLY)"],
    ["receipt.executed", "true"], ["receipt.providerCall", "called"], ["receipt.createdAt", "invalid"],
    ["receipt.evidenceBundle.rawContent", "included"], ["receipt.evidenceBundle.evidenceReferences", [{}]],
    ["receipt.evidenceBundle.safety.blockers", false], ["receipt.replayReadiness.persistence", "disk"],
    ["receipt.replayReadiness.actionCacheMetadata.variableKeys", [1]], ["receipt.unknown", "extra"],
    ["cacheEntry.warnings", undefined], ["cacheEntry.safeUrl", "local-fixture://different"],
    ["cacheEntry.sourceReceiptId", "different"], ["cacheEntry.replayReadinessSnapshot.status", "replay-blocked"],
    ["evidenceSummary", "token=example-sensitive-value"],
  ])("rejects malformed or inconsistent %s", (field, value) => {
    const record = active();
    const parts = (field as string).split(".");
    let parent = record;
    for (const key of parts.slice(0, -1)) parent = parent[key];
    parent[parts.at(-1)!] = value;
    expect(parseBrowserPersistentReceiptCacheRecord(record)).toBeUndefined();
  });

  it.each(["failed", "unexecuted", "unsafe"])("rejects mutually matching ready snapshots for a %s source", (state) => {
    const record = active();
    if (state === "failed") record.receipt.status = "failed";
    if (state === "unexecuted") record.receipt.executed = false;
    if (state === "unsafe") record.receipt.evidenceBundle.safety.safetyStatus = "unsafe";
    const derived = createBrowserActionCacheEntryFromReceipt({ receipt: record.receipt });
    if (!derived.ok) throw new Error("entry fixture rejected");
    record.cacheEntry = derived.entry;
    expect(parseBrowserPersistentReceiptCacheRecord(record)).toBeUndefined();
    expect(createBrowserPersistentReceiptCacheRecord({ receipt: record.receipt, source: "test-only" }).ok).toBe(false);
  });

  it("rejects cyclic input and contradictory tombstones without throwing", () => {
    const record = active();
    record.receipt.circular = record;
    expect(parseBrowserPersistentReceiptCacheRecord(record)).toBeUndefined();
    const tombstone = createBrowserPersistentReceiptCacheTombstone({ receiptId: "receipt", status: "invalidated", source: "test-only", reason: "test", now: "2026-10-02T00:00:00.000Z" });
    expect(parseBrowserPersistentReceiptCacheRecord({ ...tombstone, receipt: safeReceipt() })).toBeUndefined();
    expect(parseBrowserPersistentReceiptCacheRecord({ ...tombstone, invalidatedAt: "different" })).toBeUndefined();
  });
});
