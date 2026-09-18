import type { BrowserReceiptCacheHealth } from "./health.js";
import type { BrowserReceiptCacheManifest } from "./manifest.js";

export function renderBrowserReceiptCacheSurface(input: {
  readonly manifest?: BrowserReceiptCacheManifest;
  readonly health: BrowserReceiptCacheHealth;
}): string {
  return [
    "Browser receipt cache",
    "Status",
    `- Cache configured: ${input.health.status === "missing" ? "no" : "yes"}`,
    `- Cache status: ${input.health.status}`,
    `- Scope: ${input.manifest?.scope ?? "none"}`,
    `- Source: ${input.manifest?.source ?? "none"}`,
    `- Records: ${input.health.recordCount}`,
    `- Replayable records: ${input.health.replayableCount}`,
    `- Invalidated/deleted records: ${input.health.invalidatedCount + input.health.deletedCount}`,
    `- Corrupted/skipped records: ${input.health.corruptedCount}`,
    `- Unsafe/skipped records: ${input.health.unsafeCount}`,
    `- Duplicate active records: ${input.health.duplicateActiveCount}`,
    `- Over-budget records: ${input.health.overBudgetCount}`,
    `- Integrity: ${input.health.integrityStatus}`,
    `- Lock: ${input.health.lockStatus}`,
    `- Readable: ${input.health.readable ? "yes" : "no"}`,
    `- Writable: ${input.health.writable ? "yes" : "no"}`,
    `- Last update: ${input.health.lastUpdatedAt ?? "none"}`,
    "- Persistence: explicit only",
    "- Raw evidence stored: no",
    "- Automatic replay: no",
    "- Provider/model call: none",
    `- Blockers/warnings: ${[...input.health.blockers, ...input.health.warnings].join("; ") || "none"}`,
    `- Next action: ${nextAction(input.health)}`,
  ].join("\n");
}

function nextAction(health: BrowserReceiptCacheHealth): string {
  if (health.status === "missing") {
    return "Provide an explicit browser receipt cache manifest or root to enable persistent replay.";
  }
  if (health.status === "invalid") {
    return "Fix the explicit cache manifest/root before relying on persistent replay.";
  }
  if (health.integrityStatus === "unsafe" || health.integrityStatus === "corrupted") {
    return "Run /browser replay cache repair or delete the explicit cache root after review.";
  }
  if (health.duplicateActiveCount > 0 || health.overBudgetCount > 0) {
    return "Run /browser replay cache compact to remove superseded sanitized records.";
  }
  if (health.replayableCount === 0) {
    return "Run an explicit replay-ready local/test browser execution to write a cache record.";
  }
  return "Run /browser replay <receipt-id> explicitly with current runner gates.";
}
