import type { BrowserExecutionRequest } from "./executionContract.js";
import { createBrowserActionContract } from "./actionContract.js";
import { createBrowserExecutionRequest } from "./executionContract.js";
import type { BrowserRuntimeManifest } from "./runtime/core/manifest.js";
import type { BrowserSelectorRepairSeed } from "./selectorRepairSeed.js";
import {
  decideBrowserSelectorRepairApply,
  type BrowserSelectorRepairApplyDecision,
} from "./selectorRepairApplyPolicy.js";

export interface BrowserSelectorRepairApplyResult {
  readonly decision: BrowserSelectorRepairApplyDecision;
  readonly repairedRequest?: BrowserExecutionRequest;
  readonly repairedTargetSummary?: string;
  readonly metadataOnly: true;
  readonly automaticActionExecuted: false;
  readonly evidence: readonly string[];
}

export function applyBrowserSelectorRepair(input: {
  readonly request: BrowserExecutionRequest;
  readonly manifest: BrowserRuntimeManifest;
  readonly repairSeed?: BrowserSelectorRepairSeed;
  readonly selectedCandidate?: string;
  readonly confidence?: number;
  readonly confirmed?: boolean;
}): BrowserSelectorRepairApplyResult {
  const decision = decideBrowserSelectorRepairApply(input);
  if (!decision.allowed || !input.selectedCandidate) {
    return {
      decision,
      metadataOnly: true,
      automaticActionExecuted: false,
      evidence: [...decision.evidence, "browser-selector-repair-apply-executor:not-applied"],
    };
  }
  const repairedRequest = createBrowserExecutionRequest({
    requestId: `${input.request.requestId}:repaired`,
    mode: input.request.mode,
    source: input.request.source,
    approval: input.request.approval,
    action: createBrowserActionContract({
      actionKind: input.request.actionKind,
      target: input.selectedCandidate,
      selector: input.selectedCandidate,
      text: input.request.action.text,
      url: input.request.action.url,
      extractionGoal: input.request.action.extractionGoal,
      userIntentSummary: `Repaired ${input.request.actionKind} target to ${input.selectedCandidate}.`,
      requiresNetwork: input.request.action.requiresNetwork,
      requiresAuth: false,
    }),
  });
  return {
    decision,
    repairedRequest,
    repairedTargetSummary: input.selectedCandidate,
    metadataOnly: true,
    automaticActionExecuted: false,
    evidence: [
      ...decision.evidence,
      "browser-selector-repair-apply-executor:applied-metadata-only",
      "browser-selector-repair-apply-executor:no-automatic-action",
    ],
  };
}
