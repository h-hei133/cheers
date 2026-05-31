import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { safeReceipt } from "../../browserActionCacheEntry.test.js";
import { createBrowserPersistentReceiptCacheRecord, createBrowserPersistentReceiptCacheTombstone } from "../../browserPersistentReceiptCache.js";
import { createBrowserReceiptCacheManifest } from "./browserReceiptCacheManifest.js";
import { scanBrowserReceiptCacheIntegrity } from "./browserReceiptCacheIntegrity.js";

describe("browser receipt cache integrity", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-receipt-cache-integrity-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("classifies healthy, duplicate, tombstone, and over-budget records", () => {
    const manifest = createBrowserReceiptCacheManifest({ cacheRoot: root, maxRecords: 2 });
    const record = createBrowserPersistentReceiptCacheRecord({
      receipt: safeReceipt(),
      source: "test-only",
      now: () => "2026-05-17T00:00:00.000Z",
    });
    expect(record.ok).toBe(true);
    if (!record.ok) {
      throw new Error("record failed");
    }
    const tombstone = createBrowserPersistentReceiptCacheTombstone({
      receiptId: "deleted",
      status: "deleted",
      source: "test-only",
      reason: "test",
      now: "2026-05-17T00:00:01.000Z",
    });
    fs.writeFileSync(
      path.join(root, "browser-receipt-cache.jsonl"),
      `${JSON.stringify(record.record)}\n${JSON.stringify(record.record)}\n${JSON.stringify(tombstone)}\n`,
      "utf8",
    );

    const report = scanBrowserReceiptCacheIntegrity({ manifest });

    expect(report.integrityStatus).toBe("warning");
    expect(report.duplicateActiveCount).toBe(1);
    expect(report.tombstoneCount).toBe(1);
    expect(report.overBudgetCount).toBe(1);
    expect(report.nextAction).toContain("compact");
  });

  it("skips corrupt and unsafe records without leaking raw content", () => {
    const manifest = createBrowserReceiptCacheManifest({ cacheRoot: root });
    fs.writeFileSync(
      path.join(root, "browser-receipt-cache.jsonl"),
      "not-json\n{\"version\":\"browser-persistent-receipt-cache/v1\",\"receiptId\":\"bad\",\"status\":\"active\",\"evidenceSummary\":\"RAW_SECRET\"}\n",
      "utf8",
    );

    const report = scanBrowserReceiptCacheIntegrity({ manifest });
    const rendered = JSON.stringify(report);

    expect(report.integrityStatus).toBe("unsafe");
    expect(report.invalidJsonCount).toBe(1);
    expect(report.unsafeRecordCount).toBe(1);
    expect(rendered).not.toContain("RAW_SECRET");
    expect(rendered).not.toContain("not-json");
  });
});
