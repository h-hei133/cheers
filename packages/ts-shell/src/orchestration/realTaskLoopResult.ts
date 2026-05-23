import type { AnchoredProposalRuntimeResult } from "./anchoredProposalRuntime.js";
import type { EditProposalApplyResult } from "./editProposalApply.js";
import type { RealTaskLoopFixture } from "./realTaskLoopFixture.js";
import type { RealTaskLoopPlan } from "./realTaskLoopPlan.js";
import type { RealTaskLoopScorecard } from "./realTaskLoopScorecard.js";

interface SnapshotInspectableRoute {
  readonly snapshotReceipt?: { readonly status?: string };
  readonly recoveryReadiness?: string;
  readonly fileResults?: readonly SnapshotInspectableFileResult[];
}

interface SnapshotInspectableFileResult {
  readonly route?: SnapshotInspectableRoute;
  readonly exactRoute?: SnapshotInspectableRoute;
  readonly recoveryReadiness?: string;
}

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
  readonly confirmationStatus: RealTaskLoopPlan["confirmationState"];
  readonly applyStatus: "not-run" | "succeeded" | "stopped" | "failed";
  readonly verificationStatus: "not-run" | "succeeded" | "failed";
  readonly snapshotStatus: "not-run" | "created" | "blocked";
  readonly recoveryStatus: "not-run" | "available" | "blocked";
  readonly repairEligibility: "not-needed" | "eligible";
  readonly scorecardStatus: "pass" | "warn" | "fail" | "skip";
  readonly changedFiles: readonly string[];
  readonly mutationScope: "none" | "controlled-temp-workspace";
  readonly providerCallDuringApply: boolean;
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
  readonly providerCallDuringApply?: boolean;
}): RealTaskLoopResult {
  const providerCalled = input.runtime?.dryRun?.providerCalled ?? false;
  const anchorQuality = input.runtime?.dryRun?.anchorQuality?.level ?? "none";
  const applyStatus = classifyRealTaskLoopApplyStatus(input.applyResult);
  const verificationStatus = classifyRealTaskLoopVerificationStatus(input.readback);
  const changedFiles = input.applyResult?.changedFiles ?? [];
  const snapshotStatus = classifyRealTaskLoopSnapshotStatus(input.applyResult);
  const recoveryStatus = classifyRealTaskLoopRecoveryStatus(input.applyResult);
  const repairEligibility = verificationStatus === "failed" ? "eligible" : "not-needed";
  const providerCallDuringApply = input.providerCallDuringApply ?? false;
  const status = classifyResultStatus({
    liveOptIn: input.liveOptIn,
    runtime: input.runtime,
    confirmApply: input.confirmApply,
    applyStatus,
    verificationStatus,
  });
  const mutationScope = classifyRealTaskLoopMutationScope(changedFiles);
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
    `real-task-loop-session:snapshot:${snapshotStatus}`,
    `real-task-loop-session:recovery:${recoveryStatus}`,
    `real-task-loop-session:mutation-scope:${mutationScope}`,
    `real-task-loop-session:provider-call-during-apply:${providerCallDuringApply}`,
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
    `Snapshot: ${snapshotStatus}`,
    `Recovery: ${recoveryStatus}`,
    `Provider call during apply: ${providerCallDuringApply ? "yes" : "no"}`,
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
    snapshotStatus,
    recoveryStatus,
    repairEligibility,
    scorecardStatus: input.scorecard.verification === "fail" ||
      input.scorecard.providerCall === "fail" ||
      input.scorecard.outputValidation === "fail" ||
      input.scorecard.anchorQuality === "fail" ||
      input.scorecard.snapshotRecovery === "fail" ||
      input.scorecard.providerCallDuringApply === "fail"
      ? "fail"
      : input.scorecard.applyResult === "warn" ||
          input.scorecard.confirmation === "warn" ||
          input.scorecard.anchorQuality === "warn"
        ? "warn"
        : "pass",
    changedFiles,
    mutationScope,
    providerCallDuringApply,
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
      `real-task-loop-result:anchor-quality:${anchorQuality}`,
      `real-task-loop-result:confirmation:${input.plan.confirmationState}`,
      `real-task-loop-result:apply:${applyStatus}`,
      `real-task-loop-result:verification:${verificationStatus}`,
      `real-task-loop-result:snapshot:${snapshotStatus}`,
      `real-task-loop-result:recovery:${recoveryStatus}`,
      `real-task-loop-result:mutation-scope:${mutationScope}`,
      `real-task-loop-result:provider-call-during-apply:${providerCallDuringApply}`,
      "real-task-loop-result:no-direct-provider-mutation",
      ...(providerCallDuringApply ? [] : ["real-task-loop-result:no-provider-call-during-apply"]),
      "real-task-loop-result:no-fuzzy-or-broad-apply",
      "real-task-loop-result:no-new-writer",
      "real-task-loop-result:raw-content-excluded",
    ],
  };
}

