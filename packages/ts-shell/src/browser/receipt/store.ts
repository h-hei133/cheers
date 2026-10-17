import {
  createBrowserPersistentReceiptCacheRecord,
  createBrowserPersistentReceiptCacheTombstone,
  type BrowserPersistentReceiptCacheRecord,
} from "../persistentReceiptCache.js";
import type { BrowserExecutionReceipt } from "../executionReceipt.js";
import { validateBrowserReceiptCacheManifest, type BrowserReceiptCacheManifest } from "./manifest.js";
import path from 'node:path';
import { assertProfileStorage, currentProfile } from '../../core/paths/profile/context.js';
import { mutateBrowserReceiptCache, type ReceiptCacheMutationResult } from "./mutation.js";
import {
  listBrowserReceiptCache, lookupBrowserReceiptCache, observeBrowserReceiptCacheHealth,
  type BrowserReceiptCacheLookupResult, type BrowserReceiptCacheListResult, type BrowserReceiptCacheStoreHealth,
} from "./observation.js";
export type { BrowserReceiptCacheListResult, BrowserReceiptCacheLookupResult, BrowserReceiptCacheStoreHealth } from "./observation.js";

export interface BrowserReceiptCacheStore {
  readonly manifest: BrowserReceiptCacheManifest;
  writeReceipt(receipt: BrowserExecutionReceipt): BrowserReceiptCacheWriteResult;
  get(receiptId: string): BrowserReceiptCacheLookupResult;
  list(): BrowserReceiptCacheListResult;
  invalidate(receiptId: string, reason: string): BrowserReceiptCacheMutationResult;
  delete(receiptId: string, reason: string): BrowserReceiptCacheMutationResult;
  compact(): BrowserReceiptCacheMaintenanceResult;
  repair(): BrowserReceiptCacheMaintenanceResult;
  health(): BrowserReceiptCacheStoreHealth;
}

export interface BrowserReceiptCacheWriteResult extends ReceiptCacheMutationResult {
  readonly written: boolean;
  readonly record?: BrowserPersistentReceiptCacheRecord;
}

export interface BrowserReceiptCacheMutationResult extends ReceiptCacheMutationResult {
  readonly changed: boolean;
  readonly record?: BrowserPersistentReceiptCacheRecord;
}

export interface BrowserReceiptCacheMaintenanceResult extends ReceiptCacheMutationResult {
  readonly changed: boolean;
}

export function createBrowserReceiptCacheStore(input: {
  readonly manifest: BrowserReceiptCacheManifest;
  readonly now?: () => string;
}): BrowserReceiptCacheStore {
  const validation = validateBrowserReceiptCacheManifest(input.manifest);
  if (!validation.ok) throw new Error(validation.reason);
  const manifest = validation.manifest;
  const profile = currentProfile();
  const assertOwner = () => {
    for (const file of ['browser-receipt-cache.jsonl', 'browser-receipt-cache.lock.json']) {
      assertProfileStorage(path.join(manifest.cacheRoot, file), profile);
    }
  };
  assertOwner();
  const now = input.now ?? (() => new Date().toISOString());

  function tombstone(receiptId: string, reason: string, status: "deleted" | "invalidated"): BrowserReceiptCacheMutationResult {
    try {
      assertOwner();
      const record = createBrowserPersistentReceiptCacheTombstone({ receiptId, reason, status, source: manifest.source, now: now() });
      const result = mutateBrowserReceiptCache({ manifest, operation: status === "deleted" ? "delete" : "invalidate", record, now, assertOwner });
      return { ...result, changed: result.outcome === "written", record: result.outcome === "written" ? record : undefined };
    } catch {
      return { ...blocked("Cache tombstone is invalid or unsafe."), changed: false };
    }
  }

  function maintenance(operation: "compact" | "repair"): BrowserReceiptCacheMaintenanceResult {
    assertOwner();
    const result = mutateBrowserReceiptCache({ manifest, operation, now, assertOwner });
    return { ...result, changed: result.outcome === "written" };
  }

  return {
    manifest,
    writeReceipt(receipt) {
      try {
        assertOwner();
        if (receipt.replayReadiness.status !== "replay-ready") {
          return { ...blocked("Only replay-ready browser receipts may be persisted."), written: false };
        }
        const record = createBrowserPersistentReceiptCacheRecord({ receipt, source: manifest.source, now });
        if (!record.ok) return { ...blocked(record.reason), evidence: record.evidence, warnings: record.warnings, written: false };
        const result = mutateBrowserReceiptCache({ manifest, operation: "write", record: record.record, now, assertOwner });
        return { ...result, written: result.outcome === "written", record: result.outcome === "written" ? record.record : undefined };
      } catch {
        return { ...blocked("Cache receipt is invalid or unsafe."), written: false };
      }
    },
    get: (receiptId) => { assertOwner(); return lookupBrowserReceiptCache(listBrowserReceiptCache(manifest), receiptId); },
    list: () => { assertOwner(); return listBrowserReceiptCache(manifest); },
    invalidate: (receiptId, reason) => tombstone(receiptId, reason, "invalidated"),
    delete: (receiptId, reason) => tombstone(receiptId, reason, "deleted"),
    compact: () => maintenance("compact"),
    repair: () => maintenance("repair"),
    health: () => { assertOwner(); return observeBrowserReceiptCacheHealth(manifest, now); },
  };
}

function blocked(reason: string): ReceiptCacheMutationResult {
  return { outcome: "blocked", cleanup: "not-acquired", reason, evidence: ["browser-receipt-cache-store:blocked"], warnings: [], blockers: [reason] };
}
