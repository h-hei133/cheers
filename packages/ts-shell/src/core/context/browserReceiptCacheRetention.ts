import type { BrowserPersistentReceiptCacheRecord } from "./browserPersistentReceiptCache.js";
import type { BrowserReceiptCacheManifest } from "./browserReceiptCacheManifest.js";

export interface BrowserReceiptCacheRetentionResult {
  readonly records: readonly BrowserPersistentReceiptCacheRecord[];
  readonly droppedCount: number;
  readonly keptTombstoneCount: number;
  readonly overBudgetAfterRetention: number;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
}

export function applyBrowserReceiptCacheRetention(input: {
  readonly manifest: BrowserReceiptCacheManifest;
  readonly records: readonly BrowserPersistentReceiptCacheRecord[];
}): BrowserReceiptCacheRetentionResult {
  if (input.records.length <= input.manifest.maxRecords) {
    return {
      records: input.records,
      droppedCount: 0,
      keptTombstoneCount: input.records.filter((record) => record.status !== "active").length,
      overBudgetAfterRetention: 0,
      evidence: ["browser-receipt-cache-retention:within-budget"],
      warnings: [],
    };
  }
  const tombstones = input.records.filter((record) => record.status !== "active");
  const active = input.records
    .filter((record) => record.status === "active")
    .sort(compareReplayReadyThenNewest);
  const activeBudget = Math.max(0, input.manifest.maxRecords - tombstones.length);
  const keptActive = active.slice(0, activeBudget);
  const kept = [...tombstones, ...keptActive].sort(compareCreatedAtAscending);
  return {
    records: kept,
    droppedCount: input.records.length - kept.length,
    keptTombstoneCount: tombstones.length,
    overBudgetAfterRetention: Math.max(0, kept.length - input.manifest.maxRecords),
    evidence: [
      "browser-receipt-cache-retention:applied",
      "browser-receipt-cache-retention:tombstones-preserved",
    ],
    warnings: kept.length > input.manifest.maxRecords
      ? ["browser-receipt-cache-retention:tombstones-exceed-budget"]
      : [],
  };
}

function compareReplayReadyThenNewest(
  left: BrowserPersistentReceiptCacheRecord,
  right: BrowserPersistentReceiptCacheRecord,
): number {
  const leftReplay = left.replayReadinessStatus === "replay-ready" ? 0 : 1;
  const rightReplay = right.replayReadinessStatus === "replay-ready" ? 0 : 1;
  if (leftReplay !== rightReplay) {
    return leftReplay - rightReplay;
  }
  return Date.parse(right.createdAt) - Date.parse(left.createdAt);
}

function compareCreatedAtAscending(
  left: BrowserPersistentReceiptCacheRecord,
  right: BrowserPersistentReceiptCacheRecord,
): number {
  return Date.parse(left.createdAt) - Date.parse(right.createdAt);
}
