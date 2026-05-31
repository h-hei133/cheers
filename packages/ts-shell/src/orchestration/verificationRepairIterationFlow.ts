import { buildAgentPlan } from "./agentPlan.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import { applyEditProposalSelection } from "./editProposalApply.js";
import { buildEditRepairProposalReview } from "./editProposalReview.js";
import { selectEditProposalHunks } from "./editProposalSelection.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";
import { buildVerificationRepairContext } from "./verificationRepairContext.js";
import {
  planVerificationRepairHunkSetHandoff,
  planVerificationRepairLoop,
} from "./verificationRepairPlanner.js";
import { buildVerificationRepairResult } from "./verificationRepairResult.js";
import type { OrchestrationResult } from "./types.js";
import {
  projectRepairIteration,
  type ProductRepairIterationProjection,
} from "../repair/iteration/projection.js";

export type RepairIterationVerdict =
  | "verified-success-with-repair"
  | "repair-failed"
  | "repair-blocked"
  | "repair-partial"
  | "repair-not-proven";

export interface RepairIterationVerification {
  readonly status: "passed" | "failed" | "blocked";
  readonly command: string;
  readonly reason: string;
  readonly runtimeDerived: true;
  readonly evidence: readonly string[];
}

export interface VerificationRepairIterationResult {
  readonly taskId: string;
  readonly originalVerificationFailure: RepairIterationVerification;
  readonly originalFailurePreserved: true;
  readonly repairProposalSource: "deterministic-from-failure-evidence";
  readonly repairProposalId: string;
  readonly repairReviewStatus: string;
  readonly missingConfirmationState: string;
  readonly confirmationState: string;
  readonly confirmationSource: "explicit-authority-contract";
  readonly applyStatus: string;
  readonly changedFiles: readonly string[];
  readonly postRepairVerification: RepairIterationVerification;
  readonly postRepairVerificationSource: "same-relevant-command";
  readonly sameVerificationCommandRerun: boolean;
  readonly retryCount: 1;
  readonly maxRepairAttempts: 1;
  readonly unconfirmedResult: OrchestrationResult;
  readonly unverifiedResult: OrchestrationResult;
  readonly finalResult: OrchestrationResult;
  readonly finalRepairVerdict: RepairIterationVerdict;
  readonly notProvenClaims: readonly string[];
  readonly productRepair: ProductRepairIterationProjection;
  readonly evidence: readonly string[];
}

