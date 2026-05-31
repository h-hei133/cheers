import type { SingleFileApplyPatchBaseEvidence } from "../../../evidence/projection/patch/base.js";
import type { SingleFileApplyPatchDryRunResult } from "../../patch/apply/dryRun.js";
import type { SingleFileApplyPatchTerminalSurface } from "../../../result/projection/patch/terminal.js";
import type {
  SingleFileUpdatePatchApprovalContract,
  SingleFileUpdatePatchApprovalDecision,
  SingleFileUpdatePatchApprovalMetadata,
  SingleFileUpdatePatchStaleReadPrecondition,
} from "./production.js";

export type SingleFileApplyPatchPermissionUxDecision =
  | "pending"
  | "denied"
  | "blocked";

export type SingleFileApplyPatchRequestedUserDecision =
  | SingleFileApplyPatchPermissionUxDecision
  | "approved";

export type SingleFileApplyPatchPermissionUxBlocker =
  | "base-evidence-missing"
  | "stale-read-precondition-missing"
  | "approval-metadata-blocked";

export interface SingleFileApplyPatchPermissionUxContractOptions {
  readonly dryRunResult?: SingleFileApplyPatchDryRunResult;
  readonly terminalSurface?: SingleFileApplyPatchTerminalSurface;
  readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
  readonly approvalMetadata?: SingleFileUpdatePatchApprovalMetadata;
  readonly approval?: SingleFileUpdatePatchApprovalContract;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly staleReadPrecondition?: SingleFileUpdatePatchStaleReadPrecondition;
  readonly promptText?: string;
}