export function classifyRealTaskLoopApplyStatus(
  applyResult: EditProposalApplyResult | undefined,
): RealTaskLoopResult["applyStatus"] {
  if (!applyResult) return "not-run";
  if (
    applyResult.status === "single-target-applied" ||
    applyResult.status === "target-set-applied" ||
    applyResult.status === "hunk-set-applied"
  ) {
    return "succeeded";
  }
  if (applyResult.status.includes("failed") || applyResult.status.includes("partial-failure")) {
    return "failed";
  }
  return "stopped";
}

export function classifyRealTaskLoopVerificationStatus(
  readback:
    | { readonly status: "passed" | "failed"; readonly summary: string; readonly evidence: readonly string[] }
    | undefined,
): RealTaskLoopResult["verificationStatus"] {
  if (!readback) return "not-run";
  return readback.status === "passed" ? "succeeded" : "failed";
}

export function classifyRealTaskLoopSnapshotStatus(
  applyResult: EditProposalApplyResult | undefined,
): RealTaskLoopResult["snapshotStatus"] {
  if (!applyResult) return "not-run";
  return applyResultHasSnapshotCreated(applyResult) ? "created" : "blocked";
}

export function classifyRealTaskLoopRecoveryStatus(
  applyResult: EditProposalApplyResult | undefined,
): RealTaskLoopResult["recoveryStatus"] {
  if (!applyResult) return "not-run";
  return applyResultHasRollbackReady(applyResult) || applyResultHasSnapshotCreated(applyResult)
    ? "available"
    : "blocked";
}

export function classifyRealTaskLoopMutationScope(
  changedFiles: readonly string[],
): RealTaskLoopResult["mutationScope"] {
  return changedFiles.length > 0 ? "controlled-temp-workspace" : "none";
}

function applyResultHasSnapshotCreated(applyResult: EditProposalApplyResult): boolean {
  if (!("route" in applyResult)) return false;
  return routeHasSnapshotCreated(applyResult.route);
}

function applyResultHasRollbackReady(applyResult: EditProposalApplyResult): boolean {
  if (!("route" in applyResult)) return false;
  return routeHasRollbackReady(applyResult.route);
}

function routeHasSnapshotCreated(route: SnapshotInspectableRoute): boolean {
  if (route.snapshotReceipt?.status === "snapshot-created") {
    return true;
  }
  if (route.fileResults) {
    return route.fileResults.some((fileResult) =>
      (fileResult.route ? routeHasSnapshotCreated(fileResult.route) : false) ||
      (fileResult.exactRoute ? routeHasSnapshotCreated(fileResult.exactRoute) : false)
    );
  }
  return false;
}

function routeHasRollbackReady(route: SnapshotInspectableRoute): boolean {
  if (route.recoveryReadiness === "rollback-ready") {
    return true;
  }
  if (route.fileResults) {
    return route.fileResults.some((fileResult) =>
      fileResult.recoveryReadiness === "rollback-ready" ||
      (fileResult.route ? routeHasRollbackReady(fileResult.route) : false) ||
      (fileResult.exactRoute ? routeHasRollbackReady(fileResult.exactRoute) : false)
    );
  }
  return false;
}

function classifyResultStatus(input: {
  readonly liveOptIn: boolean;
  readonly runtime?: AnchoredProposalRuntimeResult;
  readonly confirmApply: boolean;
  readonly applyStatus: RealTaskLoopResult["applyStatus"];
  readonly verificationStatus: RealTaskLoopResult["verificationStatus"];
}): RealTaskLoopResultStatus {
  if (!input.runtime) return input.liveOptIn ? "provider-unavailable" : "skipped-no-provider-opt-in";
  if (input.runtime.status === "runtime-stopped-no-write") {
    return input.liveOptIn ? "provider-unavailable" : "task-loop-stopped";
  }
  if (input.verificationStatus === "succeeded") return "task-loop-complete";
  if (input.verificationStatus === "failed") return "repair-eligible";
  if (input.applyStatus === "succeeded") return "apply-succeeded";
  if (input.applyStatus === "stopped" || input.applyStatus === "failed") return "apply-stopped";
  if (input.runtime.anchoredProposal?.handoffReadiness === "exact-single-target" ||
      input.runtime.anchoredProposal?.handoffReadiness === "exact-hunk-set") {
    return input.confirmApply ? "anchoring-exact-ready" : "confirmation-required";
  }
  return input.runtime.dryRun ? "review-required" : "proposal-created-no-write";
}
