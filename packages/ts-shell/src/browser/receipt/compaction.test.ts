import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { safeReceipt } from "../actionCacheEntry.test.js";
import { createBrowserPersistentReceiptCacheRecord, createBrowserPersistentReceiptCacheTombstone } from "../persistentReceiptCache.js";
import { createBrowserReceiptCacheManifest } from "./manifest.js";
import { createBrowserReceiptCacheStore } from "./store.js";

describe("browser receipt cache compaction and repair", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-receipt-cache-compaction-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("removes duplicates and preserves tombstone semantics in a valid log", () => {
    const manifest = createBrowserReceiptCacheManifest({ cacheRoot: root, maxRecords: 2 });
    const receipt = safeReceipt();
    const record = createBrowserPersistentReceiptCacheRecord({
      receipt,
      source: "test-only",
      now: () => "2026-05-17T00:00:00.000Z",
    });
    expect(record.ok).toBe(true);
    if (!record.ok) {
      throw new Error("record failed");
    }
    const tombstone = createBrowserPersistentReceiptCacheTombstone({
      receiptId: receipt.receiptId,
      status: "deleted",
      source: "test-only",
      reason: "test delete",
      now: "2026-05-17T00:00:02.000Z",
    });
    fs.writeFileSync(
      path.join(root, "browser-receipt-cache.jsonl"),
      `${JSON.stringify(record.record)}\n${JSON.stringify(record.record)}\n${JSON.stringify(tombstone)}\n`,
      "utf8",
    );

    const result = createBrowserReceiptCacheStore({ manifest }).compact();
    expect(result.outcome).toBe("written");
    const report = result.report!;
    const compacted = fs.readFileSync(path.join(root, "browser-receipt-cache.jsonl"), "utf8");
    const store = createBrowserReceiptCacheStore({ manifest });

    expect(report.recordsBefore).toBe(3);
    expect(report.recordsAfter).toBe(1);
    expect(report.tombstonesKept).toBe(1);
    expect(compacted).not.toContain("not-json");
    expect(store.get(receipt.receiptId).status).toBe("missing");
  });

  it("repair preserves a damaged log because a lost tombstone cannot be inferred", () => {
    const manifest = createBrowserReceiptCacheManifest({ cacheRoot: root });
    const record = createBrowserPersistentReceiptCacheRecord({
      receipt: safeReceipt(),
      source: "test-only",
      now: () => "2026-05-17T00:00:00.000Z",
    });
    expect(record.ok).toBe(true);
    if (!record.ok) {
      throw new Error("record failed");
    }
    fs.writeFileSync(
      path.join(root, "browser-receipt-cache.jsonl"),
      `${JSON.stringify(record.record)}\n${JSON.stringify(record.record)}\nRAW_SECRET\n`,
      "utf8",
    );

    const before = fs.readFileSync(path.join(root, "browser-receipt-cache.jsonl"), "utf8");
    const result = createBrowserReceiptCacheStore({ manifest }).repair();
    const repaired = fs.readFileSync(path.join(root, "browser-receipt-cache.jsonl"), "utf8");

    expect(result.outcome).toBe("blocked");
    expect(result.changed).toBe(false);
    expect(repaired).toBe(before);
    expect(JSON.stringify(result)).not.toContain("RAW_SECRET");
  });
});
