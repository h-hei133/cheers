import type { AnchoredProposalRuntimeResult } from "./anchoredProposalRuntime.js";
import type { EditProposalApplyResult } from "./editProposalApply.js";
import type { RealTaskLoopFixture } from "./realTaskLoopFixture.js";
import type { RealTaskLoopPlan } from "./realTaskLoopPlan.js";
import type { RealTaskLoopScorecard } from "./realTaskLoopScorecard.js";

export type RealTaskLoopResultStatus =
  | "skipped-no-provider-opt-in"
  | "provider-unavailable"
  | "proposal-created-no-write"
  | "anchoring-exact-ready"
  | "review-required"
  | "confirmation-required"
  | "apply-succeeded"
  | "apply-stopped"
  | "verification-succeeded"
  | "verification-failed"
  | "repair-eligible"
  | "task-loop-complete"
  | "task-loop-stopped";

export interface RealTaskLoopResult {
  readonly status: RealTaskLoopResultStatus;
  readonly taskLoopId: string;
  readonly fixtureId: string;
  readonly providerCalled: boolean;
  readonly anchorQuality: string;
  readonly confirmationStatus: "not-requested" | "required" | "confirmed" | "invalid";
  readonly applyStatus: "not-run" | "applied" | "stopped" | "failed";
  readonly verificationStatus: "not-run" | "passed" | "failed";
  readonly recoveryStatus: "not-run" | "ready" | "blocked";
  readonly repairEligibility: "not-needed" | "eligible";
  readonly scorecardStatus: "pass" | "warn" | "fail" | "skip";
  readonly changedFiles: readonly string[];
  readonly mutationScope: "none" | "controlled-temp-fixture";
  readonly output: string;
  readonly sessionEvidence: readonly string[];
  readonly evidence: readonly string[];
}

export function buildRealTaskLoopResult(input: {
  readonly fixture: RealTaskLoopFixture;
  readonly plan: RealTaskLoopPlan;
  readonly runtime?: AnchoredProposalRuntimeResult;
  readonly applyResult?: EditProposalApplyResult;
  readonly readback?: { readonly status: "passed" | "failed"; readonly summary: string; readonly evidence: readonly string[] };
  readonly scorecard: RealTaskLoopScorecard;
  readonly liveOptIn: boolean;
  readonly confirmApply: boolean;
}): RealTaskLoopResult {
  const providerCalled = input.runtime?.dryRun?.providerCalled ?? false;
  const anchorQuality = input.runtime?.dryRun?.anchorQuality?.level ?? "none";
  const applyStatus = classifyApplyStatus(input.applyResult);
  const verificationStatus = input.readback?.status ?? "not-run";
  const changedFiles = input.applyResult?.changedFiles ?? [];
  const recoveryStatus = classifyRecoveryStatus(input.applyResult);
  const repairEligibility = verificationStatus === "failed" ? "eligible" : "not-needed";
  const status = classifyResultStatus({
    liveOptIn: input.liveOptIn,
    runtime: input.runtime,
    confirmApply: input.confirmApply,
    applyStatus,
    verificationStatus,
  });
  const mutationScope = changedFiles.length > 0 ? "controlled-temp-fixture" : "none";
  const sessionEvidence = [
    `real-task-loop-session:task-loop:${input.plan.taskLoopId}`,
    `real-task-loop-session:fixture:${input.fixture.fixtureId}`,
    `real-task-loop-session:provider-called:${providerCalled}`,
    ...(input.runtime?.dryRun && "manifest" in input.runtime.dryRun
      ? [`real-task-loop-session:proposal:${input.runtime.dryRun.manifest.proposalId}`]
      : []),
    ...(input.runtime?.anchoredProposal ? [`real-task-loop-session:anchored-proposal:${input.runtime.anchoredProposal.anchoredProposalId}`] : []),
    `real-task-loop-session:confirmation:${input.plan.confirmationState}`,
    `real-task-loop-session:apply:${applyStatus}`,
    `real-task-loop-session:verification:${verificationStatus}`,
    `real-task-loop-session:recovery:${recoveryStatus}`,
    `real-task-loop-session:repair:${repairEligibility}`,
    `real-task-loop-session:scorecard:${input.scorecard.scorecardId}`,
    "real-task-loop-session:raw-content-excluded",
  ];
  const output = [
    "real provider task loop MVP evaluated.",
    `Task loop: ${input.plan.taskLoopId}`,
    `Fixture: ${input.fixture.fixtureId}`,
    `Provider called: ${providerCalled ? "yes" : "no"}`,
    `Anchor quality: ${anchorQuality}`,
    `Confirmation: ${input.plan.confirmationState}`,
    `Apply: ${applyStatus}`,
    `Verification: ${verificationStatus}`,
    `Recovery: ${recoveryStatus}`,
    `Repair eligibility: ${repairEligibility}`,
    `Scorecard: ${input.scorecard.scorecardId}`,
    `Mutation scope: ${mutationScope}`,
    `Status: ${status}`,
    input.readback ? `Readback: ${input.readback.summary}` : undefined,
    "No broad mutation: yes",
    "Raw provider output: excluded",
  ].filter(Boolean).join("\n");
  return {
    status,
    taskLoopId: input.plan.taskLoopId,
    fixtureId: input.fixture.fixtureId,
    providerCalled,
    anchorQuality,
    confirmationStatus: input.plan.confirmationState,
    applyStatus,
    verificationStatus,
    recoveryStatus,
    repairEligibility,
    scorecardStatus: input.scorecard.verification === "fail" || input.scorecard.providerCall === "fail"
      ? "fail"
      : input.scorecard.applyResult === "warn" || input.scorecard.confirmation === "warn"
        ? "warn"
        : "pass",
    changedFiles,
    mutationScope,
    output,
    sessionEvidence,
    evidence: [
      ...input.fixture.evidence,
      ...input.plan.evidence,
      ...(input.runtime?.evidence ?? []),
      ...(input.applyResult?.evidence ?? []),
      ...(input.readback?.evidence ?? []),
      ...input.scorecard.evidence,
      ...sessionEvidence,
      `real-task-loop-result:status:${status}`,
      `real-task-loop-result:provider-called:${providerCalled}`,
      `real-task-loop-result:apply:${applyStatus}`,
      `real-task-loop-result:verification:${verificationStatus}`,
      `real-task-loop-result:mutation-scope:${mutationScope}`,
      "real-task-loop-result:no-direct-provider-mutation",
      "real-task-loop-result:no-provider-call-during-apply",
      "real-task-loop-result:no-fuzzy-or-broad-apply",
      "real-task-loop-result:no-new-writer",
      "real-task-loop-result:raw-content-excluded",
    ],
  };
}

