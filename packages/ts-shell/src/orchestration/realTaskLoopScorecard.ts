import { hashContent } from "./patchRecovery/recoveryAuthorityStore.js";

export type RealTaskLoopScore = "pass" | "warn" | "fail" | "skip";

export interface RealTaskLoopScorecard {
  readonly scorecardId: string;
  readonly lifecycleReadiness: RealTaskLoopScore;
  readonly analysisQuality: RealTaskLoopScore;
  readonly planQuality: RealTaskLoopScore;
  readonly providerCalled: boolean;
  readonly providerCall: RealTaskLoopScore;
  readonly outputValidation: RealTaskLoopScore;
  readonly anchorQuality: RealTaskLoopScore;
  readonly confirmation: RealTaskLoopScore;
  readonly applyResult: RealTaskLoopScore;
  readonly snapshotRecovery: RealTaskLoopScore;
  readonly verification: RealTaskLoopScore;
  readonly repairEligibility: RealTaskLoopScore;
  readonly defaultSafety: RealTaskLoopScore;
  readonly mutationScope: "none" | "controlled-temp-fixture" | "blocked";
  readonly failureClass: string;
  readonly evidence: readonly string[];
  readonly replaySafeSummary: string;
}

export function buildRealTaskLoopScorecard(input: {
  readonly taskLoopId: string;
  readonly lifecycleReady: boolean;
  readonly analysisAllowed: boolean;
  readonly planReady: boolean;
  readonly providerCalled: boolean;
  readonly providerExpected: boolean;
  readonly outputValidationStatus?: string;
  readonly anchorQuality?: string;
  readonly confirmationState: string;
  readonly applyStatus: "not-run" | "applied" | "stopped" | "failed";
  readonly snapshotRecoveryReady: boolean;
  readonly verificationStatus: "not-run" | "passed" | "failed";
  readonly repairEligible: boolean;
  readonly defaultNoProviderNoApply: boolean;
  readonly mutationScope: RealTaskLoopScorecard["mutationScope"];
  readonly failureClass?: string;
}): RealTaskLoopScorecard {
  const lifecycleReadiness = input.lifecycleReady ? "pass" : "fail";
  const analysisQuality = input.analysisAllowed ? "pass" : "fail";
  const planQuality = input.planReady ? "pass" : "fail";
  const providerCall = input.providerExpected
    ? input.providerCalled ? "pass" : "fail"
    : input.providerCalled ? "fail" : "pass";
  const outputValidation = scoreOutputValidation(input.outputValidationStatus);
  const anchorQuality = scoreAnchorQuality(input.anchorQuality);
  const confirmation =
    input.confirmationState === "confirmed"
      ? "pass"
      : input.confirmationState === "required"
        ? "warn"
        : "skip";
  const applyResult =
    input.applyStatus === "applied" ? "pass" :
      input.applyStatus === "not-run" ? "skip" :
        input.applyStatus === "stopped" ? "warn" : "fail";
  const snapshotRecovery =
    input.applyStatus === "not-run" ? "skip" : input.snapshotRecoveryReady ? "pass" : "fail";
  const verification =
    input.verificationStatus === "passed" ? "pass" :
      input.verificationStatus === "not-run" ? "skip" : "fail";
  const repairEligibility =
    input.repairEligible ? "warn" : input.verificationStatus === "failed" ? "fail" : "skip";
  const defaultSafety = input.defaultNoProviderNoApply ? "pass" : "fail";
  const failureClass = input.failureClass ?? inferFailureClass({ ...input, providerCall, verification });
  const scorecardId = `real_task_loop_scorecard_${hashContent(JSON.stringify({
    taskLoopId: input.taskLoopId,
    providerCall,
    outputValidation,
    anchorQuality,
    applyResult,
    verification,
    failureClass,
  })).slice(0, 12)}`;
  const replaySafeSummary = [
    `real-task-loop-scorecard ${scorecardId}`,
    `providerCalled=${input.providerCalled}`,
    `output=${outputValidation}`,
    `anchor=${anchorQuality}`,
    `confirmation=${confirmation}`,
    `apply=${applyResult}`,
    `verification=${verification}`,
    `mutationScope=${input.mutationScope}`,
    `failureClass=${failureClass}`,
    "raw-content-excluded",
  ].join("; ");
  return {
    scorecardId,
    lifecycleReadiness,
    analysisQuality,
    planQuality,
    providerCalled: input.providerCalled,
    providerCall,
    outputValidation,
    anchorQuality,
    confirmation,
    applyResult,
    snapshotRecovery,
    verification,
    repairEligibility,
    defaultSafety,
    mutationScope: input.mutationScope,
    failureClass,
    replaySafeSummary,
    evidence: [
      `real-task-loop-scorecard:id:${scorecardId}`,
      `real-task-loop-scorecard:lifecycle:${lifecycleReadiness}`,
      `real-task-loop-scorecard:analysis:${analysisQuality}`,
      `real-task-loop-scorecard:plan:${planQuality}`,
      `real-task-loop-scorecard:provider-called:${input.providerCalled}`,
      `real-task-loop-scorecard:provider-call:${providerCall}`,
      `real-task-loop-scorecard:output-validation:${outputValidation}`,
      `real-task-loop-scorecard:anchor-quality:${anchorQuality}`,
      `real-task-loop-scorecard:confirmation:${confirmation}`,
      `real-task-loop-scorecard:apply:${applyResult}`,
      `real-task-loop-scorecard:snapshot-recovery:${snapshotRecovery}`,
      `real-task-loop-scorecard:verification:${verification}`,
      `real-task-loop-scorecard:repair:${repairEligibility}`,
      `real-task-loop-scorecard:default-safety:${defaultSafety}`,
      `real-task-loop-scorecard:mutation-scope:${input.mutationScope}`,
      `real-task-loop-scorecard:failure-class:${failureClass}`,
      "real-task-loop-scorecard:no-broad-mutation",
      "real-task-loop-scorecard:raw-content-excluded",
    ],
  };
}

function scoreOutputValidation(status: string | undefined): RealTaskLoopScore {
  if (!status || status === "none") return "skip";
  if (status === "valid-exact-single-target" || status === "valid-exact-hunk-set") return "pass";
  if (status === "partial-anchor") return "warn";
  return "fail";
}

function scoreAnchorQuality(level: string | undefined): RealTaskLoopScore {
  if (!level || level === "none") return "skip";
  if (level === "exact-ready") return "pass";
  if (level === "review-only" || level === "needs-anchoring") return "warn";
  return "fail";
}

function inferFailureClass(input: {
  readonly applyStatus: string;
  readonly verificationStatus: string;
  readonly providerCall: RealTaskLoopScore;
  readonly verification: RealTaskLoopScore;
}): string {
  if (input.providerCall === "fail") return "provider-boundary";
  if (input.applyStatus === "failed") return "apply-failure";
  if (input.verification === "fail") return "verification-failure";
  return "none";
}
