import fs from "node:fs";
import path from "node:path";
import { browserActionCacheEntryHasForbiddenContent } from "./browserActionCacheEntry.js";
import {
  parseBrowserPersistentReceiptCacheRecord,
  type BrowserPersistentReceiptCacheRecord,
} from "./browserPersistentReceiptCache.js";
import type { BrowserReceiptCacheManifest } from "./browserReceiptCacheManifest.js";

export interface BrowserReceiptCacheRecoveryResult {
  readonly records: readonly BrowserPersistentReceiptCacheRecord[];
  readonly lineCount: number;
  readonly invalidJsonCount: number;
  readonly invalidRecordCount: number;
  readonly unsafeRecordCount: number;
  readonly unknownVersionCount: number;
  readonly skippedCount: number;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
}

export function browserReceiptCacheFilePath(cacheRoot: string): string {
  return path.join(cacheRoot, "browser-receipt-cache.jsonl");
}

export function readBrowserReceiptCacheRecordsForRecovery(input: {
  readonly manifest: BrowserReceiptCacheManifest;
}): BrowserReceiptCacheRecoveryResult {
  const filePath = browserReceiptCacheFilePath(input.manifest.cacheRoot);
  if (!fs.existsSync(filePath)) {
    return {
      records: [],
      lineCount: 0,
      invalidJsonCount: 0,
      invalidRecordCount: 0,
      unsafeRecordCount: 0,
      unknownVersionCount: 0,
      skippedCount: 0,
      evidence: ["browser-receipt-cache-recovery:empty"],
      warnings: [],
    };
  }
  const records: BrowserPersistentReceiptCacheRecord[] = [];
  let invalidJsonCount = 0;
  let invalidRecordCount = 0;
  let unsafeRecordCount = 0;
  let unknownVersionCount = 0;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      invalidJsonCount += 1;
      continue;
    }
    if (browserActionCacheEntryHasForbiddenContent(JSON.stringify(value))) {
      unsafeRecordCount += 1;
      continue;
    }
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as { version?: unknown }).version !== "browser-persistent-receipt-cache/v1"
    ) {
      unknownVersionCount += 1;
      continue;
    }
    const parsed = parseBrowserPersistentReceiptCacheRecord(value);
    if (!parsed) {
      invalidRecordCount += 1;
      continue;
    }
    records.push(parsed);
  }
  const skippedCount = invalidJsonCount + invalidRecordCount + unsafeRecordCount + unknownVersionCount;
  return {
    records,
    lineCount: lines.length,
    invalidJsonCount,
    invalidRecordCount,
    unsafeRecordCount,
    unknownVersionCount,
    skippedCount,
    evidence: [
      "browser-receipt-cache-recovery:read",
      "browser-receipt-cache-recovery:safe-skips",
    ],
    warnings: skippedCount > 0 ? ["browser-receipt-cache-recovery:records-skipped"] : [],
  };
}

export function serializeBrowserReceiptCacheRecords(
  records: readonly BrowserPersistentReceiptCacheRecord[],
): string {
  return records.length > 0
    ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n`
    : "";
}

export function writeBrowserReceiptCacheFileAtomic(input: {
  readonly cacheRoot: string;
  readonly content: string;
  readonly now?: () => string;
  readonly suffix?: string;
}): void {
  fs.mkdirSync(input.cacheRoot, { recursive: true });
  const target = browserReceiptCacheFilePath(input.cacheRoot);
  const safeNow = (input.now?.() ?? new Date().toISOString()).replace(/[^0-9A-Za-z]/g, "");
  const temp = path.join(
    input.cacheRoot,
    `.browser-receipt-cache.${input.suffix ?? "write"}.${process.pid}.${safeNow}.tmp`,
  );
  fs.writeFileSync(temp, input.content, "utf8");
  fs.renameSync(temp, target);
}
