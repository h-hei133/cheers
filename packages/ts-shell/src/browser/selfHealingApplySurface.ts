import { sanitizeBrowserText } from "./capabilityModel.js";
import type { BrowserSelfHealingApplyResult } from "./selfHealingApplyExecutor.js";
import type { BrowserSelfHealingApplyPlan } from "./selfHealingApplyPlan.js";
import { renderBrowserSelfHealingManifestPatchSurface } from "./selfHealingManifestPatchSurface.js";

export function renderBrowserSelfHealingApplySurface(input: {
  readonly plan: BrowserSelfHealingApplyPlan;
  readonly result?: BrowserSelfHealingApplyResult;
}): string {
  const result = input.result;
  const lines = [
    "Browser self-healing apply",
    "Result",
    `- Outcome: ${result ? (result.applied ? "applied" : result.cacheOutcome ?? "blocked") : "status"}`,
    `- Proposal id: ${safe(input.plan.proposalId)}`,
    `- Proposal kind: ${safe(input.plan.proposalKind ?? "unknown")}`,
    `- Apply status: ${result?.applyStatus ?? input.plan.applyStatus}`,
    `- Target: ${input.plan.target}`,
    `- Applied: ${result?.applied ? "yes" : "no"}`,
    `- Browser executed: ${result?.browserActionExecuted ? "yes" : "no"}`,
    `- Replay executed: ${result?.replayExecuted ? "yes" : "no"}`,
    `- Metadata/cache changed: ${result?.metadataCacheChanged ?? "no"}`,
    ...(result?.cacheCleanup ? [`- Cache lock cleanup: ${result.cacheCleanup}`] : []),
    `- Change summary: ${safe(result?.changedSummary ?? "none", 220)}`,
    `- Manifest patch: ${result?.manifestPatch ? result.manifestPatch.manifestPatchStatus : "none"}`,
    `- Required context: ${safe(input.plan.requiredExplicitContext)}`,
    `- User confirmation required: ${input.plan.requiredUserConfirmation ? "yes" : "no"}`,
    `- Warnings/blockers: ${summarize([...(result?.blockers ?? input.plan.blockers), ...(result?.warnings ?? input.plan.warnings)])}`,
    "- Automatic repair: no",
    "- Automatic replay: no",
    "- Browser execution change: no",
    `- Next action: ${safe(result?.nextAction ?? input.plan.nextAction, 240)}`,
  ];
  if (result?.manifestPatch) {
    lines.push("", renderBrowserSelfHealingManifestPatchSurface(result.manifestPatch));
  }
  return lines.join("\n");
}

export function renderBrowserSelfHealingStatusSurface(): string {
  return [
    "Browser self-healing apply",
    "Result",
    "- Outcome: status",
    "- Apply availability: explicit proposal id only",
    "- Supported apply target: sanitized cache repair",
    "- Blocked targets: unsafe evidence, external network, global runner binding, global allowlist",
    "- Browser executed: no",
    "- Replay executed: no",
    "- Automatic repair: no",
    "- Automatic replay: no",
    "- Next action: Use /browser repair apply <proposal-id> --confirm with explicit local/test context.",
  ].join("\n");
}

function summarize(values: readonly string[]): string {
  return values.length === 0 ? "none" : safe(values.slice(0, 5).join("; "), 220);
}

function safe(value: string, maxLength = 180): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