export async function runVerificationRepairIterationFlow(input: {
  readonly workspaceRoot: string;
  readonly targetPath: string;
  readonly expectedContent: string;
  readonly taskId: string;
  readonly sessionId: string;
  readonly prompt: string;
  readonly verificationCommand: string;
  readonly verify: (input: {
    readonly workspaceRoot: string;
    readonly targetPath: string;
    readonly expectedContent: string;
    readonly command: string;
    readonly phase: "original" | "post-repair";
  }) => RepairIterationVerification | Promise<RepairIterationVerification>;
}): Promise<VerificationRepairIterationResult> {
  const authority = createWorkspaceWriteAuthority(input.workspaceRoot);
  const packet = buildContextPacket(input);
  const agentPlan = buildAgentPlan({
    ownerCapability: "edit-patch",
    taskKind: "edit-file",
    requestedActionKind: "verify",
    targetSummary: packet.targetSafeLabel,
    contextPacketIds: [packet.packetId],
    contextCompleteness: "complete",
    confidence: "high",
    executionReadiness: "ready",
    missingFacts: [],
    suggestedReads: [input.targetPath],
    suggestedVerification: [input.verificationCommand],
    safeEvidenceMarkers: [`frozen-task:${input.taskId}`],
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    doNext:
      "preserve the failed verification, derive a repair proposal, confirm, apply, and rerun the same verification command",
  });

  const originalRead = authority.readVerifiedFile(input.targetPath);
  const originalFailure = await input.verify({
    workspaceRoot: input.workspaceRoot,
    targetPath: input.targetPath,
    expectedContent: input.expectedContent,
    command: input.verificationCommand,
    phase: "original",
  });
  if (originalFailure.status !== "failed") {
    throw new Error("repair iteration requires an original failed verification");
  }

  const repairHunks = deriveRepairHunks({
    targetPath: input.targetPath,
    actualContent: originalRead,
    expectedContent: input.expectedContent,
  });
  if (repairHunks.length === 0) {
    throw new Error("failed verification did not produce exact failure-derived repair hunks");
  }

  const context = buildVerificationRepairContext({
    sourceEditTransactionId: `${input.taskId}:original-verification-failure`,
    sourceProposalId: `${input.taskId}:failure-derived-repair`,
    contextPacket: packet,
    agentPlan,
    verification: {
      status: "failed",
      command: input.verificationCommand,
      reason: originalFailure.reason,
      selectionScope: "focused",
      selectionSource: "auto-from-changes",
      nextAction: "Create a review-gated repair proposal from the preserved failed verification.",
    },
    failedFiles: [{ path: input.targetPath, reason: originalFailure.reason }],
    changedFiles: [input.targetPath],
    failedHunks: repairHunks.map((hunk) => ({
      hunkId: hunk.hunkId,
      targetPath: hunk.targetPath,
      operationSummary: hunk.summary,
      failureSummary: originalFailure.reason,
    })),
    runtimeReceiptMarkers: originalFailure.evidence,
    failureExcerpt: originalFailure.reason,
    snapshotRecoveryAvailability: "available",
  });

  const plan = await planVerificationRepairLoop({
    context,
    availability: { kind: "available", providerKindLabel: "deterministic-failure-evidence-repair" },
    rawProposal: {
      hunks: repairHunks,
      confidence: "high",
      riskSummary: "repair proposal derived from original failed verification evidence",
      verificationRetryPlan: [
        "review exact repair hunks",
        "explicitly confirm selected repair hunks",
        "apply through the existing hunk-set route",
        "rerun the same relevant verification command",
      ],
    },
  });
  if (plan.status !== "repair-loop-review-required") {
    throw new Error(`repair proposal did not reach review-required state: ${plan.status}`);
  }
  const editRepairPlan = plan.editRepairPlan;
  if (!("manifest" in editRepairPlan) || !editRepairPlan.manifest || !("mappingByHunkId" in editRepairPlan)) {
    throw new Error("repair proposal manifest missing");
  }

  const review = buildEditRepairProposalReview(editRepairPlan.manifest);
  const missingConfirmation = selectEditProposalHunks({
    review,
    action: "select-all-exact",
    explicitConfirmation: false,
  });
  const unconfirmedHandoff = planVerificationRepairHunkSetHandoff({
    plan,
    selection: missingConfirmation,
  });
  const unconfirmedResult = buildVerificationRepairResult({
    sessionId: `${input.sessionId}-unconfirmed`,
    prompt: `${input.prompt} Negative control: unconfirmed repair cannot apply.`,
    context,
    plan: unconfirmedHandoff,
    review,
    selection: missingConfirmation,
  });

  const confirmation = selectEditProposalHunks({
    review,
    action: "select-all-exact",
    explicitConfirmation: true,
  });
  if (
    confirmation.state !== "confirmed-exact-target-set" &&
    confirmation.state !== "confirmed-exact-single-target"
  ) {
    throw new Error(`repair confirmation did not reach exact confirmed state: ${confirmation.state}`);
  }
  const handoff = planVerificationRepairHunkSetHandoff({ plan, selection: confirmation });
  if (handoff.status !== "repair-loop-ready-for-hunk-set-handoff") {
    throw new Error(`repair handoff did not reach existing hunk-set route: ${handoff.status}`);
  }

  const applyResult = await applyEditProposalSelection({
    selection: confirmation,
    mappingByHunkId: editRepairPlan.mappingByHunkId,
    targetPathByLabel: new Map([[input.targetPath, input.targetPath]]),
    fencedOptions: {
      workspaceRoot: input.workspaceRoot,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    },
  });

  const unverifiedResult = buildVerificationRepairResult({
    sessionId: `${input.sessionId}-unverified`,
    prompt: `${input.prompt} Negative control: repair apply without re-verification is partial.`,
    context,
    plan: handoff,
    review,
    selection: confirmation,
    applyResult,
  });

  const postRepairVerification = await input.verify({
    workspaceRoot: input.workspaceRoot,
    targetPath: input.targetPath,
    expectedContent: input.expectedContent,
    command: input.verificationCommand,
    phase: "post-repair",
  });
  const finalResult = buildVerificationRepairResult({
    sessionId: input.sessionId,
    prompt: input.prompt,
    context,
    plan: handoff,
    review,
    selection: confirmation,
    applyResult,
    postApplyVerification: {
      status: postRepairVerification.status === "passed" ? "passed" : "failed",
      command: postRepairVerification.command,
      reason: postRepairVerification.reason,
      selectionScope: "focused",
      selectionSource: "auto-from-changes",
      runtimeDerived: true,
      evidence: postRepairVerification.evidence,
    },
  });
  const finalRepairVerdict = classifyFinalRepairVerdict({
    applyStatus: applyResult.status,
    postRepairVerification,
  });
  const notProvenClaims =
    finalRepairVerdict === "verified-success-with-repair"
      ? ["live provider repair proposal", "automatic repair", "fuzzy repair apply"]
      : ["repair success", "post-repair verification passed"];
  const productRepair = projectRepairIteration({
    originalFailurePreserved: true,
    repairProposalSource: "deterministic-from-failure-evidence",
    confirmationSource: "explicit-authority-contract",
    applyStatus: applyResult.status,
    postRepairVerificationStatus: postRepairVerification.status,
    sameVerificationCommandRerun: postRepairVerification.command === input.verificationCommand,
    retryCount: 1,
    maxRepairAttempts: 1,
    changedFiles: applyResult.changedFiles,
    notProvenClaims,
    finalRepairVerdict,
  });

  return {
    taskId: input.taskId,
    originalVerificationFailure: originalFailure,
    originalFailurePreserved: true,
    repairProposalSource: "deterministic-from-failure-evidence",
    repairProposalId: review.proposalId,
    repairReviewStatus: review.reviewStatus,
    missingConfirmationState: missingConfirmation.state,
    confirmationState: confirmation.state,
    confirmationSource: "explicit-authority-contract",
    applyStatus: applyResult.status,
    changedFiles: applyResult.changedFiles,
    postRepairVerification,
    postRepairVerificationSource: "same-relevant-command",
    sameVerificationCommandRerun: postRepairVerification.command === input.verificationCommand,
    retryCount: 1,
    maxRepairAttempts: 1,
    unconfirmedResult,
    unverifiedResult,
    finalResult,
    finalRepairVerdict,
    notProvenClaims,
    productRepair,
    evidence: [
      ...originalFailure.evidence,
      ...context.evidence,
      ...plan.evidence,
      ...review.evidence,
      ...missingConfirmation.evidence,
      ...confirmation.evidence,
      ...handoff.evidence,
      ...applyResult.evidence,
      ...postRepairVerification.evidence,
      ...(finalResult.codingResult?.evidence ?? []),
      `verification-repair-iteration:final:${finalRepairVerdict}`,
      "verification-repair-iteration:original-failure-preserved",
      "verification-repair-iteration:proposal-source:deterministic-from-failure-evidence",
      "verification-repair-iteration:confirmation:explicit-authority-contract",
      "verification-repair-iteration:apply:existing-hunk-set-route",
      "verification-repair-iteration:rerun:same-relevant-command",
      "verification-repair-iteration:retry-count:1",
      "verification-repair-iteration:max-attempts:1",
      "verification-repair-iteration:provider-call-during-apply:not-run",
      "verification-repair-iteration:raw-content-excluded",
    ],
  };
}

