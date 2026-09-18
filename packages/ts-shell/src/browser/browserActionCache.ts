import {
  createBrowserActionCacheEntryFromReceipt,
  type BrowserActionCacheEntry,
  type BrowserActionCacheEntryResult,
} from "./browserActionCacheEntry.js";
import type { BrowserExecutionReceipt } from "./browserExecutionReceipt.js";

export interface BrowserActionCache {
  add(entry: BrowserActionCacheEntry): BrowserActionCacheWriteResult;
  addReceipt(receipt: BrowserExecutionReceipt): BrowserActionCacheEntryResult;
  get(receiptOrEntryId: string): BrowserActionCacheEntry | undefined;
  getReceipt(receiptId: string): BrowserExecutionReceipt | undefined;
  list(options?: BrowserActionCacheListOptions): readonly BrowserActionCacheEntry[];
  clear(): BrowserActionCacheClearResult;
  summary(): BrowserActionCacheSummary;
}

export interface BrowserActionCacheWriteResult {
  readonly written: boolean;
  readonly replaced: boolean;
  readonly entry: BrowserActionCacheEntry;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
}

export interface BrowserActionCacheClearResult {
  readonly cleared: number;
  readonly evidence: readonly string[];
}

export interface BrowserActionCacheListOptions {
  readonly includeUnsafe?: boolean;
  readonly includeDeveloperOnly?: boolean;
}

export interface BrowserActionCacheSummary {
  readonly entryCount: number;
  readonly visibleEntryCount: number;
  readonly persistence: "none";
  readonly replayExecution: "explicit-only";
  readonly evidence: readonly string[];
}

export interface BrowserActionCacheOptions {
  readonly maxEntries?: number;
  readonly now?: () => string;
}

export function createBrowserActionCache(
  options: BrowserActionCacheOptions = {},
): BrowserActionCache {
  const maxEntries = options.maxEntries ?? 20;
  const entries = new Map<string, BrowserActionCacheEntry>();
  const receiptIndex = new Map<string, string>();
  const receipts = new Map<string, BrowserExecutionReceipt>();

  function add(entry: BrowserActionCacheEntry): BrowserActionCacheWriteResult {
    const previousEntryId = receiptIndex.get(entry.sourceReceiptId);
    const replaced = Boolean(previousEntryId);
    if (previousEntryId) {
      entries.delete(previousEntryId);
    }
    entries.set(entry.entryId, entry);
    receiptIndex.set(entry.sourceReceiptId, entry.entryId);
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value as string | undefined;
      if (!oldest) {
        break;
      }
      const removed = entries.get(oldest);
      entries.delete(oldest);
      if (removed) {
        receiptIndex.delete(removed.sourceReceiptId);
        receipts.delete(removed.sourceReceiptId);
      }
    }
    return {
      written: true,
      replaced,
      entry,
      evidence: [
        "browser-action-cache:in-memory",
        "browser-action-cache:receipt-backed",
        "browser-action-cache:no-persistence",
        replaced ? "browser-action-cache:replaced-source-receipt" : "browser-action-cache:added",
      ],
      warnings: entry.replayReadinessSnapshot.status === "replay-ready" ? [] : ["browser-action-cache:entry-not-replay-ready"],
    };
  }

  return {
    add,
    addReceipt(receipt) {
      const result = createBrowserActionCacheEntryFromReceipt({ receipt, now: options.now });
      if (result.ok) {
        add(result.entry);
        receipts.set(receipt.receiptId, receipt);
      }
      return result;
    },
    get(receiptOrEntryId) {
      const entryId = receiptIndex.get(receiptOrEntryId) ?? receiptOrEntryId;
      return entries.get(entryId);
    },
    getReceipt(receiptId) {
      return receipts.get(receiptId);
    },
    list(listOptions = {}) {
      return Array.from(entries.values()).filter((entry) => {
        if (!listOptions.includeDeveloperOnly && entry.sourceReceiptVisibility !== "user-visible") {
          return false;
        }
        if (!listOptions.includeUnsafe && entry.replayReadinessSnapshot.status === "replay-unsafe") {
          return false;
        }
        return true;
      });
    },
    clear() {
      const cleared = entries.size;
      entries.clear();
      receiptIndex.clear();
      receipts.clear();
      return {
        cleared,
        evidence: [
          "browser-action-cache:cleared",
          "browser-action-cache:no-persistence",
        ],
      };
    },
    summary() {
      const visibleEntryCount = this.list().length;
      return {
        entryCount: entries.size,
        visibleEntryCount,
        persistence: "none",
        replayExecution: "explicit-only",
        evidence: [
          "browser-action-cache:summary",
          "browser-action-cache:in-memory",
          "browser-action-cache:no-persistence",
          "browser-action-cache:no-automatic-replay",
        ],
      };
    },
  };
}
