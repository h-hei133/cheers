import { describe, expect, it } from "vitest";
import { createBrowserPersistentReceiptCacheRecord } from "./persistentReceiptCache.js";
import { safeReceipt } from "./actionCacheEntry.test.js";

describe("browser persistent receipt cache record", () => {
  it("derives only sanitized persistent records from replay-ready receipts", () => {
    const receipt = safeReceipt();
    const result = createBrowserPersistentReceiptCacheRecord({
      receipt,
      source: "test-only",
      now: () => "2026-05-17T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.receiptId).toBe(receipt.receiptId);
    expect(result.record.status).toBe("active");
    expect(result.record.rawEvidenceStored).toBe("no");
    expect(JSON.stringify(result.record)).not.toContain("RAW_");
  });

  it("rejects unsafe evidence before persistence", () => {
    const receipt = {
      ...safeReceipt(),
      runnerId: "ghp_123456789012345678901234",
    };
    const result = createBrowserPersistentReceiptCacheRecord({
      receipt,
      source: "test-only",
    });

    expect(result.ok).toBe(false);
    expect(result.evidence).toContain("browser-persistent-receipt-cache:record-blocked");
  });
});