export interface SingleFileApplyPatchPermissionUxContract {
  readonly source: "single-file-apply-patch-explicit-permission-ux-contract";
  readonly permissionDecision: SingleFileApplyPatchPermissionUxDecision;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly approvalReady: false;
  readonly approvalTokenPrepared: boolean;
  readonly baseEvidenceDigestBound: boolean;
  readonly staleReadPreconditionRequired: boolean;
  readonly staleReadPrecondition?: SingleFileUpdatePatchStaleReadPrecondition;
  readonly writeIntent: {
    readonly authorized: false;
    readonly count: 0;
  };
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly noWriterInvoked: true;
  readonly doesNotClaimProductionWriteReady: true;
  readonly doesNotInferApprovalFromPrompt: true;
  readonly requestedApprovedDoesNotAuthorizeWrite: true;
  readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
  readonly blocker?: SingleFileApplyPatchPermissionUxBlocker;
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export function buildSingleFileApplyPatchPermissionUxContract(
  options: SingleFileApplyPatchPermissionUxContractOptions,
): SingleFileApplyPatchPermissionUxContract {
  const approvalMetadata = options.approvalMetadata ?? options.approval?.metadata;
  const baseEvidence =
    options.baseEvidence ??
    approvalMetadata?.baseEvidence ??
    options.terminalSurface?.baseEvidence ??
    options.dryRunResult?.baseEvidence;
  const staleReadPrecondition =
    options.staleReadPrecondition ??
    approvalMetadata?.staleReadPrecondition ??
    options.terminalSurface?.staleReadPrecondition;
  const metadataDecision = options.approval?.decision;
  const blocker = permissionUxBlocker({
    baseEvidence,
    staleReadPrecondition,
    metadataDecision,
  });
  const permissionDecision = permissionUxDecision({
    requestedUserDecision: options.requestedUserDecision,
    metadataDecision,
    blocker,
  });
  const approvalTokenPrepared =
    permissionDecision === "pending" &&
    options.requestedUserDecision === "approved" &&
    baseEvidence !== undefined &&
    staleReadPrecondition !== undefined;
  const nextAction = permissionUxNextAction({
    permissionDecision,
    blocker,
    approvalTokenPrepared,
  });

  return {
    source: "single-file-apply-patch-explicit-permission-ux-contract",
    permissionDecision,
    ...(options.requestedUserDecision
      ? { requestedUserDecision: options.requestedUserDecision }
      : {}),
    approvalReady: false,
    approvalTokenPrepared,
    baseEvidenceDigestBound: baseEvidence !== undefined,
    staleReadPreconditionRequired: staleReadPrecondition !== undefined,
    ...(staleReadPrecondition ? { staleReadPrecondition } : {}),
    writeIntent: {
      authorized: false,
      count: 0,
    },
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    noWriterInvoked: true,
    doesNotClaimProductionWriteReady: true,
    doesNotInferApprovalFromPrompt: true,
    requestedApprovedDoesNotAuthorizeWrite: true,
    ...(baseEvidence ? { baseEvidence } : {}),
    ...(blocker ? { blocker } : {}),
    nextAction,
    doNext: nextAction,
    evidence: permissionUxEvidence({
      permissionDecision,
      blocker,
      baseEvidence,
      staleReadPrecondition,
      requestedUserDecision: options.requestedUserDecision,
      promptText: options.promptText,
    }),
  };
}

function permissionUxBlocker(input: {
  readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
  readonly staleReadPrecondition?: SingleFileUpdatePatchStaleReadPrecondition;
  readonly metadataDecision?: SingleFileUpdatePatchApprovalDecision;
}): SingleFileApplyPatchPermissionUxBlocker | undefined {
  if (input.metadataDecision === "blocked") {
    return "approval-metadata-blocked";
  }
  if (!input.baseEvidence) {
    return "base-evidence-missing";
  }
  if (!input.staleReadPrecondition) {
    return "stale-read-precondition-missing";
  }
  return undefined;
}

function permissionUxDecision(input: {
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly metadataDecision?: SingleFileUpdatePatchApprovalDecision;
  readonly blocker?: SingleFileApplyPatchPermissionUxBlocker;
}): SingleFileApplyPatchPermissionUxDecision {
  if (input.blocker) {
    return "blocked";
  }
  if (input.requestedUserDecision === "denied" || input.metadataDecision === "denied") {
    return "denied";
  }
  if (input.requestedUserDecision === "blocked") {
    return "blocked";
  }
  return "pending";
}

function permissionUxNextAction(input: {
  readonly permissionDecision: SingleFileApplyPatchPermissionUxDecision;
  readonly blocker?: SingleFileApplyPatchPermissionUxBlocker;
  readonly approvalTokenPrepared: boolean;
}): string {
  if (input.blocker === "base-evidence-missing") {
    return "Block write authorization until the dry-run preview provides digest-only base evidence.";
  }
  if (input.blocker === "stale-read-precondition-missing") {
    return "Block write authorization until stale-read precondition metadata is bound to the approval prompt.";
  }
  if (input.blocker === "approval-metadata-blocked") {
    return "Do not request approval while approval metadata is blocked; regenerate a supported single-file dry-run preview.";
  }
  if (input.permissionDecision === "denied") {
    return "Do not write. Surface denial and allow the user to rerun the dry-run preview if desired.";
  }
  if (input.approvalTokenPrepared) {
    return "Record that explicit approval was requested against digest-bound evidence, then run final stale-read revalidation before any future write decision.";
  }
  return "Request explicit edit approval using digest-bound metadata; do not infer approval from prompt text or metadata alone.";
}

function permissionUxEvidence(input: {
  readonly permissionDecision: SingleFileApplyPatchPermissionUxDecision;
  readonly blocker?: SingleFileApplyPatchPermissionUxBlocker;
  readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
  readonly staleReadPrecondition?: SingleFileUpdatePatchStaleReadPrecondition;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly promptText?: string;
}): readonly string[] {
  return [
    "apply-patch-permission-ux:contract-only",
    `apply-patch-permission-ux:decision:${input.permissionDecision}`,
    "apply-patch-permission-ux:will-write-false",
    "apply-patch-permission-ux:changed-files-empty",
    "apply-patch-permission-ux:write-intents-empty",
    "apply-patch-permission-ux:no-writer-invoked",
    "apply-patch-permission-ux:not-production-write-ready",
    "apply-patch-permission-ux:no-prompt-keyword-approval",
    "apply-patch-permission-ux:requested-approved-not-write-authorization",
    ...(input.baseEvidence
      ? ["apply-patch-permission-ux:base-evidence-digest-bound"]
      : ["apply-patch-permission-ux:base-evidence-missing"]),
    ...(input.staleReadPrecondition
      ? ["apply-patch-permission-ux:stale-read-precondition-required"]
      : ["apply-patch-permission-ux:stale-read-precondition-missing"]),
    ...(input.requestedUserDecision
      ? [`apply-patch-permission-ux:requested:${input.requestedUserDecision}`]
      : []),
    ...(input.promptText
      ? ["apply-patch-permission-ux:prompt-text-ignored-for-authorization"]
      : []),
    ...(input.blocker ? [`apply-patch-permission-ux:blocker:${input.blocker}`] : []),
  ];
}
