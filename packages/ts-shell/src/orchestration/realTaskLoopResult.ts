import type { AnchoredProposalRuntimeResult } from "./anchoredProposalRuntime.js";
import type { EditProposalApplyResult } from "./editProposalApply.js";
import type { RealTaskLoopFixture } from "./realTaskLoopFixture.js";
import type { RealTaskLoopPlan } from "./realTaskLoopPlan.js";
import type { RealTaskLoopScorecard } from "./realTaskLoopScorecard.js";
import {
  buildClaimLedgerProjection,
  type ClaimLedgerEvidenceSource,
  type ClaimLedgerProjection,
} from "./claimLedgerProjection.js";
import type { RealTaskLoopRepairProof } from "./realTaskLoopRepairChain.js";

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
  | "verification-succeeded-with-repair"
  | "verification-failed"
  | "repair-eligible"
  | "repair-proposed"
  | "repair-confirmation-required"
  | "repair-applied"
  | "task-loop-complete-with-repair"
  | "task-loop-complete"
  | "task-loop-stopped";

export interface RealTaskLoopResult {
  readonly status: RealTaskLoopResultStatus;
  readonly taskLoopId: string;
  readonly fixtureId: string;
  readonly providerCalled: boolean;
  readonly outputValidationStatus: string;
  readonly anchorQuality: string;
  readonly confirmationStatus: RealTaskLoopPlan["confirmationState"];
  readonly applyStatus: "not-run" | "succeeded" | "stopped" | "failed";
  readonly verificationStatus: "not-run" | "succeeded" | "failed";
  readonly snapshotStatus: "not-run" | "created" | "blocked";
  readonly recoveryStatus: "not-run" | "available" | "blocked";
  readonly repairEligibility: "not-needed" | "eligible";
  readonly repairProof?: RealTaskLoopRepairProof;
  readonly scorecardStatus: "pass" | "warn" | "fail" | "skip";
  readonly claimLedger: ClaimLedgerProjection;
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
  readonly evidenceSource?: ClaimLedgerEvidenceSource;
  readonly providerCallDuringApply?: boolean;
  readonly repairProof?: RealTaskLoopRepairProof;
}): RealTaskLoopResult {
  const providerCalled = input.runtime?.dryRun?.providerCalled ?? false;
  const outputValidationStatus = input.runtime?.dryRun?.outputValidation?.status ?? "none";
  const anchorQuality = input.runtime?.dryRun?.anchorQuality?.level ?? "none";
  const applyStatus = classifyRealTaskLoopApplyStatus(input.applyResult);
  const verificationStatus = classifyRealTaskLoopVerificationStatus(input.readback);
  const changedFiles = input.applyResult?.changedFiles ?? [];
  const snapshotStatus = classifyRealTaskLoopSnapshotStatus(input.applyResult);
  const recoveryStatus = classifyRealTaskLoopRecoveryStatus(input.applyResult);
  const repairEligibility = verificationStatus === "failed" ? "eligible" : "not-needed";
  const providerCallDuringApply = input.providerCallDuringApply ?? false;
  const mutationScope = classifyRealTaskLoopMutationScope(changedFiles);
  const scorecardStatus = classifyRealTaskLoopScorecardStatus(input.scorecard);
  const claimLedger = buildClaimLedgerProjection({
    taskLoopId: input.plan.taskLoopId,
    fixtureId: input.fixture.fixtureId,
    evidenceSource: input.evidenceSource ?? defaultClaimLedgerEvidenceSource({
      providerKind: input.plan.providerKind,
      liveOptIn: input.liveOptIn,
    }),
    providerKind: input.plan.providerKind,
    liveOptIn: input.liveOptIn,
    providerCalled,
    providerErrorClass: input.runtime?.dryRun?.providerErrorClass,
    outputValidationStatus,
    anchorQuality,
    handoffReadiness: input.runtime?.anchoredProposal?.handoffReadiness,
    confirmationStatus: input.plan.confirmationState,
    applyStatus,
    verificationStatus,
    snapshotStatus,
    recoveryStatus,
    mutationScope,
    providerCallDuringApply,
    scorecardStatus,
    ...(input.repairProof
      ? {
          repair: {
            originalFailurePreserved: input.repairProof.originalFailurePreserved,
            originalFailureRuntimeDerived: input.repairProof.originalFailureRuntimeDerived,
            proposalStatus: input.repairProof.proposalStatus,
            anchorStatus: input.repairProof.anchorStatus,
            confirmationStatus: input.repairProof.confirmationStatus,
            applyStatus: input.repairProof.applyStatus,
            verificationStatus: input.repairProof.verificationStatus,
            verificationRuntimeDerived: input.repairProof.verificationRuntimeDerived,
            verificationEvidenceCount: input.repairProof.verificationEvidenceCount,
            mutationScope: input.repairProof.mutationScope,
            providerCallDuringApply: input.repairProof.providerCallDuringApply,
            evidenceSource: input.repairProof.evidenceSource,
          },
        }
      : {}),
  });
  const status = claimLedger.terminal.resultStatus;
  const replaySafeSummary = [
    `real-task-loop-result taskLoop=${input.plan.taskLoopId}`,
    `providerCalled=${providerCalled}`,
    `outputValidation=${outputValidationStatus}`,
    `anchorQuality=${anchorQuality}`,
    `confirmation=${input.plan.confirmationState}`,
    `apply=${applyStatus}`,
    `verification=${verificationStatus}`,
    `snapshot=${snapshotStatus}`,
    `recovery=${recoveryStatus}`,
    `mutationScope=${mutationScope}`,
    `providerCallDuringApply=${providerCallDuringApply}`,
    `claimLedger=${claimLedger.ledgerId}`,
    `terminalClaim=${claimLedger.terminal.status}`,
    "raw-content-excluded",
  ].join("; ");
  const sessionEvidence = [
    claimLedger.replaySafeSummary,
    ...claimLedger.evidence.filter((entry) => entry.startsWith("claim-ledger:")),
    replaySafeSummary,
    `real-task-loop-session:task-loop:${input.plan.taskLoopId}`,
    `real-task-loop-session:fixture:${input.fixture.fixtureId}`,
    `real-task-loop-session:claim-ledger:${claimLedger.ledgerId}`,
    `real-task-loop-session:terminal-claim:${claimLedger.terminal.status}`,
    `real-task-loop-session:provider-called:${providerCalled}`,
    `real-task-loop-session:output-validation:${outputValidationStatus}`,
    ...(input.runtime?.dryRun && "manifest" in input.runtime.dryRun
      ? [`real-task-loop-session:proposal:${input.runtime.dryRun.manifest.proposalId}`]
      : []),
    ...(input.runtime?.anchoredProposal ? [`real-task-loop-session:anchored-proposal:${input.runtime.anchoredProposal.anchoredProposalId}`] : []),
    `real-task-loop-session:confirmation:${input.plan.confirmationState}`,
    `real-task-loop-session:apply:${applyStatus}`,
    `real-task-loop-session:verification:${verificationStatus}`,
    `real-task-loop-session:snapshot:${snapshotStatus}`,
    `real-task-loop-session:recovery:${recoveryStatus}`,
    ...(input.repairProof
      ? [
          "real-task-loop-session:original-verification:failed",
          `real-task-loop-session:repair-status:${input.repairProof.status}`,
          `real-task-loop-session:repair-source:${input.repairProof.evidenceSource}`,
          `real-task-loop-session:repair-proposal:${input.repairProof.proposalStatus}`,
          `real-task-loop-session:repair-confirmation:${input.repairProof.confirmationStatus}`,
          `real-task-loop-session:repair-apply:${input.repairProof.applyStatus}`,
          `real-task-loop-session:repair-verification:${input.repairProof.verificationStatus}`,
        ]
      : []),
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
    `Output validation: ${outputValidationStatus}`,
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
    `Claim ledger: ${claimLedger.ledgerId}`,
    `Claim source: ${claimLedger.evidenceSource}`,
    `Claim terminal: ${claimLedger.terminal.status}`,
    `Claim live success: ${claimLedger.terminal.liveSuccess ? "yes" : "no"}`,
    `Claim not proven: ${claimLedger.notProvenClaims.length === 0 ? "none" : claimLedger.notProvenClaims.map((claim) => claim.group).join(",")}`,
    input.repairProof ? `Repair proposal: ${input.repairProof.proposalStatus}` : undefined,
    input.repairProof ? `Repair source: ${input.repairProof.evidenceSource}` : undefined,
    input.repairProof ? `Repair confirmation: ${input.repairProof.confirmationStatus}` : undefined,
    input.repairProof ? `Repair apply: ${input.repairProof.applyStatus}` : undefined,
    input.repairProof ? `Repair verification: ${input.repairProof.verificationStatus}` : undefined,
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
    outputValidationStatus,
    anchorQuality,
    confirmationStatus: input.plan.confirmationState,
    applyStatus,
    verificationStatus,
    snapshotStatus,
    recoveryStatus,
    repairEligibility,
    ...(input.repairProof ? { repairProof: input.repairProof } : {}),
    scorecardStatus,
    claimLedger,
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
      ...(input.repairProof?.evidence ?? []),
      ...sessionEvidence,
      input.scorecard.replaySafeSummary,
      ...input.scorecard.evidence,
      ...claimLedger.evidence,
      `real-task-loop-result:status:${status}`,
      `real-task-loop-result:claim-ledger:${claimLedger.ledgerId}`,
      `real-task-loop-result:terminal-claim:${claimLedger.terminal.status}`,
      `real-task-loop-result:live-success:${claimLedger.terminal.liveSuccess}`,
      `real-task-loop-result:provider-called:${providerCalled}`,
      `real-task-loop-result:output-validation:${outputValidationStatus}`,
      `real-task-loop-result:anchor-quality:${anchorQuality}`,
      `real-task-loop-result:confirmation:${input.plan.confirmationState}`,
      `real-task-loop-result:apply:${applyStatus}`,
      `real-task-loop-result:verification:${verificationStatus}`,
      `real-task-loop-result:snapshot:${snapshotStatus}`,
      `real-task-loop-result:recovery:${recoveryStatus}`,
      ...(input.repairProof
        ? [
            "real-task-loop-result:original-verification:failed",
            `real-task-loop-result:repair-status:${input.repairProof.status}`,
            `real-task-loop-result:repair-source:${input.repairProof.evidenceSource}`,
            `real-task-loop-result:repair-proposal:${input.repairProof.proposalStatus}`,
            `real-task-loop-result:repair-anchor:${input.repairProof.anchorStatus}`,
            `real-task-loop-result:repair-confirmation:${input.repairProof.confirmationStatus}`,
            `real-task-loop-result:repair-apply:${input.repairProof.applyStatus}`,
            `real-task-loop-result:repair-verification:${input.repairProof.verificationStatus}`,
            `real-task-loop-result:repair-verification-runtime-derived:${input.repairProof.verificationRuntimeDerived}`,
            `real-task-loop-result:repair-mutation-scope:${input.repairProof.mutationScope}`,
            `real-task-loop-result:repair-provider-call-during-apply:${input.repairProof.providerCallDuringApply}`,
          ]
        : []),
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

function defaultClaimLedgerEvidenceSource(input: {
  readonly providerKind: RealTaskLoopPlan["providerKind"];
  readonly liveOptIn: boolean;
}): ClaimLedgerEvidenceSource {
  if (input.providerKind === "none" && !input.liveOptIn) return "default-safe";
  if (input.providerKind === "fake-provider") return "fake-provider";
  if (input.liveOptIn) return "live-provider";
  return "unknown";
}

function classifyRealTaskLoopScorecardStatus(
  scorecard: RealTaskLoopScorecard,
): RealTaskLoopResult["scorecardStatus"] {
  if (
    scorecard.verification === "fail" ||
    scorecard.providerCall === "fail" ||
    scorecard.outputValidation === "fail" ||
    scorecard.anchorQuality === "fail" ||
    scorecard.snapshotRecovery === "fail" ||
    scorecard.providerCallDuringApply === "fail" ||
    scorecard.repairProposal === "fail" ||
    scorecard.repairApply === "fail" ||
    scorecard.repairVerification === "fail"
  ) {
    return "fail";
  }
  if (
    scorecard.applyResult === "warn" ||
    scorecard.confirmation === "warn" ||
    scorecard.anchorQuality === "warn" ||
    scorecard.verification === "warn" ||
    scorecard.repairEligibility === "warn"
  ) {
    return "warn";
  }
  return "pass";
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
