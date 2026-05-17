import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserReplayRepairPreview } from "./browserReplayRepairPreview.js";

export function renderBrowserReplayRepairSurface(
  preview: BrowserReplayRepairPreview,
): string {
  return [
    "Browser replay repair preview",
    `- Failure: ${safe(preview.failureKind)}`,
    `- Repair readiness: ${safe(preview.repairReadiness)}`,
    `- Suggested action: ${safe(preview.proposedSafeRepairStep, 220)}`,
    `- Required gate: ${safe(preview.requiredCondition, 160)}`,
    "- Executed: no",
    "- Repair applied: no",
    "- Automatic repair: no",
    "- Automatic replay: no",
    `- Next action: ${safe(preview.nextAction, 220)}`,
  ].join("\n");
}

function safe(value: string, maxLength = 160): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
