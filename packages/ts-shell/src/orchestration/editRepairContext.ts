import crypto from "node:crypto";
import type {
  CodingResultSummary,
  CodingVerificationSummary,
} from "./types.js";
import { redactProviderEditText } from "./providerEditContext.js";
import { safeTargetLabel } from "./workspaceFileContract.js";

export type EditRepairContextStatus =
  | "repair-context-created"
  | "repair-context-over-budget"
  | "repair-not-needed"
  | "repair-unsupported";

export interface EditRepairHunkSummary {
  readonly hunkId: string;
  readonly targetLabel: string;
  readonly operationSummary: string;
  readonly failureSummary: string;
  readonly redactionStatus: "raw-content-excluded";
}

export interface EditRepairContext {
  readonly repairContextId: string;
  readonly status: EditRepairContextStatus;
  readonly sourceTransactionId?: string;
  readonly sourceProposalId?: string;
  readonly failedVerificationSummary: {
    readonly status: CodingVerificationSummary["status"];
    readonly commandLabel?: string;
    readonly reason?: string;
    readonly nextAction?: string;
    readonly blockerKind?: string;
  };
  readonly failedFileLabels: readonly string[];
  readonly changedFileLabels: readonly string[];
  readonly failedHunkSummaries: readonly EditRepairHunkSummary[];
  readonly runtimeReceiptMarkers: readonly string[];
  readonly snapshotRecoveryAvailability:
    | "available"
    | "partial"
    | "unavailable"
    | "unknown";
  readonly redactionStatus: "redacted-and-budgeted";
  readonly omittedContentReasons: readonly string[];
  readonly budget: {
    readonly maxFailureExcerptChars: number;
    readonly usedFailureExcerptChars: number;
    readonly maxFiles: number;
    readonly maxHunks: number;
  };
  readonly safeSummary: string;
  readonly transcriptSummary: string;
  readonly evidence: readonly string[];
}

export function buildEditRepairContext(input: {
  readonly sourceTransactionId?: string;
  readonly sourceProposalId?: string;
  readonly verification: CodingVerificationSummary;
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
  readonly maxFiles?: number;
  readonly maxHunks?: number;
}): EditRepairContext {
  const maxFailureExcerptChars = input.maxFailureExcerptChars ?? 700;
  const maxFiles = input.maxFiles ?? 6;
  const maxHunks = input.maxHunks ?? 6;
  const omittedContentReasons = new Set<string>([
    "raw-full-file-content-excluded",
    "provider-config-excluded",
    "credentials-excluded",
  ]);
  const failedFileLabels = (input.failedFiles ?? [])
    .slice(0, maxFiles)
    .map((file) => safeTargetLabel(file.path));
  const changedFileLabels = (input.changedFiles ?? [])
    .slice(0, maxFiles)
    .map(safeTargetLabel);
  if ((input.failedFiles ?? []).length > maxFiles || (input.changedFiles ?? []).length > maxFiles) {
    omittedContentReasons.add("file-labels-over-budget");
  }
  if ((input.failedHunks ?? []).length > maxHunks) {
    omittedContentReasons.add("failed-hunks-over-budget");
  }

  const rawReason =
    input.failureExcerpt ??
    input.verification.reason ??
    input.failedFiles?.find((file) => file.reason?.trim())?.reason ??
    "verification failed";
  const redactedReason = redactAndBudget(rawReason, maxFailureExcerptChars);
  if (redactedReason.omitted) {
    omittedContentReasons.add("failure-excerpt-over-budget");
  }
  const commandLabel = input.verification.command
    ? redactAndBudget(input.verification.command, 180).value
    : undefined;
  const failedHunkSummaries = (input.failedHunks ?? [])
    .slice(0, maxHunks)
    .map((hunk): EditRepairHunkSummary => ({
      hunkId: hunk.hunkId,
      targetLabel: safeTargetLabel(hunk.targetPath),
      operationSummary: redactAndBudget(
        hunk.operationSummary ?? "repair failed exact hunk",
        180,
      ).value,
      failureSummary: redactAndBudget(
        hunk.failureSummary ?? redactedReason.value,
        240,
      ).value,
      redactionStatus: "raw-content-excluded",
    }));

  const status = classifyRepairContextStatus({
    verificationStatus: input.verification.status,
    overBudget:
      (input.failedFiles ?? []).length > maxFiles ||
      (input.changedFiles ?? []).length > maxFiles ||
      (input.failedHunks ?? []).length > maxHunks,
    hasFailureFacts:
      Boolean(input.failedFiles?.length) ||
      Boolean(input.changedFiles?.length) ||
      Boolean(input.failedHunks?.length) ||
      input.verification.status === "failed" ||
      input.verification.status === "blocked",
  });
  const repairContextId = buildRepairContextId({
    sourceTransactionId: input.sourceTransactionId,
    sourceProposalId: input.sourceProposalId,
    verificationStatus: input.verification.status,
    failedFileLabels,
    changedFileLabels,
    failedHunkIds: failedHunkSummaries.map((hunk) => hunk.hunkId),
    reason: redactedReason.value,
  });
  const safeSummary = [
    `repair context ${status}`,
    `verification=${input.verification.status}`,
    `failed=${failedFileLabels.join(", ") || "none"}`,
    `changed=${changedFileLabels.join(", ") || "none"}`,
    "raw-content-excluded",
  ].join("; ");
  const transcriptSummary = [
    `edit-repair-context id=${repairContextId}`,
    `status=${status}`,
    input.sourceTransactionId ? `sourceTransaction=${input.sourceTransactionId}` : undefined,
    input.sourceProposalId ? `sourceProposal=${input.sourceProposalId}` : undefined,
    `verification=${input.verification.status}`,
    `failed=${failedFileLabels.join(", ") || "none"}`,
    `changed=${changedFileLabels.join(", ") || "none"}`,
    "mutation:not-run",
    "raw-content-excluded",
  ].filter(Boolean).join("; ");

  return {
    repairContextId,
    status,
    ...(input.sourceTransactionId ? { sourceTransactionId: input.sourceTransactionId } : {}),
    ...(input.sourceProposalId ? { sourceProposalId: input.sourceProposalId } : {}),
    failedVerificationSummary: {
      status: input.verification.status,
      ...(commandLabel ? { commandLabel } : {}),
      reason: redactedReason.value,
      ...(input.verification.nextAction
        ? { nextAction: redactAndBudget(input.verification.nextAction, 240).value }
        : {}),
      ...(input.verification.blockerKind ? { blockerKind: input.verification.blockerKind } : {}),
    },
    failedFileLabels,
    changedFileLabels,
    failedHunkSummaries,
    runtimeReceiptMarkers: (input.runtimeReceiptMarkers ?? [])
      .map((marker) => redactAndBudget(marker, 180).value)
      .filter((marker) => marker.startsWith("runtime-receipt-")),
    snapshotRecoveryAvailability: input.snapshotRecoveryAvailability ?? "unknown",
    redactionStatus: "redacted-and-budgeted",
    omittedContentReasons: Array.from(omittedContentReasons),
    budget: {
      maxFailureExcerptChars,
      usedFailureExcerptChars: redactedReason.value.length,
      maxFiles,
      maxHunks,
    },
    safeSummary,
    transcriptSummary,
    evidence: [
      `edit-repair-context:status:${status}`,
      `edit-repair-context:id:${repairContextId}`,
      `edit-repair-context:verification:${input.verification.status}`,
      `edit-repair-context:failed-file-count:${failedFileLabels.length}`,
      `edit-repair-context:changed-file-count:${changedFileLabels.length}`,
      `edit-repair-context:failed-hunk-count:${failedHunkSummaries.length}`,
      "edit-repair-context:mutation:not-run",
      "edit-repair-context:redacted-and-budgeted",
      "edit-repair-context:raw-content-excluded",
      "edit-repair-context:provider-config-excluded",
      "edit-repair-context:credentials-excluded",
    ],
  };
}

