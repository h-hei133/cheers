import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { safeReceipt } from "../actionCacheEntry.test.js";
import { createBrowserReceiptCacheManifest } from "./manifest.js";
import { createBrowserReceiptCacheStore } from "./store.js";
import { inspectBrowserReceiptCacheHealth } from "./health.js";

describe("browser receipt cache store", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-receipt-cache-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("writes, gets, lists, invalidates, and deletes sanitized records", () => {
    const store = createBrowserReceiptCacheStore({
      manifest: createBrowserReceiptCacheManifest({
        cacheRoot: root,
        allowedOperations: ["read", "write", "invalidate", "delete"],
      }),
      now: () => "2026-05-17T00:00:00.000Z",
    });
    const receipt = safeReceipt();

    const write = store.writeReceipt(receipt);
    expect(write.written).toBe(true);
    expect(store.get(receipt.receiptId)).toMatchObject({ status: "found", record: { status: "active" } });
    expect(store.list().records).toHaveLength(1);

    const invalidated = store.invalidate(receipt.receiptId, "test invalidation");
    expect(invalidated.changed).toBe(true);
    expect(store.get(receipt.receiptId).status).toBe("missing");
    expect(store.health().invalidatedCount).toBe(1);

    const deleted = store.delete(receipt.receiptId, "test delete");
    expect(deleted.changed).toBe(true);
    expect(store.health().deletedCount).toBe(1);
    const cacheFile = fs.readFileSync(path.join(root, "browser-receipt-cache.jsonl"), "utf8");
    expect(cacheFile).not.toContain("RAW_");
    expect(cacheFile).not.toContain("Route 107 fixture");
  });

  it("reports corrupted records safely", () => {
    const store = createBrowserReceiptCacheStore({
      manifest: createBrowserReceiptCacheManifest({
        cacheRoot: root,
        allowedOperations: ["read", "write"],
      }),
    });
    fs.writeFileSync(path.join(root, "browser-receipt-cache.jsonl"), "not-json\n", "utf8");

    const health = inspectBrowserReceiptCacheHealth(store);

    expect(health.status).toBe("invalid");
    expect(health.corruptedCount).toBe(1);
    expect(health.warnings).toContain("browser-receipt-cache-recovery:records-skipped");
  });
});
