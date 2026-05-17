import { classifyBrowserReplayFailure } from "./browserReplayFailureClassifier.js";
import type { BrowserReplayPlan } from "./browserReplayPlanner.js";
import { createBrowserReplayRepairPreview } from "./browserReplayRepairPreview.js";
import { decideBrowserReplayRepairReadiness } from "./browserReplayRepairReadiness.js";
import {
  deterministicBrowserSelfHealingProposalId,
  type BrowserSelfHealingConfidence,
  type BrowserSelfHealingProposal,
  type BrowserSelfHealingProposalKind,
  type BrowserSelfHealingProposalStatus,
} from "./browserSelfHealingProposal.js";
import {
  createBrowserSelfHealingPatch,
  type BrowserSelfHealingPatchKind,
} from "./browserSelfHealingPatch.js";

export function planBrowserSelfHealingProposal(input: {
  readonly plan: BrowserReplayPlan;
}): BrowserSelfHealingProposal {
  const failure = classifyBrowserReplayFailure({ plan: input.plan });
  const readiness = decideBrowserReplayRepairReadiness({ failure });
  const preview = createBrowserReplayRepairPreview({
    plan: input.plan,
    failure,
    readiness,
  });
  const proposalId = deterministicBrowserSelfHealingProposalId({ plan: input.plan, failure });
  if (failure.kind === "none" && input.plan.willExecute) {
    return proposal({
      proposalId,
      status: "not-applicable",
      kind: "retry-local-runner",
      confidence: "blocked",
      plan: input.plan,
      failureKind: failure.kind,
      repairReadiness: readiness.status,
      requiredUserAction: "No self-healing proposal is needed for a successful replay.",
      blockers: [],
      warnings: [],
      nextAction: "No action needed.",
      evidence: ["browser-self-healing-planner:not-applicable"],
    });
  }
  const mapped = mapFailureToProposal(failure.kind);
  const blockers = [
    ...input.plan.blockers,
    ...(!readiness.repairable ? ["self-healing-proposal:not-repairable"] : []),
  ];
  const patch = createBrowserSelfHealingPatch({
    proposalId,
    kind: mapped.patchKind,
    target: patchTarget(mapped.kind, input.plan),
    summary: patchSummary(mapped.kind, input.plan, preview.requiredCondition),
    blockers: mapped.status === "proposed" ? [] : blockers,
  });
  return proposal({
    proposalId,
    status: patch.status === "blocked" && mapped.status === "proposed" ? "blocked" : mapped.status,
    kind: mapped.kind,
    confidence: mapped.confidence,
    plan: input.plan,
    failureKind: failure.kind,
    repairReadiness: readiness.status,
    requiredUserAction: preview.requiredUserAction,
    proposedPatch: patch,
    blockers: mapped.status === "proposed" ? patch.blockers : blockers,
    warnings: input.plan.warnings,
    nextAction: mapped.nextAction ?? preview.nextAction,
    evidence: [
      ...failure.evidence,
      ...readiness.evidence,
      ...preview.evidence,
      ...patch.evidence,
      `browser-self-healing-planner:${mapped.kind}`,
      "browser-self-healing-planner:proposal-only",
    ],
  });
}

