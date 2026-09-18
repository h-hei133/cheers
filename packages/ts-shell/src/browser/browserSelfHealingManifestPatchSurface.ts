import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserSelfHealingManifestPatchWriteResult } from "./browserSelfHealingManifestPatchWriter.js";

export function renderBrowserSelfHealingManifestPatchSurface(
  result: BrowserSelfHealingManifestPatchWriteResult,
): string {
  return [
    "Browser self-healing manifest patch",
    `- Proposal id: ${safe(result.patch.proposalId)}`,
    `- Patch kind: ${safe(result.patch.patchKind)}`,
    `- Target: ${result.manifestKind}`,
    `- Manifest patch status: ${result.manifestPatchStatus}`,
    `- Validation: ${result.applied ? "validated-before-and-after" : "blocked-before-write"}`,
    `- Applied: ${result.applied ? "yes" : "no"}`,
    `- Browser executed: ${result.browserExecuted ? "yes" : "no"}`,
    `- Replay executed: ${result.replayExecuted ? "yes" : "no"}`,
    `- Change summary: ${safe(result.changedSummary, 220)}`,
    `- Warnings/blockers: ${summarize([...result.blockers, ...result.warnings])}`,
    `- Next action: ${safe(result.nextAction, 240)}`,
  ].join("\n");
}

function summarize(values: readonly string[]): string {
  return values.length === 0 ? "none" : safe(values.slice(0, 5).join("; "), 220);
}

function safe(value: string, maxLength = 180): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
