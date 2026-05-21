import crypto from "node:crypto";
import type { AgentPlan } from "./agentPlan.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import {
  buildEditRepairContext,
  buildEditRepairContextFromCodingResult,
  type EditRepairContext,
} from "./editRepairContext.js";
import { redactProviderEditText } from "./providerEditContext.js";
import type {
  CodingResultSummary,
  CodingVerificationSummary,
} from "./types.js";

export type VerificationRepairContextStatus =
  | "repair-loop-context-created"
  | "repair-loop-missing-verification"
  | "repair-loop-missing-context"
  | "repair-loop-context-over-budget"
  | "repair-loop-not-needed"
  | "repair-loop-unsupported";

export interface VerificationRepairContext {
  readonly repairLoopId: string;
  readonly status: VerificationRepairContextStatus;
  readonly editRepairContext: EditRepairContext;
  readonly sourceEditTransactionId?: string;
  readonly sourceProposalId?: string;
  readonly sourceContextPacketId?: string;
  readonly sourceAgentPlanId?: string;
  readonly verificationCommandSafeLabel?: string;
  readonly verificationOutcome: CodingVerificationSummary["status"];
  readonly runtimeReceiptMarkers: readonly string[];
  readonly failedFileLabels: readonly string[];
  readonly failedHunkSummaries: EditRepairContext["failedHunkSummaries"];
  readonly changedFileLabels: readonly string[];
  readonly recoveryAvailabilitySummary: EditRepairContext["snapshotRecoveryAvailability"];
  readonly safeFailureExcerpt: string;
  readonly omittedEvidenceReasons: readonly string[];
  readonly redactionStatus: "redacted-and-budgeted";
  readonly safeSummary: string;
  readonly transcriptSummary: string;
  readonly evidence: readonly string[];
}

export function buildVerificationRepairContext(input: {
  readonly sourceEditTransactionId?: string;
  readonly sourceProposalId?: string;
  readonly contextPacket?: TargetedContextPacket;
  readonly agentPlan?: AgentPlan;
  readonly verification?: CodingVerificationSummary;
  readonly failedFiles?: ReadonlyArray<{ readonly path: string; readonly reason?: string }>;
  readonly changedFiles?: readonly string[];
  readonly failedHunks?: readonly {
    readonly hunkId: string;
    readonly targetPath: string;
    readonly operationSummary?: string;
    readonly failureSummary?: string;
  }[];
  readonly runtimeReceiptMarkers?: readonly string[];
  readonly failureExcerpt?: string;
  readonly snapshotRecoveryAvailability?:
    | "available"
    | "partial"
    | "unavailable"
    | "unknown";
  readonly maxFailureExcerptChars?: number;
}): VerificationRepairContext {
  const verification = input.verification ?? {
    status: "blocked" as const,
    reason: "verification evidence missing",
    nextAction: "Run or attach failed verification evidence before repair planning.",
  };
  const editRepairContext = buildEditRepairContext({
    sourceTransactionId: input.sourceEditTransactionId,
    sourceProposalId: input.sourceProposalId,
    verification,
    failedFiles: input.failedFiles,
    changedFiles: input.changedFiles,
    failedHunks: input.failedHunks,
    runtimeReceiptMarkers: input.runtimeReceiptMarkers,
    failureExcerpt: input.failureExcerpt,
    snapshotRecoveryAvailability: input.snapshotRecoveryAvailability,
    maxFailureExcerptChars: input.maxFailureExcerptChars,
  });
  return buildVerificationRepairContextFromEditContext({
    editRepairContext,
    sourceEditTransactionId: input.sourceEditTransactionId,
    sourceProposalId: input.sourceProposalId,
    sourceContextPacketId: input.contextPacket?.packetId,
    sourceAgentPlanId: input.agentPlan?.planId,
    verificationProvided: Boolean(input.verification),
  });
}

export function buildVerificationRepairContextFromCodingResult(input: {
  readonly codingResult: CodingResultSummary;
  readonly sourceEditTransactionId?: string;
  readonly sourceProposalId?: string;
  readonly contextPacket?: TargetedContextPacket;
  readonly agentPlan?: AgentPlan;
  readonly maxFailureExcerptChars?: number;
}): VerificationRepairContext {
  const editRepairContext = buildEditRepairContextFromCodingResult({
    codingResult: input.codingResult,
    sourceTransactionId: input.sourceEditTransactionId,
    sourceProposalId: input.sourceProposalId,
    maxFailureExcerptChars: input.maxFailureExcerptChars,
  });
  return buildVerificationRepairContextFromEditContext({
    editRepairContext,
    sourceEditTransactionId: input.sourceEditTransactionId,
    sourceProposalId: input.sourceProposalId,
    sourceContextPacketId: input.contextPacket?.packetId,
    sourceAgentPlanId: input.agentPlan?.planId,
    verificationProvided: input.codingResult.verification.status !== "not-requested",
  });
}

