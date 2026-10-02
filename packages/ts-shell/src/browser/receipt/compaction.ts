import type { BrowserPersistentReceiptCacheRecord } from "../persistentReceiptCache.js";
import type { BrowserReceiptCacheManifest } from "./manifest.js";
import { applyBrowserReceiptCacheRetention } from "./retention.js";
import type { BrowserReceiptCacheRecoveryResult } from "./recovery.js";
import { projectBrowserReceiptCacheIntegrity } from "./integrity.js";

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
  readonly recovery: BrowserReceiptCacheRecoveryResult;
  readonly mode?: "compact" | "repair";
}): BrowserReceiptCacheCompactionReport & {
  readonly records: readonly BrowserPersistentReceiptCacheRecord[];
} {
  const recovery = input.recovery;
  const integrity = projectBrowserReceiptCacheIntegrity(input.manifest, recovery);
  const latest = new Map<string, BrowserPersistentReceiptCacheRecord>();
  for (const record of recovery.records) {
    latest.set(record.receiptId, record);
  }
  const retained = applyBrowserReceiptCacheRetention({
    manifest: input.manifest,
    records: Array.from(latest.values()),
  });
  const records = input.mode === "repair" ? recovery.records : retained.records;
  const removed = recovery.lineCount - records.length;
  return {
    records,
    compacted: integrity.blockers.length === 0 && removed > 0,
    recordsBefore: recovery.lineCount,
    recordsAfter: records.length,
    tombstonesKept: records.filter((record) => record.status !== "active").length,
    recordsRemoved: Math.max(0, removed),
    warnings: [...recovery.warnings, ...retained.warnings],
    blockers: integrity.blockers,
    nextAction: integrity.blockers.length > 0
      ? "Preserve the cache and stop writers before restoring a known-good log or selecting a new empty cache root."
      : "Use /browser replay cache status to inspect the cache.",
    evidence: [
      ...recovery.evidence,
      ...retained.evidence,
      "browser-receipt-cache-compaction:planned",
      "browser-receipt-cache-compaction:tombstone-semantics-preserved",
    ],
  };
}
