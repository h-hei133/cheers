import fs from "node:fs";
import type { BrowserPersistentReceiptCacheRecord } from "../persistentReceiptCache.js";
import { projectBrowserReceiptCacheIntegrity, type BrowserReceiptCacheIntegrityReport } from "./integrity.js";
import { readBrowserReceiptCacheLock, type BrowserReceiptCacheLockSnapshot } from "./lock.js";
import type { BrowserReceiptCacheManifest } from "./manifest.js";
import { readBrowserReceiptCacheRecordsForRecovery } from "./recovery.js";
import { applyBrowserReceiptCacheRetention } from "./retention.js";

export interface BrowserReceiptCacheListResult {
  readonly status: "read" | "missing" | "blocked";
  readonly records: readonly BrowserPersistentReceiptCacheRecord[];
  readonly corruptedCount: number;
  readonly unsafeCount: number;
  readonly duplicateActiveCount: number;
  readonly overBudgetCount: number;
  readonly integrity: BrowserReceiptCacheIntegrityReport;
  readonly blockers: readonly string[];
  readonly evidence: readonly string[];
}

export interface BrowserReceiptCacheLookupResult {
  readonly status: "found" | "missing" | "blocked";
  readonly record?: BrowserPersistentReceiptCacheRecord;
  readonly blockers: readonly string[];
  readonly evidence: readonly string[];
}

export interface BrowserReceiptCacheStoreHealth {
  readonly configured: true;
  readonly readable: boolean;
  /** Observed directory access and manifest permission; not proof a future write will succeed. */
  readonly writable: boolean;
  readonly recordCount: number;
  readonly activeCount: number;
  readonly invalidatedCount: number;
  readonly deletedCount: number;
  readonly corruptedCount: number;
  readonly unsafeCount: number;
  readonly duplicateActiveCount: number;
  readonly overBudgetCount: number;
  readonly replayableCount: number;
  readonly lock: BrowserReceiptCacheLockSnapshot;
  readonly integrity: BrowserReceiptCacheIntegrityReport;
  readonly lastUpdatedAt?: string;
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
  readonly evidence: readonly string[];
}

export function listBrowserReceiptCache(manifest: BrowserReceiptCacheManifest): BrowserReceiptCacheListResult {
  const recovery = readBrowserReceiptCacheRecordsForRecovery({ manifest });
  const integrity = projectBrowserReceiptCacheIntegrity(manifest, recovery);
  const latest = new Map<string, BrowserPersistentReceiptCacheRecord>();
  for (const record of recovery.records) latest.set(record.receiptId, record);
  // A skipped line may be a tombstone. Do not expose an earlier version as active.
  const blocked = integrity.blockers.length > 0;
  const retained = applyBrowserReceiptCacheRetention({ manifest, records: [...latest.values()] });
  return {
    status: blocked ? "blocked" : recovery.status === "missing" ? "missing" : "read",
    records: blocked ? [] : retained.records,
    corruptedCount: recovery.invalidJsonCount + recovery.invalidRecordCount,
    unsafeCount: recovery.unsafeRecordCount,
    duplicateActiveCount: integrity.duplicateActiveCount,
    overBudgetCount: integrity.overBudgetCount,
    integrity,
    blockers: integrity.blockers,
    evidence: [...integrity.evidence, ...retained.evidence, "browser-receipt-cache-store:list"],
  };
}

export function lookupBrowserReceiptCache(list: BrowserReceiptCacheListResult, receiptId: string): BrowserReceiptCacheLookupResult {
  const record = list.records.find((item) => item.receiptId === receiptId && item.status === "active");
  return {
    status: list.status === "blocked" ? "blocked" : record ? "found" : "missing",
    record,
    blockers: list.blockers,
    evidence: list.evidence,
  };
}

export function observeBrowserReceiptCacheHealth(manifest: BrowserReceiptCacheManifest, now: () => string): BrowserReceiptCacheStoreHealth {
  const list = listBrowserReceiptCache(manifest);
  const mayRead = manifest.allowedOperations.includes("read");
  const lock: BrowserReceiptCacheLockSnapshot = mayRead
    ? readBrowserReceiptCacheLock(manifest.cacheRoot, { now })
    : { status: "invalid", evidence: ["browser-receipt-cache-lock:read-denied"], warnings: [] };
  let writable = false;
  if (mayRead && manifest.allowedOperations.includes("write")) {
    try {
      if (fs.statSync(manifest.cacheRoot).isDirectory()) {
        fs.accessSync(manifest.cacheRoot, fs.constants.W_OK);
        writable = true;
      }
    } catch { /* Status never creates a directory to test future write access. */ }
  }
  const active = list.records.filter((record) => record.status === "active");
  return {
    configured: true,
    readable: mayRead && list.integrity.integrityStatus !== "unavailable",
    writable,
    recordCount: list.records.length,
    activeCount: active.length,
    invalidatedCount: list.records.filter((record) => record.status === "invalidated").length,
    deletedCount: list.records.filter((record) => record.status === "deleted").length,
    corruptedCount: list.corruptedCount,
    unsafeCount: list.unsafeCount,
    duplicateActiveCount: list.duplicateActiveCount,
    overBudgetCount: list.overBudgetCount,
    replayableCount: active.filter((record) => record.replayReadinessStatus === "replay-ready").length,
    lock,
    integrity: list.integrity,
    lastUpdatedAt: list.records.reduce<string | undefined>((latest, record) =>
      !latest || Date.parse(record.createdAt) > Date.parse(latest) ? record.createdAt : latest, undefined),
    warnings: [...list.integrity.warnings, ...lock.warnings],
    blockers: list.blockers,
    evidence: [...list.evidence, ...lock.evidence, "browser-receipt-cache-store:health", "browser-receipt-cache-store:no-default-cache"],
  };
}
