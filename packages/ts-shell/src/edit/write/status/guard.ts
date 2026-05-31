import type { WriteDecisionGate } from "../../authority/approval/decision.js";

export type GuardedWriteGateStatus = "ready" | "blocked";

export type GuardedWriteGateBlocker =
  | "explicit-opt-in-missing"
  | "write-decision-not-approved"
  | "base-evidence-missing"
  | "stale-read-precondition-missing"
  | "unsupported-operation"
  | "default-rejection-regression";

export interface GuardedWriteGateOptions {
  readonly explicitOptIn: boolean;
  readonly writeDecision: WriteDecisionGate;
  readonly singleFileUpdateOnly: boolean;
  readonly defaultProductionRejectionUnchanged: boolean;
  readonly promptText?: string;
}

export interface GuardedWriteGate {
  readonly source: "single-file-apply-patch-guarded-write-gate";
  readonly status: GuardedWriteGateStatus;
  readonly explicitOptIn: boolean;
  readonly writeDecisionStatus: WriteDecisionGate["status"];
  readonly blocker?: GuardedWriteGateBlocker;
  readonly targetPath?: string;
  readonly singleFileUpdateOnly: boolean;
  readonly defaultProductionRejectionUnchanged: boolean;
  readonly approvedForWriteRequired: true;
  readonly finalStaleReadRequiredAfterApproval: true;
  readonly writerBoundaryRequired: true;
  readonly promptApprovalIgnored: true;
  readonly approvalMetadataDoesNotAuthorizeWrite: true;
  readonly dryRunDoesNotAuthorizeWrite: true;
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly noWriterInvoked: true;
  readonly noAppliedPatchRecord: true;
  readonly doesNotClaimMutationSuccess: true;
  readonly doesNotClaimWriteSuccess: true;
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export function buildGuardedWriteGate(
  options: GuardedWriteGateOptions,
): GuardedWriteGate {
  const blocker = gateBlocker(options);
  const status: GuardedWriteGateStatus = blocker ? "blocked" : "ready";
  const nextAction = gateNextAction(blocker);

  return {
    source: "single-file-apply-patch-guarded-write-gate",
    status,
    explicitOptIn: options.explicitOptIn,
    writeDecisionStatus: options.writeDecision.status,
    ...(blocker ? { blocker } : {}),
    ...(options.writeDecision.baseEvidence?.targetPath
      ? { targetPath: options.writeDecision.baseEvidence.targetPath }
      : {}),
    singleFileUpdateOnly: options.singleFileUpdateOnly,
    defaultProductionRejectionUnchanged:
      options.defaultProductionRejectionUnchanged,
    approvedForWriteRequired: true,
    finalStaleReadRequiredAfterApproval: true,
    writerBoundaryRequired: true,
    promptApprovalIgnored: true,
    approvalMetadataDoesNotAuthorizeWrite: true,
    dryRunDoesNotAuthorizeWrite: true,
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    noWriterInvoked: true,
    noAppliedPatchRecord: true,
    doesNotClaimMutationSuccess: true,
    doesNotClaimWriteSuccess: true,
    nextAction,
    doNext: nextAction,
    evidence: [
      "apply-patch-guarded-write-gate:contract",
      `apply-patch-guarded-write-gate:status:${status}`,
      `apply-patch-guarded-write-gate:write-decision:${options.writeDecision.status}`,
      "apply-patch-guarded-write-gate:explicit-opt-in-required",
      "apply-patch-guarded-write-gate:approved-for-write-required",
      "apply-patch-guarded-write-gate:final-stale-read-required-after-approval",
      "apply-patch-guarded-write-gate:writer-boundary-required",
      "apply-patch-guarded-write-gate:no-prompt-keyword-approval",
      "apply-patch-guarded-write-gate:approval-metadata-not-write-authorization",
      "apply-patch-guarded-write-gate:dry-run-not-write-authorization",
      "apply-patch-guarded-write-gate:will-write-false",
      "apply-patch-guarded-write-gate:changed-files-empty",
      "apply-patch-guarded-write-gate:write-intents-empty",
      "apply-patch-guarded-write-gate:no-writer-invoked",
      "apply-patch-guarded-write-gate:no-applied-patch-record",
      "apply-patch-guarded-write-gate:no-success-claim",
      ...(options.promptText
        ? ["apply-patch-guarded-write-gate:prompt-text-ignored"]
        : []),
      ...(options.singleFileUpdateOnly
        ? ["apply-patch-guarded-write-gate:single-file-update-only"]
        : ["apply-patch-guarded-write-gate:unsupported-operation"]),
      ...(options.writeDecision.baseEvidence?.targetPath
        ? ["apply-patch-guarded-write-gate:approval-bound-target"]
        : []),
      ...(options.defaultProductionRejectionUnchanged
        ? ["apply-patch-guarded-write-gate:default-production-rejection-unchanged"]
        : ["apply-patch-guarded-write-gate:default-rejection-regression"]),
      ...(blocker
        ? [`apply-patch-guarded-write-gate:blocker:${blocker}`]
        : []),
    ],
  };
}

function gateBlocker(
  options: GuardedWriteGateOptions,
): GuardedWriteGateBlocker | undefined {
  if (!options.explicitOptIn) {
    return "explicit-opt-in-missing";
  }
  if (options.writeDecision.status !== "approved-for-write") {
    return "write-decision-not-approved";
  }
  if (!options.writeDecision.baseEvidenceDigestBound) {
    return "base-evidence-missing";
  }
  if (!options.writeDecision.staleReadPreconditionBound) {
    return "stale-read-precondition-missing";
  }
  if (!options.singleFileUpdateOnly) {
    return "unsupported-operation";
  }
  if (!options.defaultProductionRejectionUnchanged) {
    return "default-rejection-regression";
  }
  return undefined;
}

function gateNextAction(
  blocker: GuardedWriteGateBlocker | undefined,
): string {
  switch (blocker) {
    case "explicit-opt-in-missing":
      return "Keep default production apply_patch rejected unless the guarded write lane is explicitly opted in.";
    case "write-decision-not-approved":
      return "Do not write. Return to permission UX and require explicit approved-for-write.";
    case "base-evidence-missing":
      return "Regenerate the preview so the guarded write gate can bind base evidence.";
    case "stale-read-precondition-missing":
      return "Bind the stale-read precondition before considering the guarded write lane.";
    case "unsupported-operation":
      return "Reject the patch. The guarded write lane only accepts one Update File operation.";
    case "default-rejection-regression":
      return "Stop. Preserve default production apply_patch and unified diff rejection before enabling any guarded lane.";
    case undefined:
      return "Run final stale-read immediately before the guarded writer and allow success only after verified write.";
  }
}