function classifyApplyStatus(
  applyResult: EditProposalApplyResult | undefined,
): RealTaskLoopResult["applyStatus"] {
  if (!applyResult) return "not-run";
  if (
    applyResult.status === "single-target-applied" ||
    applyResult.status === "target-set-applied" ||
    applyResult.status === "hunk-set-applied"
  ) {
    return "applied";
  }
  if (applyResult.status.includes("failed") || applyResult.status.includes("partial-failure")) {
    return "failed";
  }
  return "stopped";
}

function classifyRecoveryStatus(applyResult: EditProposalApplyResult | undefined): RealTaskLoopResult["recoveryStatus"] {
  if (!applyResult) return "not-run";
  return applyResult.evidence.some((entry) => /snapshot|recovery|rollback-ready/.test(entry)) ? "ready" : "blocked";
}

function classifyResultStatus(input: {
  readonly liveOptIn: boolean;
  readonly runtime?: AnchoredProposalRuntimeResult;
  readonly confirmApply: boolean;
  readonly applyStatus: RealTaskLoopResult["applyStatus"];
  readonly verificationStatus: RealTaskLoopResult["verificationStatus"];
}): RealTaskLoopResultStatus {
  if (!input.runtime) return input.liveOptIn ? "provider-unavailable" : "skipped-no-provider-opt-in";
  if (input.runtime.status === "runtime-stopped-no-write") return "task-loop-stopped";
  if (input.verificationStatus === "passed") return "task-loop-complete";
  if (input.verificationStatus === "failed") return "repair-eligible";
  if (input.applyStatus === "applied") return "apply-succeeded";
  if (input.applyStatus === "stopped" || input.applyStatus === "failed") return "apply-stopped";
  if (input.runtime.anchoredProposal?.handoffReadiness === "exact-single-target" ||
      input.runtime.anchoredProposal?.handoffReadiness === "exact-hunk-set") {
    return input.confirmApply ? "anchoring-exact-ready" : "confirmation-required";
  }
  return input.runtime.dryRun ? "review-required" : "proposal-created-no-write";
}
