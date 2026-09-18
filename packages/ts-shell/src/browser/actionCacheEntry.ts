import { sanitizeBrowserText } from "./capabilityModel.js";
import type { BrowserExecutionActionKind, BrowserExecutionMode } from "./executionContract.js";
import type {
  BrowserExecutionReceipt,
  BrowserExecutionReceiptId,
  BrowserExecutionReceiptStatus,
  BrowserExecutionReceiptVisibility,
} from "./executionReceipt.js";
import type { BrowserReplayReadiness } from "./replayReadiness.js";

export type BrowserActionCacheEntryId = string;
export type BrowserActionCacheEntryVersion = "browser-action-cache-entry/v1";

export interface BrowserActionCacheEntry {
  readonly entryId: BrowserActionCacheEntryId;
  readonly version: BrowserActionCacheEntryVersion;
  readonly sourceReceiptId: BrowserExecutionReceiptId;
  readonly sourceReceiptStatus: BrowserExecutionReceiptStatus;
  readonly sourceReceiptVisibility: BrowserExecutionReceiptVisibility;
  readonly actionKind: BrowserExecutionActionKind;
  readonly executionMode: BrowserExecutionMode;
  readonly runnerSource: string;
  readonly runnerId: string;
  readonly manifestId: string;
  readonly manifestSource: string;
  readonly skillRunnerId?: string;
  readonly skillRunnerStatus?: string;
  readonly bindingRef?: string;
  readonly fixtureId: string;
  readonly safeUrl: string;
  readonly evidenceSummary: string;
  readonly actionTraceSummary: string;
  readonly sandboxDecisionSnapshot: string;
  readonly allowlistDecisionSnapshot: string;
  readonly confirmationDecisionSnapshot: string;
  readonly replayReadinessSnapshot: BrowserReplayReadiness;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly createdAt: string;
  readonly rawContent: "excluded";
  readonly providerCall: "none";
  readonly modelCall: "none";
  readonly persistence: "none";
}

export type BrowserActionCacheEntryResult =
  | {
      readonly ok: true;
      readonly entry: BrowserActionCacheEntry;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly warnings: readonly string[];
      readonly redactions: readonly string[];
    };

export function createBrowserActionCacheEntryFromReceipt(input: {
  readonly receipt: BrowserExecutionReceipt;
  readonly now?: () => string;
}): BrowserActionCacheEntryResult {
  const receipt = input.receipt;
  const evidenceSummary = summarizeReceiptEvidence(receipt);
  const candidate = {
    receiptId: receipt.receiptId,
    runnerId: receipt.runnerId,
    runnerSource: receipt.runnerSource,
    manifestId: receipt.manifestId,
    manifestSource: receipt.manifestSource,
    fixtureId: receipt.fixtureId,
    safeUrl: receipt.evidenceBundle.safeUrl,
    evidenceSummary,
    actionTraceSummary: receipt.evidenceBundle.actionTraceSummary,
    redactions: receipt.redactions,
    warnings: receipt.warnings,
  };
  if (receipt.rawContent !== "excluded" || receipt.providerCall !== "none" || receipt.modelCall !== "none") {
    return invalid("Browser action cache entries can only derive from raw-content-excluded receipts.");
  }
  if (browserActionCacheEntryHasForbiddenContent(JSON.stringify(candidate))) {
    return invalid("Browser action cache entry candidate contains unsafe evidence.", ["browser-action-cache-entry:redacted"]);
  }
  const entry: BrowserActionCacheEntry = {
    entryId: deterministicBrowserActionCacheEntryId(receipt.receiptId),
    version: "browser-action-cache-entry/v1",
    sourceReceiptId: receipt.receiptId,
    sourceReceiptStatus: receipt.status,
    sourceReceiptVisibility: receipt.visibility,
    actionKind: receipt.actionKind,
    executionMode: receipt.executionMode,
    runnerSource: safe(receipt.runnerSource, 120),
    runnerId: safe(receipt.runnerId, 120),
    manifestId: safe(receipt.manifestId, 120),
    manifestSource: safe(receipt.manifestSource, 120),
    skillRunnerId: receipt.skillRunnerId ? safe(receipt.skillRunnerId, 120) : undefined,
    skillRunnerStatus: receipt.skillRunnerStatus ? safe(receipt.skillRunnerStatus, 120) : undefined,
    bindingRef: receipt.skillRunnerId ? safe(`${receipt.skillRunnerId}:${receipt.skillRunnerStatus ?? "unknown"}`, 160) : undefined,
    fixtureId: safe(receipt.fixtureId, 120),
    safeUrl: safe(receipt.evidenceBundle.safeUrl, 160),
    evidenceSummary,
    actionTraceSummary: safe(receipt.evidenceBundle.actionTraceSummary, 220),
    sandboxDecisionSnapshot: safe(receipt.sandboxDecision, 120),
    allowlistDecisionSnapshot: safe(receipt.allowlistDecision, 120),
    confirmationDecisionSnapshot: safe(receipt.confirmationDecision, 120),
    replayReadinessSnapshot: receipt.replayReadiness,
    redactions: unique(receipt.redactions.map((value) => safe(value, 100))),
    warnings: unique(receipt.warnings.map((value) => safe(value, 140))),
    createdAt: input.now?.() ?? receipt.createdAt,
    rawContent: "excluded",
    providerCall: "none",
    modelCall: "none",
    persistence: "none",
  };
  return {
    ok: true,
    entry,
    evidence: [
      "browser-action-cache-entry:derived-from-receipt",
      "browser-action-cache-entry:safe-summary-only",
      "browser-action-cache-entry:no-persistence",
      "browser-action-cache-entry:no-execution",
    ],
    warnings: [],
    redactions: entry.redactions,
  };
}

export function deterministicBrowserActionCacheEntryId(
  receiptId: BrowserExecutionReceiptId,
): BrowserActionCacheEntryId {
  const normalized = sanitizeBrowserText(receiptId, 140)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `browser-action-cache-entry:${normalized || "receipt"}`;
}

export function browserActionCacheEntryHasForbiddenContent(value: string): boolean {
  return /\bRAW_[A-Z0-9_]+\b/.test(value) ||
    /<html[\s>]|<\/html>|<body[\s>]|<\/body>/i.test(value) ||
    /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(value) ||
    /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(value) ||
    /\b(screenshot|ocr|base64)\s*:/i.test(value);
}

function summarizeReceiptEvidence(receipt: BrowserExecutionReceipt): string {
  return safe([
    `title=${receipt.evidenceBundle.safeTitle}`,
    `url=${receipt.evidenceBundle.safeUrl}`,
    `observation=${receipt.evidenceBundle.observationSummary}`,
    `extraction=${receipt.evidenceBundle.extractionSummary}`,
    `trace=${receipt.evidenceBundle.actionTraceSummary}`,
  ].join("; "), 360);
}

function invalid(
  reason: string,
  redactions: readonly string[] = [],
): Extract<BrowserActionCacheEntryResult, { ok: false }> {
  return {
    ok: false,
    reason,
    evidence: [
      "browser-action-cache-entry:blocked",
      "browser-action-cache-entry:no-persistence",
      "browser-action-cache-entry:no-execution",
    ],
    warnings: ["browser-action-cache-entry:unsafe-or-ineligible"],
    redactions,
  };
}

function safe(value: string, maxLength: number): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