function classifyFinalRepairVerdict(input: {
  readonly applyStatus: string;
  readonly postRepairVerification: RepairIterationVerification;
}): RepairIterationVerdict {
  if (
    (
      input.applyStatus === "hunk-set-applied" ||
      input.applyStatus === "single-target-applied" ||
      input.applyStatus === "target-set-applied"
    ) &&
    input.postRepairVerification.status === "passed"
  ) {
    return "verified-success-with-repair";
  }
  if (input.postRepairVerification.status === "blocked") return "repair-blocked";
  if (
    input.applyStatus === "hunk-set-applied" ||
    input.applyStatus === "single-target-applied" ||
    input.applyStatus === "target-set-applied"
  ) {
    return "repair-failed";
  }
  return "repair-partial";
}

function buildContextPacket(input: {
  readonly taskId: string;
  readonly targetPath: string;
  readonly expectedContent: string;
}): TargetedContextPacket {
  return {
    packetId: `ctx_${stableId(input.taskId, input.targetPath)}`,
    rootTargetFile: input.targetPath,
    targetSafeLabel: input.targetPath,
    targetKind: "explicit-code-target",
    readBudget: {
      maxCandidateCount: 24,
      maxFilesRead: 12,
      maxBytesPerFile: 8000,
      maxTotalBytes: 32000,
      filesRead: 1,
      bytesUsed: input.expectedContent.length,
    },
    contextSources: [],
    selectedCandidateSummaries: [],
    omittedCandidateSummaries: [],
    confidence: "high",
    completenessStatus: "complete",
    freshnessFacts: ["context-freshness:read-during-current-turn"],
    redactionStatus: "redacted-and-budgeted",
    replaySafeSummary: `context-packet for frozen task ${input.taskId}`,
    mutationAuthority: "not-granted",
    evidence: [
      `verification-repair-iteration:context-packet:${input.taskId}`,
      "verification-repair-iteration:raw-content-excluded",
    ],
  };
}

function deriveRepairHunks(input: {
  readonly targetPath: string;
  readonly actualContent: string | undefined;
  readonly expectedContent: string;
}) {
  const actualLines = splitComparableLines(input.actualContent ?? "");
  const expectedLines = splitComparableLines(input.expectedContent);
  const max = Math.max(actualLines.length, expectedLines.length);
  const hunks: Array<{
    readonly hunkId: string;
    readonly targetPath: string;
    readonly summary: string;
    readonly oldText: string;
    readonly newText: string;
  }> = [];
  for (let index = 0; index < max; index += 1) {
    const oldText = actualLines[index];
    const newText = expectedLines[index];
    if (oldText === undefined || newText === undefined || oldText === newText) continue;
    hunks.push({
      hunkId: `failure-evidence-repair-line-${index + 1}`,
      targetPath: input.targetPath,
      summary: `replace failed verification line ${index + 1}`,
      oldText,
      newText,
    });
  }
  return hunks;
}

function splitComparableLines(content: string): readonly string[] {
  const lines = content.split("\n");
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

function stableId(...parts: readonly string[]): string {
  let hash = 0;
  for (const char of parts.join("\0")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
