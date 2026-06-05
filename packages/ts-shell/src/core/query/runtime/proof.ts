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
import type { QueryRuntimeActionDecision } from "./decision.js";
import type { QueryRuntimeState } from "./state.js";

export interface QueryRuntimeProofProjection {
  readonly proof: TaskProofInput;
  readonly verdict: TaskVerdict;
  readonly artifactReceipt?: ArtifactReceipt;
  readonly action: QueryRuntimeActionDecision["nextAction"];
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
  const artifactReceipt = createArtifactReceipt({
    taskKind: input.decision.taskKind,
    outputKind: input.decision.outputKind,
    requiredPaths: requiredArtifactPaths(input.decision, result),
    workspacePaths: input.decision.selectedPaths,
    verificationState: artifactVerificationState(result),
    failureCategories: failureCategories(result),
    verificationEvidence: result?.evidence ?? [],
    claimEvidence: claimEvidence(result),
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
    repairAttempted: (result?.repair.attempts ?? 0) > 0,
    repairPostValidation: verificationState,
    originalFailurePreserved: Boolean(result && (result.failedFiles.length > 0 || result.verification.status === "failed")),
    artifactValidationState: artifactReceipt?.validationState,
    artifactSourceReceiptsAvailable: artifactReceipt?.sourceReceipts.some((receipt) => receipt.available),
    artifactCorrectionAttempted: artifactCorrection?.attempted,
    artifactCorrectionValidationState: artifactCorrection?.validationState,
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
    proofGap: input.decision.proofGap,
    changedFiles: input.decision.changedFiles,
    terminalSuccessClaim: false as const,
  });
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

function failureCategories(result: CodingResultSummary | undefined): readonly string[] {
  if (!result) return [];
  return [
    ...(result.verification.status === "failed" ? ["artifact invalid"] : []),
    ...result.failedFiles.map((file) => file.reason),
    ...result.taskSatisfaction.reasons,
  ];
}

function claimEvidence(result: CodingResultSummary | undefined): readonly {
  readonly claim: string;
  readonly evidenceId?: string;
}[] {
  return (result?.taskSatisfaction.requiredEvidence ?? []).map((claim, index) => {
    const evidenceId = result?.taskSatisfaction.observedEvidence[index];
    return {
      claim,
      ...(evidenceId ? { evidenceId } : {}),
    };
  });
}

function hostStatusFor(result: CodingResultSummary | undefined): string {
  if (!result) return "skipped";
  if (result.verification.status === "failed") return "failed";
  if (result.verification.status === "blocked") return "unsupported";
  return "executed";
}
