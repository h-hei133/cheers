import { buildAgentPlan } from "./agentPlan.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import { applyEditProposalSelection } from "./editProposalApply.js";
import { buildEditRepairProposalReview } from "./editProposalReview.js";
import { selectEditProposalHunks } from "./editProposalSelection.js";
import { createWorkspaceWriteAuthority } from "../edit/authority/workspace.js";
import { buildVerificationRepairContext } from "./verificationRepairContext.js";
import {
  planVerificationRepairHunkSetHandoff,
  planVerificationRepairLoop,
} from "./verificationRepairPlanner.js";
import { buildVerificationRepairResult } from "./verificationRepairResult.js";
import type { OrchestrationResult } from "./types.js";

export interface ContentRepairFlowInput {
  readonly workspaceRoot: string;
  readonly targetPath: string;
  readonly expectedContent: string;
  readonly taskId: string;
  readonly sessionId: string;
  readonly prompt: string;
  readonly verificationCommandLabel: string;
}

export interface ContentRepairFlowResult {
  readonly originalFailure: ContentVerificationResult;
  readonly originalFailurePreserved: true;
  readonly repairProposalId: string;
  readonly repairProposalSource: "deterministic-from-product-read-evidence";
  readonly repairReviewStatus: string;
  readonly missingConfirmationState: string;
  readonly confirmationState: string;
  readonly applyStatus: string;
  readonly changedFiles: readonly string[];
  readonly postRepairVerification: ContentVerificationResult;
  readonly unverifiedResult: OrchestrationResult;
  readonly verifiedResult: OrchestrationResult;
  readonly evidence: readonly string[];
}

export type ContentVerificationResult =
  | {
      readonly status: "passed";
      readonly reason: string;
      readonly mismatchedLineCount: 0;
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "failed";
      readonly reason: string;
      readonly mismatchedLineCount: number;
      readonly evidence: readonly string[];
    };

interface RepairHunk {
  readonly hunkId: string;
  readonly targetPath: string;
  readonly summary: string;
  readonly oldText: string;
  readonly newText: string;
}

