import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { browserActionCacheEntryHasForbiddenContent } from "../actionCacheEntry.js";
import {
  parseBrowserPersistentReceiptCacheRecord,
  type BrowserPersistentReceiptCacheRecord,
} from "../persistentReceiptCache.js";
import type { BrowserReceiptCacheManifest } from "./manifest.js";
import { readReceiptFile } from "./io.js";

export const MAX_RECEIPT_CACHE_BYTES = 8 * 1024 * 1024;

export interface BrowserReceiptCacheRecoveryResult {
  readonly status: "read" | "missing" | "denied" | "unavailable";
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
  const file = input.manifest.allowedOperations.includes("read")
    ? readReceiptFile(browserReceiptCacheFilePath(input.manifest.cacheRoot), MAX_RECEIPT_CACHE_BYTES)
    : { status: "denied" as const };
  if (file.status !== "read") {
    return {
      status: file.status,
      records: [],
      lineCount: 0,
      invalidJsonCount: 0,
      invalidRecordCount: 0,
      unsafeRecordCount: 0,
      unknownVersionCount: 0,
      skippedCount: 0,
      evidence: [`browser-receipt-cache-recovery:${file.status}`],
      warnings: file.status === "missing" ? [] : [`browser-receipt-cache-recovery:${file.status}`],
    };
  }
  const records: BrowserPersistentReceiptCacheRecord[] = [];
  let invalidJsonCount = 0;
  let invalidRecordCount = 0;
  let unsafeRecordCount = 0;
  let unknownVersionCount = 0;
  const lines = file.content.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    if (Buffer.byteLength(line) > 262_144) {
      invalidRecordCount += 1;
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
      // Deeply nested JSON can parse successfully but overflow serialization.
      JSON.stringify(value);
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
    status: "read",
    records,
    lineCount: lines.length,
    invalidJsonCount,
    invalidRecordCount,
    unsafeRecordCount,
    unknownVersionCount,
    skippedCount,
    evidence: [
      "browser-receipt-cache-recovery:read",
      "browser-receipt-cache-recovery:bounded-read",
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
  readonly ownsLock: () => boolean;
}): { readonly outcome: "written" | "blocked" | "unverified"; readonly warnings: readonly string[] } {
  if (Buffer.byteLength(input.content) > MAX_RECEIPT_CACHE_BYTES) {
    return { outcome: "blocked", warnings: ["browser-receipt-cache-store:byte-budget-exceeded"] };
  }
  const target = browserReceiptCacheFilePath(input.cacheRoot);
  const temp = path.join(input.cacheRoot, `.browser-receipt-cache.${randomUUID()}.tmp`);
  let ownedTemp = false;
  let attemptedRename = false;
  let outcome: "written" | "blocked" | "unverified" = "blocked";
  const warnings: string[] = [];
  try {
    const fd = fs.openSync(temp, "wx", 0o600);
    ownedTemp = true;
    try { fs.writeFileSync(fd, input.content, "utf8"); } finally { fs.closeSync(fd); }
    if (!input.ownsLock()) throw new Error("Lock ownership unavailable.");
    attemptedRename = true;
    fs.renameSync(temp, target);
    ownedTemp = false;
    const readback = readReceiptFile(target, MAX_RECEIPT_CACHE_BYTES);
    outcome = readback.status === "read" && readback.content === input.content ? "written" : "unverified";
  } catch {
    outcome = attemptedRename ? "unverified" : "blocked";
  } finally {
    if (ownedTemp) {
      try { fs.unlinkSync(temp); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") warnings.push("browser-receipt-cache-store:temporary-cleanup-unverified");
      }
    }
  }
  if (outcome !== "written") warnings.push(`browser-receipt-cache-store:write-${outcome}`);
  return { outcome, warnings };
}
