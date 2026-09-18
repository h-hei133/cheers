import type { BrowserPersistentReceiptCacheRecord } from "../browserPersistentReceiptCache.js";
import type { BrowserReceiptCacheManifest } from "./browserReceiptCacheManifest.js";
import { applyBrowserReceiptCacheRetention } from "./browserReceiptCacheRetention.js";
import {
  readBrowserReceiptCacheRecordsForRecovery,
  serializeBrowserReceiptCacheRecords,
  writeBrowserReceiptCacheFileAtomic,
} from "./browserReceiptCacheRecovery.js";

export interface BrowserReceiptCacheCompactionReport {
  readonly compacted: boolean;
  readonly recordsBefore: number;
  readonly recordsAfter: number;
  readonly tombstonesKept: number;
  readonly recordsRemoved: number;
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function planBrowserReceiptCacheCompaction(input: {
  readonly manifest: BrowserReceiptCacheManifest;
}): BrowserReceiptCacheCompactionReport & {
  readonly records: readonly BrowserPersistentReceiptCacheRecord[];
} {
  const recovery = readBrowserReceiptCacheRecordsForRecovery({ manifest: input.manifest });
  const latest = new Map<string, BrowserPersistentReceiptCacheRecord>();
  for (const record of recovery.records) {
    latest.set(record.receiptId, record);
  }
  const retained = applyBrowserReceiptCacheRetention({
    manifest: input.manifest,
    records: Array.from(latest.values()),
  });
  const records = retained.records;
  const removed = recovery.lineCount - records.length;
  return {
    records,
    compacted: removed > 0 || recovery.skippedCount > 0,
    recordsBefore: recovery.lineCount,
    recordsAfter: records.length,
    tombstonesKept: records.filter((record) => record.status !== "active").length,
    recordsRemoved: Math.max(0, removed),
    warnings: [...recovery.warnings, ...retained.warnings],
    blockers: [],
    nextAction: "Use /browser replay cache status to inspect compacted cache.",
    evidence: [
      ...recovery.evidence,
      ...retained.evidence,
      "browser-receipt-cache-compaction:planned",
      "browser-receipt-cache-compaction:tombstone-semantics-preserved",
    ],
  };
}

export function compactBrowserReceiptCache(input: {
  readonly manifest: BrowserReceiptCacheManifest;
  readonly now?: () => string;
}): BrowserReceiptCacheCompactionReport {
  const plan = planBrowserReceiptCacheCompaction({ manifest: input.manifest });
  writeBrowserReceiptCacheFileAtomic({
    cacheRoot: input.manifest.cacheRoot,
    content: serializeBrowserReceiptCacheRecords(plan.records),
    now: input.now,
    suffix: "compact",
  });
  return {
    compacted: plan.compacted,
    recordsBefore: plan.recordsBefore,
    recordsAfter: plan.recordsAfter,
    tombstonesKept: plan.tombstonesKept,
    recordsRemoved: plan.recordsRemoved,
    warnings: plan.warnings,
    blockers: plan.blockers,
    nextAction: plan.nextAction,
    evidence: [...plan.evidence, "browser-receipt-cache-compaction:written-atomically"],
  };
}

export function repairBrowserReceiptCache(input: {
  readonly manifest: BrowserReceiptCacheManifest;
  readonly now?: () => string;
}): BrowserReceiptCacheCompactionReport {
  const recovery = readBrowserReceiptCacheRecordsForRecovery({ manifest: input.manifest });
  writeBrowserReceiptCacheFileAtomic({
    cacheRoot: input.manifest.cacheRoot,
    content: serializeBrowserReceiptCacheRecords(recovery.records),
    now: input.now,
    suffix: "repair",
  });
  return {
    compacted: recovery.skippedCount > 0,
    recordsBefore: recovery.lineCount,
    recordsAfter: recovery.records.length,
    tombstonesKept: recovery.records.filter((record) => record.status !== "active").length,
    recordsRemoved: recovery.skippedCount,
    warnings: recovery.warnings,
    blockers: [],
    nextAction: "Use /browser replay cache status to inspect repaired cache.",
    evidence: [
      ...recovery.evidence,
      "browser-receipt-cache-recovery:repair-written-atomically",
    ],
  };
}