export function buildVerificationRepairContextFromEditContext(input: {
  readonly editRepairContext: EditRepairContext;
  readonly sourceEditTransactionId?: string;
  readonly sourceProposalId?: string;
  readonly sourceContextPacketId?: string;
  readonly sourceAgentPlanId?: string;
  readonly verificationProvided?: boolean;
}): VerificationRepairContext {
  const omittedEvidenceReasons = new Set(input.editRepairContext.omittedContentReasons);
  if (!input.verificationProvided) {
    omittedEvidenceReasons.add("verification-evidence-missing");
  }
  if (!input.sourceContextPacketId || !input.sourceAgentPlanId) {
    omittedEvidenceReasons.add("context-packet-or-agent-plan-missing");
  }

  const status = classifyVerificationRepairContext({
    editContextStatus: input.editRepairContext.status,
    verificationProvided: input.verificationProvided ?? true,
    hasContextAndPlan: Boolean(input.sourceContextPacketId && input.sourceAgentPlanId),
  });
  const repairLoopId = buildRepairLoopId({
    editRepairContextId: input.editRepairContext.repairContextId,
    status,
    sourceContextPacketId: input.sourceContextPacketId,
    sourceAgentPlanId: input.sourceAgentPlanId,
  });
  const safeFailureExcerpt = redactProviderEditText(
    input.editRepairContext.failedVerificationSummary.reason ??
      "verification failed",
  ).slice(0, 700);
  const verificationCommandSafeLabel = input.editRepairContext.failedVerificationSummary.commandLabel;
  const safeSummary = [
    `verification repair loop ${status}`,
    `repairLoop=${repairLoopId}`,
    `repairContext=${input.editRepairContext.repairContextId}`,
    input.sourceContextPacketId ? `contextPacket=${input.sourceContextPacketId}` : undefined,
    input.sourceAgentPlanId ? `agentPlan=${input.sourceAgentPlanId}` : undefined,
    `verification=${input.editRepairContext.failedVerificationSummary.status}`,
    `runtimeReceipts=${input.editRepairContext.runtimeReceiptMarkers.length}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].filter(Boolean).join("; ");
  const transcriptSummary = [
    `verification-repair-loop id=${repairLoopId}`,
    `context=${input.editRepairContext.repairContextId}`,
    input.sourceEditTransactionId ? `sourceTransaction=${input.sourceEditTransactionId}` : undefined,
    input.sourceProposalId ? `sourceProposal=${input.sourceProposalId}` : undefined,
    input.sourceContextPacketId ? `contextPacket=${input.sourceContextPacketId}` : undefined,
    input.sourceAgentPlanId ? `agentPlan=${input.sourceAgentPlanId}` : undefined,
    `status=${status}`,
    `verification=${input.editRepairContext.failedVerificationSummary.status}`,
    `runtimeReceipts=${input.editRepairContext.runtimeReceiptMarkers.length}`,
    "mutation:not-run",
    "raw-content-excluded",
  ].filter(Boolean).join("; ");

  return {
    repairLoopId,
    status,
    editRepairContext: input.editRepairContext,
    ...(input.sourceEditTransactionId ? { sourceEditTransactionId: input.sourceEditTransactionId } : {}),
    ...(input.sourceProposalId ? { sourceProposalId: input.sourceProposalId } : {}),
    ...(input.sourceContextPacketId ? { sourceContextPacketId: input.sourceContextPacketId } : {}),
    ...(input.sourceAgentPlanId ? { sourceAgentPlanId: input.sourceAgentPlanId } : {}),
    ...(verificationCommandSafeLabel ? { verificationCommandSafeLabel } : {}),
    verificationOutcome: input.editRepairContext.failedVerificationSummary.status,
    runtimeReceiptMarkers: input.editRepairContext.runtimeReceiptMarkers,
    failedFileLabels: input.editRepairContext.failedFileLabels,
    failedHunkSummaries: input.editRepairContext.failedHunkSummaries,
    changedFileLabels: input.editRepairContext.changedFileLabels,
    recoveryAvailabilitySummary: input.editRepairContext.snapshotRecoveryAvailability,
    safeFailureExcerpt,
    omittedEvidenceReasons: Array.from(omittedEvidenceReasons),
    redactionStatus: "redacted-and-budgeted",
    safeSummary,
    transcriptSummary,
    evidence: [
      ...input.editRepairContext.evidence,
      `verification-repair-context:status:${status}`,
      `verification-repair-context:loop:${repairLoopId}`,
      `verification-repair-context:edit-context:${input.editRepairContext.repairContextId}`,
      ...(input.sourceContextPacketId
        ? [`verification-repair-context:context-packet:${input.sourceContextPacketId}`]
        : []),
      ...(input.sourceAgentPlanId
        ? [`verification-repair-context:agent-plan:${input.sourceAgentPlanId}`]
        : []),
      `verification-repair-context:verification:${input.editRepairContext.failedVerificationSummary.status}`,
      `verification-repair-context:runtime-receipts:${input.editRepairContext.runtimeReceiptMarkers.length}`,
      "verification-repair-context:mutation:not-run",
      "verification-repair-context:redacted-and-budgeted",
      "verification-repair-context:raw-content-excluded",
    ],
  };
}

function classifyVerificationRepairContext(input: {
  readonly editContextStatus: EditRepairContext["status"];
  readonly verificationProvided: boolean;
  readonly hasContextAndPlan: boolean;
}): VerificationRepairContextStatus {
  if (!input.verificationProvided) {
    return "repair-loop-missing-verification";
  }
  if (!input.hasContextAndPlan) {
    return "repair-loop-missing-context";
  }
  switch (input.editContextStatus) {
    case "repair-context-created":
      return "repair-loop-context-created";
    case "repair-context-over-budget":
      return "repair-loop-context-over-budget";
    case "repair-not-needed":
      return "repair-loop-not-needed";
    case "repair-unsupported":
      return "repair-loop-unsupported";
  }
}

function buildRepairLoopId(input: {
  readonly editRepairContextId: string;
  readonly status: string;
  readonly sourceContextPacketId?: string;
  readonly sourceAgentPlanId?: string;
}): string {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 12);
  return `verification-repair-loop-${hash}`;
}
