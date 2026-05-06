import type { SingleFileApplyPatchBaseEvidence } from "./baseEvidence.js";
import type { SingleFileApplyPatchPermissionUxContract } from "./singleFileApplyPatchPermissionUxContract.js";
import type { SingleFileUpdatePatchStaleReadPrecondition } from "./productionGate.js";

export type WriteDecisionGateStatus =
  | "pending"
  | "denied"
  | "blocked"
  | "approved-for-write";

export type WriteDecisionGateBlocker =
  | "explicit-approval-missing"
  | "permission-not-ready"
  | "base-evidence-missing"
  | "stale-read-precondition-missing";

export interface WriteDecisionGateOptions {
  readonly permissionUx: SingleFileApplyPatchPermissionUxContract;
  readonly explicitApprovedForWrite: boolean;
  readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
  readonly staleReadPrecondition?: SingleFileUpdatePatchStaleReadPrecondition;
  readonly promptText?: string;
}

export interface WriteDecisionGate {
  readonly source: "single-file-apply-patch-write-decision-gate";
  readonly status: WriteDecisionGateStatus;
  readonly permissionDecision: SingleFileApplyPatchPermissionUxContract["permissionDecision"];
  readonly explicitApprovedForWrite: boolean;
  readonly blocker?: WriteDecisionGateBlocker;
  readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
  readonly baseEvidenceDigestBound: boolean;
  readonly staleReadPrecondition?: SingleFileUpdatePatchStaleReadPrecondition;
  readonly staleReadPreconditionBound: boolean;
  readonly finalStaleReadRequired: true;
  readonly finalStaleReadRequiredAfterApproval: true;
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

export function buildWriteDecisionGate(
  options: WriteDecisionGateOptions,
): WriteDecisionGate {
  const baseEvidence = options.baseEvidence ?? options.permissionUx.baseEvidence;
  const staleReadPrecondition =
    options.staleReadPrecondition ?? options.permissionUx.staleReadPrecondition;
  const blocker = gateBlocker({
    permissionUx: options.permissionUx,
    explicitApprovedForWrite: options.explicitApprovedForWrite,
    baseEvidence,
    staleReadPrecondition,
  });
  const status = gateStatus({
    permissionUx: options.permissionUx,
    explicitApprovedForWrite: options.explicitApprovedForWrite,
    blocker,
  });
  const nextAction = gateNextAction(status, blocker);

  return {
    source: "single-file-apply-patch-write-decision-gate",
    status,
    permissionDecision: options.permissionUx.permissionDecision,
    explicitApprovedForWrite: options.explicitApprovedForWrite,
    ...(blocker ? { blocker } : {}),
    ...(baseEvidence ? { baseEvidence } : {}),
    baseEvidenceDigestBound: baseEvidence !== undefined,
    ...(staleReadPrecondition ? { staleReadPrecondition } : {}),
    staleReadPreconditionBound: staleReadPrecondition !== undefined,
    finalStaleReadRequired: true,
    finalStaleReadRequiredAfterApproval: true,
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
      "apply-patch-write-decision:contract",
      `apply-patch-write-decision:status:${status}`,
      `apply-patch-write-decision:permission:${options.permissionUx.permissionDecision}`,
      "apply-patch-write-decision:final-stale-read-required-after-approval",
      "apply-patch-write-decision:no-prompt-keyword-approval",
      "apply-patch-write-decision:approval-metadata-not-write-authorization",
      "apply-patch-write-decision:dry-run-not-write-authorization",
      "apply-patch-write-decision:will-write-false",
      "apply-patch-write-decision:changed-files-empty",
      "apply-patch-write-decision:write-intents-empty",
      "apply-patch-write-decision:no-writer-invoked",
      "apply-patch-write-decision:no-applied-patch-record",
      "apply-patch-write-decision:no-success-claim",
      ...(options.promptText
        ? ["apply-patch-write-decision:prompt-text-ignored"]
        : []),
      ...(baseEvidence
        ? ["apply-patch-write-decision:base-evidence-digest-bound"]
        : ["apply-patch-write-decision:base-evidence-missing"]),
      ...(staleReadPrecondition
        ? ["apply-patch-write-decision:stale-read-precondition-bound"]
        : ["apply-patch-write-decision:stale-read-precondition-missing"]),
      ...(blocker ? [`apply-patch-write-decision:blocker:${blocker}`] : []),
    ],
  };
}

function gateBlocker(input: {
  readonly permissionUx: SingleFileApplyPatchPermissionUxContract;
  readonly explicitApprovedForWrite: boolean;
  readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
  readonly staleReadPrecondition?: SingleFileUpdatePatchStaleReadPrecondition;
}): WriteDecisionGateBlocker | undefined {
  if (!input.explicitApprovedForWrite) {
    return "explicit-approval-missing";
  }
  if (
    input.permissionUx.permissionDecision !== "pending" ||
    !input.permissionUx.approvalTokenPrepared
  ) {
    return "permission-not-ready";
  }
  if (!input.baseEvidence) {
    return "base-evidence-missing";
  }
  if (!input.staleReadPrecondition) {
    return "stale-read-precondition-missing";
  }
  return undefined;
}

function gateStatus(input: {
  readonly permissionUx: SingleFileApplyPatchPermissionUxContract;
  readonly explicitApprovedForWrite: boolean;
  readonly blocker?: WriteDecisionGateBlocker;
}): WriteDecisionGateStatus {
  if (input.permissionUx.permissionDecision === "denied") {
    return "denied";
  }
  if (input.permissionUx.permissionDecision === "blocked") {
    return "blocked";
  }
  if (!input.explicitApprovedForWrite || input.blocker) {
    return "pending";
  }
  return "approved-for-write";
}

function gateNextAction(
  status: WriteDecisionGateStatus,
  blocker: WriteDecisionGateBlocker | undefined,
): string {
  switch (status) {
    case "approved-for-write":
      return "Run final stale-read revalidation after approval and before any isolated fixture writer call.";
    case "denied":
      return "Do not write. Surface the denial and require a fresh dry-run preview before any future approval.";
    case "blocked":
      return "Do not write. Resolve the blocked permission UX path before any write decision.";
    case "pending":
      switch (blocker) {
        case "explicit-approval-missing":
          return "Request explicit approved-for-write input; prompt text and approval metadata are not write authorization.";
        case "permission-not-ready":
          return "Return to permission UX and prepare digest-bound approval evidence before write decision.";
        case "base-evidence-missing":
          return "Regenerate the dry-run preview so the write decision can bind digest-only base evidence.";
        case "stale-read-precondition-missing":
          return "Bind stale-read precondition metadata before any approved-for-write decision.";
        case undefined:
          return "Wait for explicit approved-for-write input before the final stale-read preflight.";
      }
  }
}
