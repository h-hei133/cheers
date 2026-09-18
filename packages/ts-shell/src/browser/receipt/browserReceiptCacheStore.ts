import fs from "node:fs";
import { compactBrowserReceiptCache, repairBrowserReceiptCache, type BrowserReceiptCacheCompactionReport } from "./browserReceiptCacheCompaction.js";
import { scanBrowserReceiptCacheIntegrity, type BrowserReceiptCacheIntegrityReport } from "./browserReceiptCacheIntegrity.js";
import {
  acquireBrowserReceiptCacheLock,
  readBrowserReceiptCacheLock,
  type BrowserReceiptCacheLockOperation,
  type BrowserReceiptCacheLockSnapshot,
} from "./browserReceiptCacheLock.js";
import {
  createBrowserPersistentReceiptCacheRecord,
  createBrowserPersistentReceiptCacheTombstone,
  type BrowserPersistentReceiptCacheRecord,
} from "../../core/context/browserPersistentReceiptCache.js";
import {
  browserReceiptCacheFilePath,
  readBrowserReceiptCacheRecordsForRecovery,
  serializeBrowserReceiptCacheRecords,
  writeBrowserReceiptCacheFileAtomic,
} from "./browserReceiptCacheRecovery.js";
import type { BrowserExecutionReceipt } from "../../core/context/browserExecutionReceipt.js";
import type { BrowserReceiptCacheManifest } from "./browserReceiptCacheManifest.js";

export interface BrowserReceiptCacheStore {
  readonly manifest: BrowserReceiptCacheManifest;
  writeReceipt(receipt: BrowserExecutionReceipt): BrowserReceiptCacheWriteResult;
  get(receiptId: string): BrowserPersistentReceiptCacheRecord | undefined;
  list(): BrowserReceiptCacheListResult;
  invalidate(receiptId: string, reason: string): BrowserReceiptCacheMutationResult;
  delete(receiptId: string, reason: string): BrowserReceiptCacheMutationResult;
  compact(): BrowserReceiptCacheMaintenanceResult;
  repair(): BrowserReceiptCacheMaintenanceResult;
  health(): BrowserReceiptCacheStoreHealth;
}

export interface BrowserReceiptCacheWriteResult {
  readonly written: boolean;
  readonly record?: BrowserPersistentReceiptCacheRecord;
  readonly reason?: string;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
}

export interface BrowserReceiptCacheMutationResult {
  readonly changed: boolean;
  readonly record?: BrowserPersistentReceiptCacheRecord;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
}

export interface BrowserReceiptCacheListResult {
  readonly records: readonly BrowserPersistentReceiptCacheRecord[];
  readonly corruptedCount: number;
  readonly unsafeCount: number;
  readonly duplicateActiveCount: number;
  readonly overBudgetCount: number;
  readonly evidence: readonly string[];
}

export interface BrowserReceiptCacheMaintenanceResult {
  readonly changed: boolean;
  readonly report?: BrowserReceiptCacheCompactionReport;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
}

