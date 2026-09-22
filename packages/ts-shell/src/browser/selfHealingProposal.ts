import type { BrowserReplayFailureClassification } from "./replayFailureClassifier.js";
import type { BrowserReplayPlan } from "./replayPlanner.js";
import type { BrowserReplayRepairReadiness } from "./replayRepairReadiness.js";
import type { BrowserSelfHealingPatch } from "./selfHealingPatch.js";

export type BrowserSelfHealingProposalId = string;

export type BrowserSelfHealingProposalStatus =
  | "proposed"
  | "blocked"
  | "not-applicable"
  | "unsafe";

export type BrowserSelfHealingProposalKind =
  | "add-runner-binding"
  | "add-skill-metadata"
  | "request-confirmation"
  | "repair-cache"
  | "update-allowlist"
  | "refresh-fixture"
  | "retry-local-runner"
  | "reject-unsafe-evidence"
  | "external-network-blocked";

export type BrowserSelfHealingConfidence = "high" | "medium" | "low" | "blocked";

export interface BrowserSelfHealingProposal {
  readonly proposalId: BrowserSelfHealingProposalId;
  readonly status: BrowserSelfHealingProposalStatus;
  readonly kind: BrowserSelfHealingProposalKind;
  readonly confidence: BrowserSelfHealingConfidence;
  readonly failureKind: BrowserReplayFailureClassification["kind"];
  readonly repairReadiness: BrowserReplayRepairReadiness["status"];
  readonly requiredUserAction: string;
  readonly proposedPatch?: BrowserSelfHealingPatch;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly nextAction: string;
  readonly applied: "no";
  readonly executed: "no";
  readonly automaticReplay: "no";
  readonly evidence: readonly string[];
}

export function deterministicBrowserSelfHealingProposalId(input: {
  readonly plan: BrowserReplayPlan;
  readonly failure: BrowserReplayFailureClassification;
}): BrowserSelfHealingProposalId {
  const source = `${input.plan.replayPlanId}:${input.failure.kind}`;
  return `browser-self-healing-proposal:${source.replace(/[^a-zA-Z0-9:_-]+/g, "-")}`;
}