export function buildEditRepairContextFromCodingResult(input: {
  readonly codingResult: CodingResultSummary;
  readonly sourceTransactionId?: string;
  readonly sourceProposalId?: string;
  readonly maxFailureExcerptChars?: number;
}): EditRepairContext {
  const receiptMarkers = [
    ...input.codingResult.evidence,
    ...input.codingResult.continuation.evidence,
  ].filter((entry) => entry.startsWith("runtime-receipt-"));
  return buildEditRepairContext({
    sourceTransactionId: input.sourceTransactionId,
    sourceProposalId: input.sourceProposalId,
    verification: input.codingResult.verification,
    failedFiles: [
      ...input.codingResult.failedFiles,
      ...input.codingResult.unverifiedFiles,
    ],
    changedFiles: input.codingResult.changedFiles,
    runtimeReceiptMarkers: receiptMarkers,
    failureExcerpt:
      input.codingResult.verification.reason ??
      input.codingResult.failedFiles[0]?.reason ??
      input.codingResult.failureBoundary,
    snapshotRecoveryAvailability:
      input.codingResult.recoverySurface?.explicitRestoreAvailable
        ? "available"
        : input.codingResult.changedFiles.length > 0
          ? "partial"
          : "unknown",
    maxFailureExcerptChars: input.maxFailureExcerptChars,
  });
}

function classifyRepairContextStatus(input: {
  readonly verificationStatus: CodingVerificationSummary["status"];
  readonly overBudget: boolean;
  readonly hasFailureFacts: boolean;
}): EditRepairContextStatus {
  if (input.overBudget) {
    return "repair-context-over-budget";
  }
  if (input.verificationStatus === "passed" || input.verificationStatus === "not-requested") {
    return "repair-not-needed";
  }
  if (!input.hasFailureFacts) {
    return "repair-unsupported";
  }
  return "repair-context-created";
}

function redactAndBudget(
  value: string,
  maxChars: number,
): { readonly value: string; readonly omitted: boolean } {
  const redacted = redactProviderEditText(value)
    .replace(/\s+/g, " ")
    .trim();
  if (redacted.length <= maxChars) {
    return { value: redacted, omitted: false };
  }
  return {
    value: `${redacted.slice(0, maxChars)} [truncated]`,
    omitted: true,
  };
}

function buildRepairContextId(input: {
  readonly sourceTransactionId?: string;
  readonly sourceProposalId?: string;
  readonly verificationStatus: string;
  readonly failedFileLabels: readonly string[];
  readonly changedFileLabels: readonly string[];
  readonly failedHunkIds: readonly string[];
  readonly reason: string;
}): string {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 12);
  return `edit-repair-context-${hash}`;
}