export interface BrowserReceiptCacheStoreHealth {
  readonly configured: true;
  readonly readable: boolean;
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

export function createBrowserReceiptCacheStore(input: {
  readonly manifest: BrowserReceiptCacheManifest;
  readonly now?: () => string;
}): BrowserReceiptCacheStore {
  const filePath = browserReceiptCacheFilePath(input.manifest.cacheRoot);
  const now = input.now ?? (() => new Date().toISOString());

  function ensureRoot(): void {
    fs.mkdirSync(input.manifest.cacheRoot, { recursive: true });
  }

  function append(record: BrowserPersistentReceiptCacheRecord, operation: BrowserReceiptCacheLockOperation): BrowserReceiptCacheWriteResult | undefined {
    ensureRoot();
    const lock = acquireBrowserReceiptCacheLock({
      cacheRoot: input.manifest.cacheRoot,
      operation,
      now,
    });
    if (lock.status !== "acquired") {
      return {
        written: false,
        reason: lock.reason,
        evidence: lock.evidence,
        warnings: lock.warnings,
      };
    }
    try {
      const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
      writeBrowserReceiptCacheFileAtomic({
        cacheRoot: input.manifest.cacheRoot,
        content: `${content}${JSON.stringify(record)}\n`,
        now,
        suffix: operation,
      });
      return undefined;
    } catch {
      return {
        written: false,
        reason: "Persistent browser cache write failed before commit.",
        evidence: ["browser-receipt-cache-store:atomic-write-failed"],
        warnings: ["browser-receipt-cache-store:write-failed"],
      };
    } finally {
      lock.release();
    }
  }

  function recordsWithout(receiptId: string): readonly BrowserPersistentReceiptCacheRecord[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    return readBrowserReceiptCacheRecordsForRecovery({ manifest: input.manifest })
      .records
      .filter((record) => record.receiptId !== receiptId);
  }

  function readLatest(): BrowserReceiptCacheListResult {
    if (!fs.existsSync(filePath)) {
      return {
        records: [],
        corruptedCount: 0,
        unsafeCount: 0,
        duplicateActiveCount: 0,
        overBudgetCount: 0,
        evidence: ["browser-receipt-cache-store:list:empty"],
      };
    }
    const latest = new Map<string, BrowserPersistentReceiptCacheRecord>();
    const recovery = readBrowserReceiptCacheRecordsForRecovery({ manifest: input.manifest });
    for (const record of recovery.records) {
      latest.set(record.receiptId, record);
    }
    const records = Array.from(latest.values()).slice(-input.manifest.maxRecords);
    const integrity = scanBrowserReceiptCacheIntegrity({ manifest: input.manifest });
    return {
      records,
      corruptedCount: recovery.invalidJsonCount + recovery.invalidRecordCount,
      unsafeCount: recovery.unsafeRecordCount,
      duplicateActiveCount: integrity.duplicateActiveCount,
      overBudgetCount: integrity.overBudgetCount,
      evidence: [
        ...recovery.evidence,
        "browser-receipt-cache-store:list",
        "browser-receipt-cache-store:sanitized-jsonl",
      ],
    };
  }

  return {
    manifest: input.manifest,
    writeReceipt(receipt) {
      if (!input.manifest.allowedOperations.includes("write")) {
        return blockedWrite("Persistent browser cache write is not allowed by manifest.");
      }
      if (receipt.replayReadiness.status !== "replay-ready") {
        return blockedWrite("Only replay-ready browser receipts are persisted by default.");
      }
      const result = createBrowserPersistentReceiptCacheRecord({
        receipt,
        source: input.manifest.source,
        now,
      });
      if (result.ok === false) {
        return {
          written: false,
          reason: result.reason,
          evidence: result.evidence,
          warnings: result.warnings,
        };
      }
      const blocked = append(result.record, "write");
      if (blocked) {
        return blocked;
      }
      return {
        written: true,
        record: result.record,
        evidence: [
          ...result.evidence,
          "browser-receipt-cache-store:write",
          "browser-receipt-cache-store:explicit-only",
        ],
        warnings: result.warnings,
      };
    },
    get(receiptId) {
      const record = readLatest().records.find((item) => item.receiptId === receiptId);
      return record?.status === "active" ? record : undefined;
    },
    list: readLatest,
    invalidate(receiptId, reason) {
      if (!input.manifest.allowedOperations.includes("invalidate")) {
        return unchanged("Persistent browser cache invalidate is not allowed by manifest.");
      }
      const record = createBrowserPersistentReceiptCacheTombstone({
        receiptId,
        status: "invalidated",
        source: input.manifest.source,
        reason,
        now: now(),
      });
      const blocked = append(record, "invalidate");
      if (blocked) {
        return unchanged(blocked.reason ?? "Persistent browser cache invalidate could not acquire lock.", blocked.warnings);
      }
      return changed(record, "browser-receipt-cache-store:invalidated");
    },
    delete(receiptId, reason) {
      if (!input.manifest.allowedOperations.includes("delete")) {
        return unchanged("Persistent browser cache delete is not allowed by manifest.");
      }
      const record = createBrowserPersistentReceiptCacheTombstone({
        receiptId,
        status: "deleted",
        source: input.manifest.source,
        reason,
        now: now(),
      });
      const lock = acquireBrowserReceiptCacheLock({
        cacheRoot: input.manifest.cacheRoot,
        operation: "delete",
        now,
      });
      if (lock.status !== "acquired") {
        return unchanged(lock.reason, lock.warnings);
      }
      try {
        writeBrowserReceiptCacheFileAtomic({
          cacheRoot: input.manifest.cacheRoot,
          content: serializeBrowserReceiptCacheRecords([...recordsWithout(receiptId), record]),
          now,
          suffix: "delete",
        });
      } catch {
        return unchanged("Persistent browser cache delete failed before commit.", ["browser-receipt-cache-store:delete-failed"]);
      } finally {
        lock.release();
      }
      return changed(record, "browser-receipt-cache-store:deleted");
    },
    compact() {
      if (!input.manifest.allowedOperations.includes("write")) {
        return blockedMaintenance("Persistent browser cache compact requires write operation in manifest.");
      }
      const lock = acquireBrowserReceiptCacheLock({
        cacheRoot: input.manifest.cacheRoot,
        operation: "compact",
        now,
      });
      if (lock.status !== "acquired") {
        return blockedMaintenance(lock.reason, lock.warnings, lock.evidence);
      }
      try {
        const report = compactBrowserReceiptCache({ manifest: input.manifest, now });
        return maintenanceChanged(report);
      } catch {
        return blockedMaintenance("Persistent browser cache compact failed before commit.", ["browser-receipt-cache-store:compact-failed"]);
      } finally {
        lock.release();
      }
    },
    repair() {
      if (!input.manifest.allowedOperations.includes("write")) {
        return blockedMaintenance("Persistent browser cache repair requires write operation in manifest.");
      }
      const lock = acquireBrowserReceiptCacheLock({
        cacheRoot: input.manifest.cacheRoot,
        operation: "repair",
        now,
      });
      if (lock.status !== "acquired") {
        return blockedMaintenance(lock.reason, lock.warnings, lock.evidence);
      }
      try {
        const report = repairBrowserReceiptCache({ manifest: input.manifest, now });
        return maintenanceChanged(report);
      } catch {
        return blockedMaintenance("Persistent browser cache repair failed before commit.", ["browser-receipt-cache-store:repair-failed"]);
      } finally {
        lock.release();
      }
    },
    health() {
      let writable = false;
      let readable = false;
      const blockers: string[] = [];
      try {
        ensureRoot();
        fs.accessSync(input.manifest.cacheRoot, fs.constants.W_OK);
        writable = true;
      } catch {
        blockers.push("cache-root-not-writable");
      }
      try {
        if (fs.existsSync(filePath)) {
          fs.accessSync(filePath, fs.constants.R_OK);
        }
        readable = true;
      } catch {
        blockers.push("cache-file-not-readable");
      }
      const list = readable
        ? readLatest()
        : { records: [], corruptedCount: 0, unsafeCount: 0, duplicateActiveCount: 0, overBudgetCount: 0, evidence: [] };
      const integrity = readable
        ? scanBrowserReceiptCacheIntegrity({ manifest: input.manifest })
        : emptyIntegrity();
      const lock = readBrowserReceiptCacheLock(input.manifest.cacheRoot, { now });
      const active = list.records.filter((record) => record.status === "active");
      return {
        configured: true,
        readable,
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
        integrity,
        lastUpdatedAt: list.records.at(-1)?.createdAt,
        warnings: [
          ...(list.corruptedCount > 0 ? ["browser-receipt-cache-store:corrupted-records-skipped"] : []),
          ...(list.unsafeCount > 0 ? ["browser-receipt-cache-store:unsafe-records-skipped"] : []),
          ...integrity.warnings,
          ...lock.warnings,
        ],
        blockers,
        evidence: [
          ...list.evidence,
          ...integrity.evidence,
          ...lock.evidence,
          "browser-receipt-cache-store:health",
          "browser-receipt-cache-store:no-default-cache",
        ],
      };
    },
  };
}

function blockedWrite(reason: string, warnings: readonly string[] = []): BrowserReceiptCacheWriteResult {
  return {
    written: false,
    reason,
    evidence: ["browser-receipt-cache-store:write-blocked"],
    warnings,
  };
}

function unchanged(reason: string, warnings: readonly string[] = [reason]): BrowserReceiptCacheMutationResult {
  return {
    changed: false,
    evidence: ["browser-receipt-cache-store:mutation-blocked"],
    warnings,
  };
}

function changed(
  record: BrowserPersistentReceiptCacheRecord,
  evidence: string,
): BrowserReceiptCacheMutationResult {
  return {
    changed: true,
    record,
    evidence: [evidence, "browser-receipt-cache-store:tombstone-sanitized"],
    warnings: record.warnings,
  };
}

function blockedMaintenance(
  reason: string,
  warnings: readonly string[] = [reason],
  evidence: readonly string[] = ["browser-receipt-cache-store:maintenance-blocked"],
): BrowserReceiptCacheMaintenanceResult {
  return {
    changed: false,
    evidence,
    warnings,
    blockers: [reason],
  };
}

function maintenanceChanged(report: BrowserReceiptCacheCompactionReport): BrowserReceiptCacheMaintenanceResult {
  return {
    changed: report.compacted,
    report,
    evidence: report.evidence,
    warnings: report.warnings,
    blockers: report.blockers,
  };
}

function emptyIntegrity(): BrowserReceiptCacheIntegrityReport {
  return {
    integrityStatus: "empty",
    validRecordCount: 0,
    activeCount: 0,
    tombstoneCount: 0,
    deletedCount: 0,
    invalidatedCount: 0,
    invalidJsonCount: 0,
    invalidRecordCount: 0,
    unsafeRecordCount: 0,
    duplicateActiveCount: 0,
    staleReplayReadinessCount: 0,
    overBudgetCount: 0,
    unknownVersionCount: 0,
    redactionViolationCount: 0,
    skippedCount: 0,
    warnings: [],
    blockers: [],
    nextAction: "Fix the explicit cache manifest/root before relying on persistent replay.",
    evidence: ["browser-receipt-cache-integrity:not-readable"],
  };
}
