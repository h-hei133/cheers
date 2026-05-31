import type { SingleFileApplyPatchFinalStaleReadResult } from "../../edit/write/runtime/finalRead.js";
import type { SingleFileApplyPatchPermissionUxContract } from "../../edit/authority/approval/permission.js";

export type SingleFileApplyPatchWriterBoundaryBlockedBy =
  | "permission"
  | "final-stale-read"
  | "unsupported-operation"
  | "not-production-wiring";

export type SingleFileApplyPatchUnsupportedOperation =
  | "multi-file"
  | "add"
  | "delete"
  | "move"
  | "unsupported-patch-shape";

export interface SingleFileApplyPatchSingleFileUpdateIntentCandidate {
  readonly candidatePresent: true;
  readonly operationKind: "update";
  readonly targetPath: string;
  readonly singleFileOnly: true;
}

export interface SingleFileApplyPatchWriterBoundaryOptions {
  readonly permissionUx: SingleFileApplyPatchPermissionUxContract;
  readonly finalStaleRead: SingleFileApplyPatchFinalStaleReadResult;
  readonly singleFileUpdateIntentCandidate?: SingleFileApplyPatchSingleFileUpdateIntentCandidate;
  readonly unsupportedOperation?: SingleFileApplyPatchUnsupportedOperation;
  readonly productionWiringApproved?: false;
}

export interface SingleFileApplyPatchWriterBoundaryContract {
  readonly source: "single-file-apply-patch-writer-boundary-proof";
  readonly writerReachable: false;
  readonly writerReachabilityReason: string;
  readonly blockedBy: SingleFileApplyPatchWriterBoundaryBlockedBy;
  readonly permissionDecision: SingleFileApplyPatchPermissionUxContract["permissionDecision"];
  readonly finalRevalidation: SingleFileApplyPatchFinalStaleReadResult["finalRevalidation"];
  readonly unsupportedOperation?: SingleFileApplyPatchUnsupportedOperation;
  readonly singleFileUpdateIntentCandidate?: SingleFileApplyPatchSingleFileUpdateIntentCandidate;
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly noWriterInvoked: true;
  readonly noAppliedPatchRecord: true;
  readonly doesNotClaimWriteSuccess: true;
  readonly doesNotClaimProductionWriteReady: true;
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export function buildSingleFileApplyPatchWriterBoundaryContract(
  options: SingleFileApplyPatchWriterBoundaryOptions,
): SingleFileApplyPatchWriterBoundaryContract {
  const blockedBy = writerBlockedBy(options);
  const writerReachabilityReason = writerReason(options, blockedBy);
  const nextAction = writerNextAction(blockedBy);

  return {
    source: "single-file-apply-patch-writer-boundary-proof",
    writerReachable: false,
    writerReachabilityReason,
    blockedBy,
    permissionDecision: options.permissionUx.permissionDecision,
    finalRevalidation: options.finalStaleRead.finalRevalidation,
    ...(options.unsupportedOperation
      ? { unsupportedOperation: options.unsupportedOperation }
      : {}),
    ...(options.singleFileUpdateIntentCandidate
      ? { singleFileUpdateIntentCandidate: options.singleFileUpdateIntentCandidate }
      : {}),
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    noWriterInvoked: true,
    noAppliedPatchRecord: true,
    doesNotClaimWriteSuccess: true,
    doesNotClaimProductionWriteReady: true,
    nextAction,
    doNext: nextAction,
    evidence: writerEvidence(options, blockedBy),
  };
}

function writerBlockedBy(
  options: SingleFileApplyPatchWriterBoundaryOptions,
): SingleFileApplyPatchWriterBoundaryBlockedBy {
  if (!permissionAllowsBoundaryCheck(options.permissionUx)) {
    return "permission";
  }
  if (options.finalStaleRead.finalRevalidation === "blocked") {
    return "final-stale-read";
  }
  if (options.unsupportedOperation) {
    return "unsupported-operation";
  }
  return "not-production-wiring";
}

function permissionAllowsBoundaryCheck(
  permissionUx: SingleFileApplyPatchPermissionUxContract,
): boolean {
  return (
    permissionUx.permissionDecision === "pending" &&
    permissionUx.approvalTokenPrepared &&
    permissionUx.baseEvidenceDigestBound &&
    permissionUx.staleReadPreconditionRequired
  );
}

function writerReason(
  options: SingleFileApplyPatchWriterBoundaryOptions,
  blockedBy: SingleFileApplyPatchWriterBoundaryBlockedBy,
): string {
  switch (blockedBy) {
    case "permission":
      return "Writer is unreachable because explicit permission UX has not produced a digest-bound prepared approval token.";
    case "final-stale-read":
      return `Writer is unreachable because final stale-read revalidation is blocked by ${options.finalStaleRead.blocker ?? "unknown"}.`;
    case "unsupported-operation":
      return `Writer is unreachable because ${options.unsupportedOperation ?? "unsupported operation"} is outside the single-file update route.`;
    case "not-production-wiring":
      return "Writer is unreachable because this contract does not approve production wiring, even when permission and final stale-read prerequisites pass.";
  }
}

function writerNextAction(
  blockedBy: SingleFileApplyPatchWriterBoundaryBlockedBy): string {
  switch (blockedBy) {
    case "permission":
      return "Return to explicit permission UX and prepare digest-bound approval before considering a writer boundary.";
    case "final-stale-read":
      return "Re-read the target and rerun the dry-run preview before any future writer boundary decision.";
    case "unsupported-operation":
      return "Reject unsupported apply_patch shapes; only a separately approved single-file update route may proceed.";
    case "not-production-wiring":
      return "Keep writer unreachable until a separate production write wiring review explicitly approves the writer boundary.";
  }
}

function writerEvidence(
  options: SingleFileApplyPatchWriterBoundaryOptions,
  blockedBy: SingleFileApplyPatchWriterBoundaryBlockedBy,
): readonly string[] {
  return [
    "apply-patch-writer-boundary:contract-only",
    `apply-patch-writer-boundary:blocked-by:${blockedBy}`,
    "apply-patch-writer-boundary:writer-reachable-false",
    "apply-patch-writer-boundary:will-write-false",
    "apply-patch-writer-boundary:changed-files-empty",
    "apply-patch-writer-boundary:write-intents-empty",
    "apply-patch-writer-boundary:no-writer-invoked",
    "apply-patch-writer-boundary:no-applied-patch-record",
    "apply-patch-writer-boundary:no-write-success-claim",
    "apply-patch-writer-boundary:not-production-write-ready",
    `apply-patch-writer-boundary:permission:${options.permissionUx.permissionDecision}`,
    `apply-patch-writer-boundary:final-revalidation:${options.finalStaleRead.finalRevalidation}`,
    ...(options.unsupportedOperation
      ? [`apply-patch-writer-boundary:unsupported:${options.unsupportedOperation}`]
      : []),
    ...(options.singleFileUpdateIntentCandidate
      ? ["apply-patch-writer-boundary:single-file-update-candidate-present"]
      : []),
  ];
}
