import fs from "node:fs";
import {
  type BrowserPersistentReceiptCacheRecord,
} from "../../core/context/browserPersistentReceiptCache.js";
import type { BrowserReceiptCacheManifest } from "./browserReceiptCacheManifest.js";
import {
  browserReceiptCacheFilePath,
  readBrowserReceiptCacheRecordsForRecovery,
} from "./browserReceiptCacheRecovery.js";

export type BrowserReceiptCacheIntegrityStatus =
  | "healthy"
  | "warning"
  | "corrupted"
  | "unsafe"
  | "empty";

export interface BrowserReceiptCacheIntegrityReport {
  readonly integrityStatus: BrowserReceiptCacheIntegrityStatus;
  readonly validRecordCount: number;
  readonly activeCount: number;
  readonly tombstoneCount: number;
  readonly deletedCount: number;
  readonly invalidatedCount: number;
  readonly invalidJsonCount: number;
  readonly invalidRecordCount: number;
  readonly unsafeRecordCount: number;
  readonly duplicateActiveCount: number;
  readonly staleReplayReadinessCount: number;
  readonly overBudgetCount: number;
  readonly unknownVersionCount: number;
  readonly redactionViolationCount: number;
  readonly skippedCount: number;
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function scanBrowserReceiptCacheIntegrity(input: {
  readonly manifest: BrowserReceiptCacheManifest;
}): BrowserReceiptCacheIntegrityReport {
  const recovery = readBrowserReceiptCacheRecordsForRecovery({ manifest: input.manifest });
  const duplicateActiveCount = countDuplicateActiveRecords(recovery.records);
  const active = recovery.records.filter((record) => record.status === "active");
  const invalidated = recovery.records.filter((record) => record.status === "invalidated");
  const deleted = recovery.records.filter((record) => record.status === "deleted");
  const staleReplayReadinessCount = active.filter((record) => record.replayReadinessStatus !== "replay-ready").length;
  const overBudgetCount = Math.max(0, recovery.records.length - input.manifest.maxRecords);
  const redactionViolationCount = recovery.unsafeRecordCount;
  const integrityStatus = determineStatus({
    lineCount: recovery.lineCount,
    unsafeCount: recovery.unsafeRecordCount,
    corruptCount: recovery.invalidJsonCount + recovery.invalidRecordCount,
    warningCount: duplicateActiveCount + staleReplayReadinessCount + overBudgetCount + recovery.unknownVersionCount,
  });
  const warnings = [
    ...recovery.warnings,
    ...(duplicateActiveCount > 0 ? ["browser-receipt-cache-integrity:duplicate-active-records"] : []),
    ...(staleReplayReadinessCount > 0 ? ["browser-receipt-cache-integrity:stale-replay-readiness"] : []),
    ...(overBudgetCount > 0 ? ["browser-receipt-cache-integrity:over-budget"] : []),
    ...(recovery.unknownVersionCount > 0 ? ["browser-receipt-cache-integrity:unknown-version"] : []),
  ];
  const blockers = [
    ...(recovery.unsafeRecordCount > 0 ? ["browser-receipt-cache-integrity:unsafe-records"] : []),
    ...(recovery.invalidJsonCount + recovery.invalidRecordCount > 0 ? ["browser-receipt-cache-integrity:corrupted-records"] : []),
  ];
  return {
    integrityStatus,
    validRecordCount: recovery.records.length,
    activeCount: active.length,
    tombstoneCount: invalidated.length + deleted.length,
    deletedCount: deleted.length,
    invalidatedCount: invalidated.length,
    invalidJsonCount: recovery.invalidJsonCount,
    invalidRecordCount: recovery.invalidRecordCount,
    unsafeRecordCount: recovery.unsafeRecordCount,
    duplicateActiveCount,
    staleReplayReadinessCount,
    overBudgetCount,
    unknownVersionCount: recovery.unknownVersionCount,
    redactionViolationCount,
    skippedCount: recovery.skippedCount,
    warnings,
    blockers,
    nextAction: nextAction(integrityStatus, duplicateActiveCount, overBudgetCount),
    evidence: [
      ...recovery.evidence,
      fs.existsSync(browserReceiptCacheFilePath(input.manifest.cacheRoot))
        ? "browser-receipt-cache-integrity:scanned"
        : "browser-receipt-cache-integrity:empty",
      "browser-receipt-cache-integrity:no-raw-content",
    ],
  };
}

function countDuplicateActiveRecords(records: readonly BrowserPersistentReceiptCacheRecord[]): number {
  const activeCounts = new Map<string, number>();
  for (const record of records) {
    if (record.status !== "active") {
      continue;
    }
    activeCounts.set(record.receiptId, (activeCounts.get(record.receiptId) ?? 0) + 1);
  }
  return Array.from(activeCounts.values()).reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function determineStatus(input: {
  readonly lineCount: number;
  readonly unsafeCount: number;
  readonly corruptCount: number;
  readonly warningCount: number;
}): BrowserReceiptCacheIntegrityStatus {
  if (input.lineCount === 0) {
    return "empty";
  }
  if (input.unsafeCount > 0) {
    return "unsafe";
  }
  if (input.corruptCount > 0) {
    return "corrupted";
  }
  if (input.warningCount > 0) {
    return "warning";
  }
  return "healthy";
}

function nextAction(
  status: BrowserReceiptCacheIntegrityStatus,
  duplicateActiveCount: number,
  overBudgetCount: number,
): string {
  if (status === "empty") {
    return "Run an explicit replay-ready browser execution before relying on persistent cache.";
  }
  if (status === "unsafe" || status === "corrupted") {
    return "Run /browser replay cache repair or delete the explicit cache root after review.";
  }
  if (duplicateActiveCount > 0 || overBudgetCount > 0) {
    return "Run /browser replay cache compact to remove superseded sanitized records.";
  }
  if (status === "warning") {
    return "Inspect cache status before replaying.";
  }
  return "Use explicit /browser replay <receipt-id> with current runner gates.";
}
