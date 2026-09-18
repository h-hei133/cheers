import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserSelectorRepairSeed } from "./browserSelectorRepairSeed.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { BrowserRuntimeManifest } from "../../browser/runtime/core/manifest.js";
import { browserRuntimeOriginAllowed } from "../../browser/runtime/core/manifest.js";

export type BrowserSelectorRepairApplyStatus =
  | "allowed"
  | "blocked-no-seed"
  | "blocked-low-confidence"
  | "blocked-public-origin"
  | "blocked-sensitive-action"
  | "blocked-no-confirmation";

export interface BrowserSelectorRepairApplyDecision {
  readonly status: BrowserSelectorRepairApplyStatus;
  readonly allowed: boolean;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
  readonly warnings: readonly string[];
}

export function decideBrowserSelectorRepairApply(input: {
  readonly request: BrowserExecutionRequest;
  readonly manifest: BrowserRuntimeManifest;
  readonly repairSeed?: BrowserSelectorRepairSeed;
  readonly selectedCandidate?: string;
  readonly confidence?: number;
  readonly confirmed?: boolean;
}): BrowserSelectorRepairApplyDecision {
  if (!input.repairSeed || input.repairSeed.readiness !== "preview-ready") {
    return decision("blocked-no-seed", "Selector repair apply requires a preview-ready repair seed.", "Generate repair preview first.");
  }
  if (["auth", "payment", "destructive", "upload", "download", "screenshot"].includes(input.request.actionKind) || /password|payment|card|secret|token/i.test(input.selectedCandidate ?? "")) {
    return decision("blocked-sensitive-action", "Sensitive selector repair apply is blocked.", "Use only safe controlled action candidates.");
  }
  if ((input.confidence ?? 0) < 0.7) {
    return decision("blocked-low-confidence", "Selector repair candidate confidence is too low.", "Choose a high-confidence accessibility candidate.");
  }
  const origin = input.request.action.url ??
    (input.request.actionKind === "navigate" ? input.request.action.target : undefined) ??
    input.manifest.allowedOrigins[0];
  if (!browserRuntimeOriginAllowed(input.manifest, origin)) {
    return decision("blocked-public-origin", "Public selector repair apply is blocked.", "Use controlled/local/test pages only.");
  }
  if ((input.request.actionKind === "click" || input.request.actionKind === "type") && !input.confirmed) {
    return decision("blocked-no-confirmation", "Controlled click/type repair apply requires explicit confirmation.", "Confirm the repair apply step before action execution.");
  }
  return decision("allowed", "Selector repair apply is allowed for controlled metadata.", "Execute the repaired action only through an explicit follow-up action step.");
}

function decision(
  status: BrowserSelectorRepairApplyStatus,
  reason: string,
  nextAction: string,
): BrowserSelectorRepairApplyDecision {
  return {
    status,
    allowed: status === "allowed",
    reason: sanitizeBrowserText(reason, 220),
    nextAction: sanitizeBrowserText(nextAction, 220),
    warnings: status === "allowed" ? [] : [status],
    evidence: [
      `browser-selector-repair-apply-policy:${status}`,
      "browser-selector-repair-apply-policy:metadata-only",
      "browser-selector-repair-apply-policy:no-automatic-action",
    ],
  };
}
