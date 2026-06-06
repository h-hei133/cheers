import {
  correctArtifact,
  createArtifactReceipt,
  type ArtifactReceipt,
} from "../../../artifacts/workflow/model.js";
import {
  buildTaskProofInput,
  type TaskProofInput,
} from "../../../evidence/task/proof.js";
import type { AgentExecutionOutput, CodingResultSummary } from "../../../orchestration/types.js";
import {
  projectTaskVerdict,
  type TaskVerdict,
} from "../../../result/task/verdict.js";
import { verifyChangedFileCoverage } from "../../../verification/execution/model.js";
import type { QueryRuntimeActionDecision } from "./decision.js";
import { ensureQueryRuntimeObservationState, type QueryRuntimeState } from "./state.js";

export interface QueryRuntimeProofProjection {
  readonly proof: TaskProofInput;
  readonly verdict: TaskVerdict;
  readonly artifactReceipt?: ArtifactReceipt;
  readonly action: QueryRuntimeActionDecision["nextAction"];
  readonly observationState: {
    readonly contextPathCount: number;
    readonly changedFileCount: number;
    readonly verificationTargetCount: number;
    readonly failedVerificationCount: number;
    readonly repairAttemptCount: number;
    readonly artifactEvidenceCount: number;
    readonly commandCoverageCount: number;
    readonly toolFeedbackCount: number;
    readonly continuationFactCount: number;
    readonly pendingAction?: QueryRuntimeActionDecision["nextAction"];
  };
  readonly proofGap: readonly string[];
  readonly changedFiles: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function projectQueryRuntimeProof(input: {
  readonly state: QueryRuntimeState;
  readonly decision: QueryRuntimeActionDecision;
  readonly output: AgentExecutionOutput;
}): QueryRuntimeProofProjection {
  const result = input.output.codingResult;
  const observations = ensureQueryRuntimeObservationState(input.state);
  const artifactReceipt = createArtifactReceipt({
    taskKind: input.decision.taskKind,
    outputKind: input.decision.outputKind,
    requiredPaths: requiredArtifactPaths(input.decision, result),
    workspacePaths: uniqueStrings([
      ...input.decision.selectedPaths,
      ...observations.contextPaths,
      ...observations.changedFiles,
    ]),
    verificationState: artifactVerificationState(result),
    failureCategories: failureCategories(result),
    verificationEvidence: uniqueStrings([
      ...observations.artifactEvidence,
      ...(result?.evidence ?? []),
    ]),
    claimEvidence: claimEvidence(result, observations.artifactClaimEvidence),
  });
  const artifactCorrection = correctArtifact({
    receipt: artifactReceipt,
    actions: input.decision.actions,
  });
  const verificationState = result?.verification.status ?? "not-requested";
  const proof = buildTaskProofInput({
    caseId: `${input.state.config.sessionId}:turn-${input.state.turn}`,
    taskKind: input.decision.taskKind,
    outputKind: input.decision.outputKind,
    contextState: input.decision.contextState,
    contextRefreshed: input.decision.pendingAction === "continue" || input.decision.nextAction === "continue",
    selectedPathCount: input.decision.selectedPaths.length,
    planState: input.decision.planState,
    requestState: input.decision.requestState,
    toolStrategyState: input.decision.toolStrategyState,
    verificationState,
    verificationEvidenceInputEligible: verificationState === "passed",
    verificationResultInputEligible: verificationState === "passed" && (result?.evidence.length ?? 0) > 0,
    changedFileVerificationComplete: changedFileVerificationComplete(
      input.decision.changedFiles,
      input.decision.verificationTargets,
      result,
      observations.commandCoverage,
    ),
    repairAttempted: (result?.repair.attempts ?? 0) > 0,
    repairPostValidation: repairPostValidationState(result, observations.commandCoverage),
    originalFailurePreserved: Boolean(result && (
      result.failedFiles.length > 0 ||
      result.verification.status === "failed" ||
      observations.toolFailures.some((failure) => failure.action === "verify")
    )),
    artifactValidationState: artifactReceipt?.validationState,
    artifactSourceReceiptsAvailable: artifactReceipt?.sourceReceipts.some((receipt) => receipt.available),
    artifactSourceReceiptsComplete: artifactReceipt?.sourceReceipts.every((receipt) => receipt.available),
    artifactCorrectionAttempted: artifactCorrection?.attempted,
    artifactCorrectionValidationState: artifactCorrection?.validationState,
    stagedActionConsistent: stagedActionConsistent(input.decision, result),
    hostStatus: hostStatusFor(result),
  });
  const verdict = projectTaskVerdict({
    proof,
    notProvenClaims: [
      "runtime-action-is-not-task-success",
      "agent-output-is-not-task-success",
      ...input.decision.proofGap.map((gap) => `runtime-proof-gap:${gap}`),
    ],
  });

  return Object.freeze({
    proof,
    verdict,
    ...(artifactReceipt ? { artifactReceipt } : {}),
    action: input.decision.nextAction,
    observationState: {
      contextPathCount: observations.contextPaths.length,
      changedFileCount: observations.changedFiles.length,
      verificationTargetCount: observations.verificationTargets.length,
      failedVerificationCount: observations.failedVerificationTargets.length,
      repairAttemptCount: observations.repairAttempts.length,
      artifactEvidenceCount: observations.artifactEvidence.length,
      commandCoverageCount: observations.commandCoverage.length,
      toolFeedbackCount: observations.toolFeedback.length,
      continuationFactCount: observations.continuationFacts.length,
      ...(observations.pendingAction
        ? { pendingAction: observations.pendingAction }
        : {}),
    },
    proofGap: input.decision.proofGap,
    changedFiles: input.decision.changedFiles,
    terminalSuccessClaim: false as const,
  });
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function requiredArtifactPaths(
  decision: QueryRuntimeActionDecision,
  result: CodingResultSummary | undefined,
): readonly string[] {
  return result?.changedFiles.length ? result.changedFiles : decision.changedFiles;
}

function artifactVerificationState(result: CodingResultSummary | undefined): string {
  if (result?.verification.status === "passed") return "selected-passed";
  if (result?.verification.status === "failed") return "selected-failed";
  if (result?.verification.status === "not-requested") return "selected-not-run";
  return "not-selected";
}

function changedFileVerificationComplete(
  changedFiles: readonly string[],
  verificationTargets: readonly string[],
  result: CodingResultSummary | undefined,
  commandCoverage: readonly { readonly coveredFiles: readonly string[] }[] = [],
): boolean {
  const targets = uniqueStrings([
    ...changedFiles,
    ...verificationTargets,
    ...(result?.changedFiles ?? []),
    ...(result?.changeSet.changedFiles ?? []),
  ]);
  if (targets.length === 0) {
    return result?.verification.status === "passed";
  }
  if (commandCoverage.length > 0) {
    const coveredFiles = uniqueStrings(commandCoverage.flatMap((receipt) => receipt.coveredFiles));
    return verifyChangedFileCoverage({
      changedFiles: targets,
      verificationTargets,
      verifiedFiles: coveredFiles,
      unverifiedFiles: targets.filter((target) => !coveredFiles.includes(target)),
      verificationState: result?.verification.status ?? "not-requested",
    }).complete;
  }
  return verifyChangedFileCoverage({
    changedFiles: targets,
    verificationTargets,
    verifiedFiles: result?.verifiedFiles,
    unverifiedFiles: result?.unverifiedFiles.map((file) => file.path),
    verificationState: result?.verification.status ?? "not-requested",
  }).complete;
}

function failureCategories(result: CodingResultSummary | undefined): readonly string[] {
  if (!result) return [];
  return [
    ...(result.verification.status === "failed" ? ["artifact invalid"] : []),
    ...result.failedFiles.map((file) => file.reason),
    ...result.taskSatisfaction.reasons,
  ];
}

function claimEvidence(
  result: CodingResultSummary | undefined,
  observedClaimEvidence: readonly {
    readonly claim: string;
    readonly evidenceId?: string;
  }[],
): readonly {
  readonly claim: string;
  readonly evidenceId?: string;
}[] {
  const claimEvidence = [
    ...observedClaimEvidence,
    ...(result?.taskSatisfaction.requiredEvidence ?? []).map((claim, index) => {
      const evidenceId = result?.taskSatisfaction.observedEvidence[index];
      return {
        claim,
        ...(evidenceId ? { evidenceId } : {}),
      };
    }),
  ];
  const receipts = new Map<string, { claim: string; evidenceId?: string }>();
  for (const item of claimEvidence) {
    const claim = item.claim.replace(/\s+/g, " ").trim();
    const evidenceId = item.evidenceId?.replace(/\s+/g, " ").trim();
    if (!claim) {
      continue;
    }
    const existing = receipts.get(claim);
    if (!existing || (!existing.evidenceId && evidenceId)) {
      receipts.set(claim, {
        claim,
        ...(evidenceId ? { evidenceId } : {}),
      });
    }
  }
  return [...receipts.values()].map((item) => ({
    claim: item.claim,
    ...(item.evidenceId ? { evidenceId: item.evidenceId } : {}),
  }));
}

function hostStatusFor(result: CodingResultSummary | undefined): string {
  if (!result) return "skipped";
  if (result.verification.status === "failed") return "failed";
  if (result.verification.status === "blocked") return "unsupported";
  return "executed";
}

function repairPostValidationState(
  result: CodingResultSummary | undefined,
  commandCoverage: readonly { readonly coveredFiles: readonly string[] }[],
): string {
  if ((result?.repair.attempts ?? 0) <= 0) {
    return result?.verification.status ?? "not-requested";
  }
  if (result?.verification.status !== "passed") {
    return result?.verification.status ?? "not-requested";
  }
  if (commandCoverage.length > 0) {
    return "passed";
  }
  const seed = result.lastActionResultSeed;
  if (seed?.actionKind && actionForSeed(seed.actionKind) === "verify") {
    return "passed";
  }
  return "partial";
}

function stagedActionConsistent(
  decision: QueryRuntimeActionDecision,
  result: CodingResultSummary | undefined,
): boolean | undefined {
  const seed = result?.lastActionResultSeed;
  if (!seed?.actionKind) {
    return undefined;
  }
  const observed = actionForSeed(seed.actionKind);
  if (decision.nextAction === "search" || decision.nextAction === "read") {
    return observed === "search" || observed === "read";
  }
  return observed === decision.nextAction;
}

function actionForSeed(action: string): QueryRuntimeActionDecision["nextAction"] {
  const normalized = action.toLowerCase();
  if (normalized.includes("repo-explain") || normalized.includes("search") || normalized.includes("find")) {
    return "search";
  }
  if (normalized.includes("read") || normalized.includes("inspect")) {
    return "read";
  }
  if (normalized.includes("edit") || normalized.includes("write") || normalized.includes("apply")) {
    return "edit";
  }
  if (normalized.includes("verify") || normalized.includes("test") || normalized.includes("check")) {
    return "verify";
  }
  if (normalized.includes("repair")) {
    return "repair";
  }
  if (normalized.includes("artifact")) {
    return "artifact";
  }
  if (normalized.includes("continu")) {
    return "continue";
  }
  return "read";
}
