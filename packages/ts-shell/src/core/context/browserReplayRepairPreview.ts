import type { BrowserReplayPlan } from "./browserReplayPlanner.js";
import type { BrowserReplayFailureClassification } from "./browserReplayFailureClassifier.js";
import type { BrowserReplayRepairReadiness } from "./browserReplayRepairReadiness.js";

export interface BrowserReplayRepairPreview {
  readonly sourceReceiptId: string;
  readonly cacheEntryId: string;
  readonly failureKind: string;
  readonly repairReadiness: BrowserReplayRepairReadiness["status"];
  readonly proposedSafeRepairStep: string;
  readonly requiredUserAction: string;
  readonly requiredCondition: string;
  readonly expectedEvidenceAfterRepair: readonly string[];
  readonly executed: "no";
  readonly repairApplied: "no";
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function createBrowserReplayRepairPreview(input: {
  readonly plan: BrowserReplayPlan;
  readonly failure: BrowserReplayFailureClassification;
  readonly readiness: BrowserReplayRepairReadiness;
}): BrowserReplayRepairPreview {
  return {
    sourceReceiptId: input.plan.sourceReceiptId,
    cacheEntryId: input.plan.cacheEntryId,
    failureKind: input.failure.kind,
    repairReadiness: input.readiness.status,
    proposedSafeRepairStep: proposedStep(input.readiness),
    requiredUserAction: input.readiness.nextAction,
    requiredCondition: input.readiness.requiredGate,
    expectedEvidenceAfterRepair: [
      "sanitized receipt/cache entry",
      "current runner gate",
      "current sandbox/allowlist/confirmation gate",
      "explicit replay command",
    ],
    executed: "no",
    repairApplied: "no",
    nextAction: input.readiness.nextAction,
    evidence: [
      ...input.failure.evidence,
      ...input.readiness.evidence,
      "browser-replay-repair-preview:created",
      "browser-replay-repair-preview:no-execution",
    ],
  };
}

function proposedStep(readiness: BrowserReplayRepairReadiness): string {
  if (!readiness.repairable) {
    return "No safe repair preview is available for this failure.";
  }
  if (readiness.status === "repair-needs-cache-repair") {
    return "Run explicit cache repair and inspect status before retrying replay.";
  }
  if (readiness.status === "repair-needs-runner") {
    return "Provide the same explicit local/test runner and retry replay manually.";
  }
  if (readiness.status === "repair-needs-metadata") {
    return "Provide explicit local/test skill metadata and binding before retrying.";
  }
  if (readiness.status === "repair-needs-confirmation") {
    return "Record current local/test sandbox, allowlist, and confirmation gates.";
  }
  return "Preview a new local/test action using the sanitized action metadata.";
}
