import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeReceipt } from "../actionCacheEntry.test.js";
import { createBrowserReceiptCacheManifest } from "./manifest.js";
import { createBrowserReceiptCacheStore } from "./store.js";
import { acquireBrowserReceiptCacheLock, browserReceiptCacheLockPath } from "./lock.js";

describe("receipt persistence lifecycle", () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-lifecycle-")); });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
  const now = () => "2026-10-02T00:00:00.000Z";
  function store() {
    return createBrowserReceiptCacheStore({ manifest: createBrowserReceiptCacheManifest({ cacheRoot: root, allowedOperations: ["read", "write", "invalidate", "delete"] }), now });
  }

  it("does not replace an expired owner that can still write", () => {
    const owner = acquireBrowserReceiptCacheLock({ cacheRoot: root, operation: "write", now, leaseMs: 1 });
    const bytes = fs.readFileSync(browserReceiptCacheLockPath(root));
    expect(acquireBrowserReceiptCacheLock({ cacheRoot: root, operation: "write", now: () => "2026-10-02T00:00:01.000Z" }).status).toBe("expired");
    expect(fs.readFileSync(browserReceiptCacheLockPath(root))).toEqual(bytes);
    expect(owner.status === "acquired" && owner.release().status).toBe("released");
  });

  it("makes release idempotent without removing a later owner's lock", () => {
    const first = acquireBrowserReceiptCacheLock({ cacheRoot: root, operation: "write", now });
    if (first.status !== "acquired") throw new Error("lock unavailable");
    expect(first.release().status).toBe("released");
    const second = acquireBrowserReceiptCacheLock({ cacheRoot: root, operation: "write", now });
    expect(second.status).toBe("acquired");
    const bytes = fs.readFileSync(browserReceiptCacheLockPath(root));
    expect(first.release().status).toBe("released");
    expect(fs.readFileSync(browserReceiptCacheLockPath(root))).toEqual(bytes);
  });

  it("rejects a replaced lock even if its token bytes were copied", () => {
    const owner = acquireBrowserReceiptCacheLock({ cacheRoot: root, operation: "write", now });
    if (owner.status !== "acquired") throw new Error("lock unavailable");
    const target = browserReceiptCacheLockPath(root);
    const bytes = fs.readFileSync(target);
    const replacement = path.join(root, "replacement");
    fs.writeFileSync(replacement, bytes);
    fs.renameSync(replacement, target);
    expect(owner.ownsLock()).toBe(false);
    expect(owner.release().status).toBe("invalid");
    expect(fs.readFileSync(target)).toEqual(bytes);
  });

  it.each(["compact", "repair", "delete", "invalidate", "writeReceipt"] as const)("preserves an uncertain log during %s", (operation) => {
    const cache = store();
    const receipt = safeReceipt();
    expect(cache.writeReceipt(receipt).written).toBe(true);
    const file = path.join(root, "browser-receipt-cache.jsonl");
    fs.appendFileSync(file, "broken-tombstone\n");
    const bytes = fs.readFileSync(file);
    const result = operation === "writeReceipt" ? cache.writeReceipt(receipt)
      : operation === "delete" || operation === "invalidate" ? cache[operation](receipt.receiptId, "test")
      : cache[operation]();
    expect("written" in result ? result.written : result.changed).toBe(false);
    expect(fs.readFileSync(file)).toEqual(bytes);
    expect(cache.get(receipt.receiptId).status).toBe("blocked");
  });

  it("rejects an unsafe tombstone before writing it", () => {
    const cache = store();
    const receipt = safeReceipt();
    expect(cache.writeReceipt(receipt).written).toBe(true);
    const file = path.join(root, "browser-receipt-cache.jsonl");
    const bytes = fs.readFileSync(file);
    const result = cache.invalidate(receipt.receiptId, "RAW_SECRET");
    expect(result.changed).toBe(false);
    expect(fs.readFileSync(file)).toEqual(bytes);
    expect(JSON.stringify(result)).not.toContain("RAW_SECRET");
  });

  it("separates valid records after a missing trailing newline", () => {
    const cache = store();
    const receipt = safeReceipt();
    expect(cache.writeReceipt(receipt).written).toBe(true);
    const file = path.join(root, "browser-receipt-cache.jsonl");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").trimEnd());
    expect(cache.invalidate(receipt.receiptId, "test").changed).toBe(true);
    expect(cache.list()).toMatchObject({ status: "read", corruptedCount: 0 });
    expect(cache.get(receipt.receiptId).status).toBe("missing");
  });

  it.each(["rawEvidenceStored", "nested-shape", "receipt-id"])("quarantines invalid persisted %s", (field) => {
    const cache = store();
    const receipt = safeReceipt();
    expect(cache.writeReceipt(receipt).written).toBe(true);
    const file = path.join(root, "browser-receipt-cache.jsonl");
    const record = JSON.parse(fs.readFileSync(file, "utf8"));
    if (field === "rawEvidenceStored") record.rawEvidenceStored = "yes";
    if (field === "nested-shape") record.cacheEntry = { version: "browser-action-cache-entry/v1" };
    if (field === "receipt-id") record.receipt.receiptId = "different";
    fs.writeFileSync(file, JSON.stringify(record) + "\n");
    expect(cache.get(receipt.receiptId).status).toBe("blocked");
  });
});
