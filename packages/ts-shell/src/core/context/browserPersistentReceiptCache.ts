import {
  browserActionCacheEntryHasForbiddenContent,
  createBrowserActionCacheEntryFromReceipt,
  type BrowserActionCacheEntry,
} from "./browserActionCacheEntry.js";
import type { BrowserExecutionReceipt } from "./browserExecutionReceipt.js";
import type { BrowserReceiptCacheSource } from "../../browser/receipt/browserReceiptCacheManifest.js";

export type BrowserPersistentReceiptCacheRecordVersion = "browser-persistent-receipt-cache/v1";
export type BrowserPersistentReceiptCacheRecordStatus = "active" | "invalidated" | "deleted";

export interface BrowserPersistentReceiptCacheRecord {
  readonly version: BrowserPersistentReceiptCacheRecordVersion;
  readonly receiptId: string;
  readonly status: BrowserPersistentReceiptCacheRecordStatus;
  readonly source: BrowserReceiptCacheSource;
  readonly cacheEntry?: BrowserActionCacheEntry;
  readonly receipt?: BrowserExecutionReceipt;
  readonly evidenceSummary: string;
  readonly replayReadinessStatus: string;
  readonly createdAt: string;
  readonly invalidatedAt?: string;
  readonly deletedAt?: string;
  readonly reason?: string;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly rawEvidenceStored: "no";
  readonly providerCall: "none";
  readonly modelCall: "none";
}

export type BrowserPersistentReceiptCacheRecordResult =
  | {
      readonly ok: true;
      readonly record: BrowserPersistentReceiptCacheRecord;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
    };

export function createBrowserPersistentReceiptCacheRecord(input: {
  readonly receipt: BrowserExecutionReceipt;
  readonly cacheEntry?: BrowserActionCacheEntry;
  readonly source: BrowserReceiptCacheSource;
  readonly now?: () => string;
}): BrowserPersistentReceiptCacheRecordResult {
  let entry: BrowserActionCacheEntry;
  if (input.cacheEntry) {
    entry = input.cacheEntry;
  } else {
    const entryResult = createBrowserActionCacheEntryFromReceipt({ receipt: input.receipt, now: input.now });
    if (entryResult.ok === false) {
      return blocked(entryResult.reason, entryResult.redactions);
    }
    entry = entryResult.entry;
  }
  if (
    input.receipt.rawContent !== "excluded" ||
    input.receipt.providerCall !== "none" ||
    input.receipt.modelCall !== "none"
  ) {
    return blocked("Persistent browser cache only accepts sanitized receipts.");
  }
  const record: BrowserPersistentReceiptCacheRecord = {
    version: "browser-persistent-receipt-cache/v1",
    receiptId: input.receipt.receiptId,
    status: "active",
    source: input.source,
    cacheEntry: entry,
    receipt: input.receipt,
    evidenceSummary: safeSummary(input.receipt),
    replayReadinessStatus: input.receipt.replayReadiness.status,
    createdAt: input.now?.() ?? input.receipt.createdAt,
    redactions: unique([...input.receipt.redactions, ...entry.redactions]),
    warnings: unique([...input.receipt.warnings, ...entry.warnings]),
    rawEvidenceStored: "no",
    providerCall: "none",
    modelCall: "none",
  };
  if (browserActionCacheEntryHasForbiddenContent(JSON.stringify(record))) {
    return blocked("Persistent browser cache record contains unsafe content.", ["browser-persistent-cache:redacted"]);
  }
  return {
    ok: true,
    record,
    evidence: [
      "browser-persistent-receipt-cache:record-created",
      "browser-persistent-receipt-cache:sanitized-only",
      "browser-persistent-receipt-cache:no-provider-or-model-call",
    ],
    warnings: record.warnings,
  };
}

export function createBrowserPersistentReceiptCacheTombstone(input: {
  readonly receiptId: string;
  readonly status: "invalidated" | "deleted";
  readonly source: BrowserReceiptCacheSource;
  readonly reason: string;
  readonly now: string;
}): BrowserPersistentReceiptCacheRecord {
  return {
    version: "browser-persistent-receipt-cache/v1",
    receiptId: input.receiptId,
    status: input.status,
    source: input.source,
    evidenceSummary: "sanitized tombstone",
    replayReadinessStatus: "replay-blocked",
    createdAt: input.now,
    invalidatedAt: input.status === "invalidated" ? input.now : undefined,
    deletedAt: input.status === "deleted" ? input.now : undefined,
    reason: input.reason,
    redactions: [],
    warnings: [`browser-persistent-cache:${input.status}`],
    rawEvidenceStored: "no",
    providerCall: "none",
    modelCall: "none",
  };
}

export function parseBrowserPersistentReceiptCacheRecord(
  value: unknown,
): BrowserPersistentReceiptCacheRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Partial<BrowserPersistentReceiptCacheRecord>;
  if (record.version !== "browser-persistent-receipt-cache/v1") {
    return undefined;
  }
  if (!record.receiptId || typeof record.receiptId !== "string") {
    return undefined;
  }
  if (!["active", "invalidated", "deleted"].includes(record.status ?? "")) {
    return undefined;
  }
  if (browserActionCacheEntryHasForbiddenContent(JSON.stringify(record))) {
    return undefined;
  }
  if (record.status === "active" && (!record.cacheEntry || !record.receipt)) {
    return undefined;
  }
  return record as BrowserPersistentReceiptCacheRecord;
}

function safeSummary(receipt: BrowserExecutionReceipt): string {
  return [
    `receipt=${receipt.receiptId}`,
    `action=${receipt.actionKind}`,
    `mode=${receipt.executionMode}`,
    `fixture=${receipt.fixtureId}`,
    `replay=${receipt.replayReadiness.status}`,
  ].join("; ");
}

function blocked(
  reason: string,
  redactions: readonly string[] = [],
): Extract<BrowserPersistentReceiptCacheRecordResult, { ok: false }> {
  return {
    ok: false,
    reason,
    evidence: [
      "browser-persistent-receipt-cache:record-blocked",
      "browser-persistent-receipt-cache:safe-error",
    ],
    warnings: ["browser-persistent-receipt-cache:unsafe-or-ineligible"],
    redactions,
  };
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
