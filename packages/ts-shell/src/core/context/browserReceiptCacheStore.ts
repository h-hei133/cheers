import fs from "node:fs";
import path from "node:path";
import {
  createBrowserPersistentReceiptCacheRecord,
  createBrowserPersistentReceiptCacheTombstone,
  parseBrowserPersistentReceiptCacheRecord,
  type BrowserPersistentReceiptCacheRecord,
} from "./browserPersistentReceiptCache.js";
import type { BrowserExecutionReceipt } from "./browserExecutionReceipt.js";
import type { BrowserReceiptCacheManifest } from "./browserReceiptCacheManifest.js";

export interface BrowserReceiptCacheStore {
  readonly manifest: BrowserReceiptCacheManifest;
  writeReceipt(receipt: BrowserExecutionReceipt): BrowserReceiptCacheWriteResult;
  get(receiptId: string): BrowserPersistentReceiptCacheRecord | undefined;
  list(): BrowserReceiptCacheListResult;
  invalidate(receiptId: string, reason: string): BrowserReceiptCacheMutationResult;
  delete(receiptId: string, reason: string): BrowserReceiptCacheMutationResult;
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
  readonly evidence: readonly string[];
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
  readonly replayableCount: number;
  readonly lastUpdatedAt?: string;
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
  readonly evidence: readonly string[];
}

export function createBrowserReceiptCacheStore(input: {
  readonly manifest: BrowserReceiptCacheManifest;
  readonly now?: () => string;
}): BrowserReceiptCacheStore {
  const filePath = path.join(input.manifest.cacheRoot, "browser-receipt-cache.jsonl");
  const now = input.now ?? (() => new Date().toISOString());

  function ensureRoot(): void {
    fs.mkdirSync(input.manifest.cacheRoot, { recursive: true });
  }

  function append(record: BrowserPersistentReceiptCacheRecord): void {
    ensureRoot();
    fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  function rewriteWithout(receiptId: string): void {
    if (!fs.existsSync(filePath)) {
      return;
    }
    const kept = fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => {
        try {
          const parsed = parseBrowserPersistentReceiptCacheRecord(JSON.parse(line));
          return parsed?.receiptId !== receiptId;
        } catch {
          return true;
        }
      });
    fs.writeFileSync(filePath, kept.length > 0 ? `${kept.join("\n")}\n` : "", "utf8");
  }

  function readLatest(): BrowserReceiptCacheListResult {
    if (!fs.existsSync(filePath)) {
      return {
        records: [],
        corruptedCount: 0,
        evidence: ["browser-receipt-cache-store:list:empty"],
      };
    }
    const latest = new Map<string, BrowserPersistentReceiptCacheRecord>();
    let corruptedCount = 0;
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = parseBrowserPersistentReceiptCacheRecord(JSON.parse(line));
        if (!parsed) {
          corruptedCount += 1;
          continue;
        }
        latest.set(parsed.receiptId, parsed);
      } catch {
        corruptedCount += 1;
      }
    }
    const records = Array.from(latest.values()).slice(-input.manifest.maxRecords);
    return {
      records,
      corruptedCount,
      evidence: [
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
      append(result.record);
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
      append(record);
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
      rewriteWithout(receiptId);
      append(record);
      return changed(record, "browser-receipt-cache-store:deleted");
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
        : { records: [], corruptedCount: 0, evidence: [] };
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
        replayableCount: active.filter((record) => record.replayReadinessStatus === "replay-ready").length,
        lastUpdatedAt: list.records.at(-1)?.createdAt,
        warnings: list.corruptedCount > 0 ? ["browser-receipt-cache-store:corrupted-records-skipped"] : [],
        blockers,
        evidence: [
          ...list.evidence,
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

function unchanged(reason: string): BrowserReceiptCacheMutationResult {
  return {
    changed: false,
    evidence: ["browser-receipt-cache-store:mutation-blocked"],
    warnings: [reason],
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
