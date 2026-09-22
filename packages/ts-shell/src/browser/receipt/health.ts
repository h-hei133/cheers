import type { BrowserReceiptCacheStore, BrowserReceiptCacheStoreHealth } from "./store.js";
import type { BrowserReceiptCacheIntegrityStatus } from "./integrity.js";

export type BrowserReceiptCacheHealthStatus = "missing" | "configured" | "invalid";

export interface BrowserReceiptCacheHealth {
  readonly status: BrowserReceiptCacheHealthStatus;
  readonly readable: boolean;
  readonly writable: boolean;
  readonly recordCount: number;
  readonly replayableCount: number;
  readonly invalidatedCount: number;
  readonly deletedCount: number;
  readonly corruptedCount: number;
  readonly unsafeCount: number;
  readonly duplicateActiveCount: number;
  readonly overBudgetCount: number;
  readonly integrityStatus: BrowserReceiptCacheIntegrityStatus;
  readonly lockStatus: string;
  readonly lastUpdatedAt?: string;
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
  readonly evidence: readonly string[];
}

export function inspectBrowserReceiptCacheHealth(
  store?: BrowserReceiptCacheStore,
): BrowserReceiptCacheHealth {
  if (!store) {
    return {
      status: "missing",
      readable: false,
      writable: false,
      recordCount: 0,
      replayableCount: 0,
      invalidatedCount: 0,
      deletedCount: 0,
      corruptedCount: 0,
      unsafeCount: 0,
      duplicateActiveCount: 0,
      overBudgetCount: 0,
      integrityStatus: "empty",
      lockStatus: "missing",
      warnings: [],
      blockers: [],
      evidence: [
        "browser-receipt-cache-health:missing",
        "browser-receipt-cache-health:no-default-cache",
      ],
    };
  }
  const health: BrowserReceiptCacheStoreHealth = store.health();
  return {
    status: health.blockers.length > 0 ? "invalid" : "configured",
    readable: health.readable,
    writable: health.writable,
    recordCount: health.recordCount,
    replayableCount: health.replayableCount,
    invalidatedCount: health.invalidatedCount,
    deletedCount: health.deletedCount,
    corruptedCount: health.corruptedCount,
    unsafeCount: health.unsafeCount,
    duplicateActiveCount: health.duplicateActiveCount,
    overBudgetCount: health.overBudgetCount,
    integrityStatus: health.integrity.integrityStatus,
    lockStatus: health.lock.status,
    lastUpdatedAt: health.lastUpdatedAt,
    warnings: health.warnings,
    blockers: health.blockers,
    evidence: [
      ...health.evidence,
      `browser-receipt-cache-health:${health.blockers.length > 0 ? "invalid" : "configured"}`,
    ],
  };
}