function proposal(input: {
  readonly proposalId: string;
  readonly status: BrowserSelfHealingProposalStatus;
  readonly kind: BrowserSelfHealingProposalKind;
  readonly confidence: BrowserSelfHealingConfidence;
  readonly plan: BrowserReplayPlan;
  readonly failureKind: BrowserSelfHealingProposal["failureKind"];
  readonly repairReadiness: BrowserSelfHealingProposal["repairReadiness"];
  readonly requiredUserAction: string;
  readonly proposedPatch?: BrowserSelfHealingProposal["proposedPatch"];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): BrowserSelfHealingProposal {
  return {
    proposalId: input.proposalId,
    status: input.status,
    kind: input.kind,
    confidence: input.confidence,
    failureKind: input.failureKind,
    repairReadiness: input.repairReadiness,
    requiredUserAction: input.requiredUserAction,
    proposedPatch: input.proposedPatch,
    blockers: input.blockers,
    warnings: input.warnings,
    nextAction: input.nextAction,
    applied: "no",
    executed: "no",
    automaticReplay: "no",
    evidence: input.evidence,
  };
}

function mapFailureToProposal(failureKind: BrowserSelfHealingProposal["failureKind"]): {
  readonly kind: BrowserSelfHealingProposalKind;
  readonly patchKind: BrowserSelfHealingPatchKind;
  readonly status: BrowserSelfHealingProposalStatus;
  readonly confidence: BrowserSelfHealingConfidence;
  readonly nextAction?: string;
} {
  if (failureKind === "missing-runner-binding") {
    return { kind: "add-runner-binding", patchKind: "runner-binding-patch", status: "proposed", confidence: "high" };
  }
  if (failureKind === "missing-skill-metadata") {
    return { kind: "add-skill-metadata", patchKind: "skill-metadata-patch", status: "proposed", confidence: "high" };
  }
  if (failureKind === "sandbox-or-confirmation-missing") {
    return { kind: "request-confirmation", patchKind: "confirmation-patch", status: "proposed", confidence: "high" };
  }
  if (failureKind === "corrupted-cache-record" || failureKind === "missing-cache-entry") {
    return { kind: "repair-cache", patchKind: "cache-repair-patch", status: "proposed", confidence: "medium" };
  }
  if (failureKind === "allowlist-blocked") {
    return { kind: "update-allowlist", patchKind: "allowlist-patch", status: "proposed", confidence: "low" };
  }
  if (failureKind === "timeout" || failureKind === "malformed-response") {
    return { kind: "retry-local-runner", patchKind: "runner-binding-patch", status: "proposed", confidence: "medium" };
  }
  if (failureKind === "stale-fixture") {
    return { kind: "refresh-fixture", patchKind: "fixture-refresh-patch", status: "proposed", confidence: "medium" };
  }
  if (failureKind === "unsafe-evidence") {
    return {
      kind: "reject-unsafe-evidence",
      patchKind: "no-op-blocked-patch",
      status: "unsafe",
      confidence: "blocked",
      nextAction: "Discard the unsafe record and create a new sanitized local/test action.",
    };
  }
  if (failureKind === "external-url-blocked") {
    return {
      kind: "external-network-blocked",
      patchKind: "no-op-blocked-patch",
      status: "blocked",
      confidence: "blocked",
      nextAction: "Keep replay local/test scoped; external network repair requires a separate design.",
    };
  }
  return {
    kind: "retry-local-runner",
    patchKind: "no-op-blocked-patch",
    status: "blocked",
    confidence: "blocked",
  };
}

function patchTarget(kind: BrowserSelfHealingProposalKind, plan: BrowserReplayPlan): string {
  if (kind === "repair-cache") {
    return plan.cacheEntryId;
  }
  if (kind === "refresh-fixture") {
    return plan.fixtureOrTarget;
  }
  if (kind === "add-runner-binding" || kind === "retry-local-runner") {
    return plan.runnerMode;
  }
  return plan.sourceReceiptId;
}

function patchSummary(
  kind: BrowserSelfHealingProposalKind,
  plan: BrowserReplayPlan,
  requiredCondition: string,
): string {
  if (kind === "add-runner-binding") {
    return `Proposal to bind the current explicit local/test runner for ${plan.runnerMode}.`;
  }
  if (kind === "add-skill-metadata") {
    return "Proposal to add sanitized skill metadata and binding reference before replay.";
  }
  if (kind === "request-confirmation") {
    return `Proposal to record current replay gates: ${requiredCondition}.`;
  }
  if (kind === "repair-cache") {
    return "Proposal to repair or replace sanitized cache metadata after explicit review.";
  }
  if (kind === "update-allowlist") {
    return "Proposal to update local/test allowlist metadata only after explicit user review.";
  }
  if (kind === "refresh-fixture") {
    return "Proposal to refresh the local/test fixture and retry explicitly.";
  }
  if (kind === "retry-local-runner") {
    return "Proposal to retry the local/test runner with the same sanitized action metadata.";
  }
  return "No mutation proposal is safe for this failure.";
}