export async function runContentVerificationRepairFlow(
  input: ContentRepairFlowInput,
): Promise<ContentRepairFlowResult> {
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
    suggestedVerification: [input.verificationCommandLabel],
    safeEvidenceMarkers: [`frozen-task:${input.taskId}`],
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    doNext:
      "preserve the failed verification, derive repair hunks from product read evidence, confirm, apply, and rerun verification",
  });

  const originalRead = authority.readVerifiedFile(input.targetPath);
  const originalFailure = verifyContent({
    targetPath: input.targetPath,
    actualContent: originalRead,
    expectedContent: input.expectedContent,
    phase: "original",
  });
  if (originalFailure.status !== "failed") {
    throw new Error("content repair flow requires an initial verification failure");
  }

  const repairHunks = deriveRepairHunks({
    targetPath: input.targetPath,
    actualContent: originalRead,
    expectedContent: input.expectedContent,
  });
  if (repairHunks.length === 0) {
    throw new Error("failed verification did not produce any exact repair hunks");
  }

  const context = buildVerificationRepairContext({
    sourceEditTransactionId: `${input.taskId}:original-verification-failure`,
    sourceProposalId: `${input.taskId}:failure-derived-repair`,
    contextPacket: packet,
    agentPlan,
    verification: {
      status: "failed",
      command: input.verificationCommandLabel,
      reason: originalFailure.reason,
      selectionScope: "focused",
      selectionSource: "auto-from-changes",
      nextAction:
        "Create a review-gated repair proposal from the preserved verification failure and product read evidence.",
    },
    failedFiles: [{ path: input.targetPath, reason: originalFailure.reason }],
    changedFiles: [input.targetPath],
    failedHunks: repairHunks.map((hunk) => ({
      hunkId: hunk.hunkId,
      targetPath: hunk.targetPath,
      operationSummary: hunk.summary,
      failureSummary: originalFailure.reason,
    })),
    runtimeReceiptMarkers: [
      "product-content-verification:original-failed",
      `product-content-verification:task:${input.taskId}`,
    ],
    failureExcerpt: originalFailure.reason,
    snapshotRecoveryAvailability: "available",
  });

  const plan = await planVerificationRepairLoop({
    context,
    availability: {
      kind: "available",
      providerKindLabel: "deterministic-product-read-repair-proposal",
    },
    rawProposal: {
      hunks: repairHunks,
      confidence: "high",
      riskSummary: "repair proposal derived from mismatched product verification lines",
      verificationRetryPlan: [
        "review exact repair hunks",
        "explicitly confirm selected repair hunks",
        "apply through the existing hunk-set route",
        "rerun product content verification against the repaired target",
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
  const confirmation = selectEditProposalHunks({
    review,
    action: "select-all-exact",
    explicitConfirmation: true,
  });
  if (confirmation.state !== "confirmed-exact-target-set") {
    throw new Error(`repair confirmation did not reach exact target-set state: ${confirmation.state}`);
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
  if (applyResult.status !== "hunk-set-applied") {
    throw new Error(`repair apply did not use the successful hunk-set route: ${applyResult.status}`);
  }

  const unverifiedResult = buildVerificationRepairResult({
    sessionId: `${input.sessionId}-unverified`,
    prompt: `${input.prompt} Negative control: apply without post-repair verification is partial.`,
    context,
    plan: handoff,
    review,
    selection: confirmation,
    applyResult,
  });

  const repairedRead = authority.readVerifiedFile(input.targetPath);
  const postRepairVerification = verifyContent({
    targetPath: input.targetPath,
    actualContent: repairedRead,
    expectedContent: input.expectedContent,
    phase: "post-repair",
  });
  if (postRepairVerification.status !== "passed") {
    throw new Error("post-repair product content verification did not pass");
  }

  const verifiedResult = buildVerificationRepairResult({
    sessionId: input.sessionId,
    prompt: input.prompt,
    context,
    plan: handoff,
    review,
    selection: confirmation,
    applyResult,
    postApplyVerification: {
      status: "passed",
      reason: postRepairVerification.reason,
      selectionScope: "focused",
      selectionSource: "auto-from-changes",
      runtimeDerived: true,
      evidence: [
        ...postRepairVerification.evidence,
        "product-content-verification:post-repair:task-relevant",
      ],
    },
  });

  return {
    originalFailure,
    originalFailurePreserved: true,
    repairProposalId: review.proposalId,
    repairProposalSource: "deterministic-from-product-read-evidence",
    repairReviewStatus: review.reviewStatus,
    missingConfirmationState: missingConfirmation.state,
    confirmationState: confirmation.state,
    applyStatus: applyResult.status,
    changedFiles: applyResult.changedFiles,
    postRepairVerification,
    unverifiedResult,
    verifiedResult,
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
      ...(verifiedResult.codingResult?.evidence ?? []),
      "product-repair-flow:frozen-task-driven",
      "product-repair-flow:proposal-derived-from-product-read-evidence",
      "product-repair-flow:explicit-confirmation-before-apply",
      "product-repair-flow:existing-hunk-set-apply",
      "product-repair-flow:post-repair-verification-passed",
    ],
  };
}

function buildContextPacket(input: ContentRepairFlowInput): TargetedContextPacket {
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
      `content-repair-flow:context-packet:${input.taskId}`,
      "content-repair-flow:raw-content-excluded",
    ],
  };
}

function verifyContent(input: {
  readonly targetPath: string;
  readonly actualContent: string | undefined;
  readonly expectedContent: string;
  readonly phase: "original" | "post-repair";
}): ContentVerificationResult {
  if (input.actualContent === input.expectedContent) {
    return {
      status: "passed",
      reason: `${input.phase} product content verification passed for ${input.targetPath}`,
      mismatchedLineCount: 0,
      evidence: [
        `product-content-verification:${input.phase}:passed`,
        `product-content-verification:target:${input.targetPath}`,
        "product-content-verification:raw-content-excluded",
      ],
    };
  }
  const mismatchedLineCount = countLineMismatches(input.actualContent ?? "", input.expectedContent);
  return {
    status: "failed",
    reason: `${input.phase} product content verification failed for ${input.targetPath}; mismatchedLineCount=${mismatchedLineCount}`,
    mismatchedLineCount,
    evidence: [
      `product-content-verification:${input.phase}:failed`,
      `product-content-verification:target:${input.targetPath}`,
      `product-content-verification:mismatched-lines:${mismatchedLineCount}`,
      "product-content-verification:raw-content-excluded",
    ],
  };
}

function deriveRepairHunks(input: {
  readonly targetPath: string;
  readonly actualContent: string | undefined;
  readonly expectedContent: string;
}): readonly RepairHunk[] {
  const actualLines = splitComparableLines(input.actualContent ?? "");
  const expectedLines = splitComparableLines(input.expectedContent);
  const max = Math.max(actualLines.length, expectedLines.length);
  const hunks: RepairHunk[] = [];
  for (let index = 0; index < max; index += 1) {
    const oldText = actualLines[index];
    const newText = expectedLines[index];
    if (oldText === undefined || newText === undefined || oldText === newText) {
      continue;
    }
    hunks.push({
      hunkId: `product-read-repair-line-${index + 1}`,
      targetPath: input.targetPath,
      summary: `replace mismatched verification line ${index + 1}`,
      oldText,
      newText,
    });
  }
  return hunks;
}

function countLineMismatches(actualContent: string, expectedContent: string): number {
  const actualLines = splitComparableLines(actualContent);
  const expectedLines = splitComparableLines(expectedContent);
  const max = Math.max(actualLines.length, expectedLines.length);
  let count = 0;
  for (let index = 0; index < max; index += 1) {
    if (actualLines[index] !== expectedLines[index]) count += 1;
  }
  return count;
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
