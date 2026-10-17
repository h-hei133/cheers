import { parseBrowserPersistentReceiptCacheRecord, type BrowserPersistentReceiptCacheRecord } from "../persistentReceiptCache.js";
import { planBrowserReceiptCacheCompaction, type BrowserReceiptCacheCompactionReport } from "./compaction.js";
import { acquireBrowserReceiptCacheLock, type BrowserReceiptCacheLockOperation } from "./lock.js";
import type { BrowserReceiptCacheManifest } from "./manifest.js";
import { readBrowserReceiptCacheRecordsForRecovery, serializeBrowserReceiptCacheRecords, writeBrowserReceiptCacheFileAtomic } from "./recovery.js";

export interface ReceiptCacheMutationResult {
  readonly outcome: "written" | "unchanged" | "blocked" | "unverified";
  readonly cleanup: "not-acquired" | "released" | "unverified";
  readonly report?: BrowserReceiptCacheCompactionReport;
  readonly reason?: string;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
}

/** The sole admitted read/modify/write transaction for the explicit receipt cache. */
export function mutateBrowserReceiptCache(input: {
  readonly manifest: BrowserReceiptCacheManifest;
  readonly operation: BrowserReceiptCacheLockOperation;
  readonly record?: BrowserPersistentReceiptCacheRecord;
  readonly now: () => string;
  readonly assertOwner?: () => void;
}): ReceiptCacheMutationResult {
  const { manifest, operation, record, now } = input;
  const permission = operation === "compact" || operation === "repair" ? "write" : operation;
  if (!manifest.allowedOperations.includes(permission) || !manifest.allowedOperations.includes("read")) {
    return blocked("Cache mutation requires read permission and the requested operation in the manifest.");
  }
  const maintenance = operation === "compact" || operation === "repair";
  if (!maintenance && (!record || !parseBrowserPersistentReceiptCacheRecord(record))) {
    return blocked("Cache mutation record is invalid or unsafe.");
  }
  input.assertOwner?.();
  const lock = acquireBrowserReceiptCacheLock({ cacheRoot: manifest.cacheRoot, operation, now, assertOwner: input.assertOwner });
  if (lock.status !== "acquired") return { ...blocked(lock.reason), evidence: lock.evidence, warnings: lock.warnings };
  let result: ReceiptCacheMutationResult;
  try {
    input.assertOwner?.();
    const recovery = readBrowserReceiptCacheRecordsForRecovery({ manifest });
    const plan = planBrowserReceiptCacheCompaction({ manifest, recovery, mode: operation === "repair" ? "repair" : "compact" });
    const { records: plannedRecords, ...report } = plan;
    if (plan.blockers.length > 0) {
      result = { ...blocked("Cache lifecycle is uncertain; preserve the original log and recover with all writers stopped."), blockers: plan.blockers, evidence: plan.evidence, warnings: plan.warnings };
    } else if (maintenance && !plan.compacted) {
      result = { outcome: "unchanged", cleanup: "not-acquired", report, evidence: plan.evidence, warnings: plan.warnings, blockers: [] };
    } else {
      // A receipt id is the record's identity. Appending a second row for the
      // same id lets two concurrent writers leave a duplicate that health reads
      // as over-budget; the newer record supersedes the older one.
      const records = maintenance ? plannedRecords
        : [...recovery.records.filter((item) => item.receiptId !== record!.receiptId), record!];
      input.assertOwner?.();
      const write = writeBrowserReceiptCacheFileAtomic({ cacheRoot: manifest.cacheRoot, content: serializeBrowserReceiptCacheRecords(records), ownsLock: lock.ownsLock });
      result = {
        outcome: write.outcome, cleanup: "not-acquired", report: maintenance && write.outcome === "written" ? report : undefined,
        reason: write.outcome === "written" ? undefined : "Cache write could not be confirmed.",
        evidence: [...recovery.evidence, `browser-receipt-cache-store:${operation}:${write.outcome}`],
        warnings: write.warnings,
        blockers: write.outcome === "written" ? [] : ["browser-receipt-cache-store:write-unconfirmed"],
      };
    }
  } catch {
    result = blocked("Cache mutation could not be completed.");
  }
  const release = lock.release();
  return {
    ...result,
    cleanup: release.status === "released" ? "released" : "unverified",
    evidence: [...result.evidence, ...release.evidence],
    warnings: [...result.warnings, ...release.warnings],
  };
}

function blocked(reason: string): ReceiptCacheMutationResult {
  return { outcome: "blocked", cleanup: "not-acquired", reason, evidence: ["browser-receipt-cache-store:mutation-blocked"], warnings: [], blockers: [reason] };
}
