import type { PatchFailure } from "../patchParsing/types.js";
import type { SingleFileApplyPatchBaseEvidence } from "./baseEvidence.js";
import type { SingleFileApplyPatchStaleReadResult } from "./singleFileApplyPatchStaleRead.js";
import type {
  SingleFileUpdatePatchReadinessContract,
  SingleFileUpdatePatchResultRecord,
} from "./readiness.js";

export type SingleFileUpdatePatchApprovalDecision =
  | "pending"
  | "approved"
  | "denied"
  | "blocked";

export interface SingleFileUpdatePatchApprovalMetadata {
  readonly auditSafe: true;
  readonly filepath?: string;
  readonly diff: string;
  readonly previewSummary: readonly string[];
  readonly files: readonly SingleFileUpdatePatchApprovalFileMetadata[];
  readonly additions: number;
  readonly deletions: number;
  readonly singleFileOnly: true;
  readonly unsupportedOperations: readonly ["multi-file", "add", "delete", "move"];
  readonly willWrite: false;
  readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
  readonly staleReadPrecondition?: SingleFileUpdatePatchStaleReadPrecondition;
}

export interface SingleFileUpdatePatchStaleReadPrecondition {
  readonly required: true;
  readonly phase: "write-decision-dry-run";
  readonly requiredBefore: "write-decision";
  readonly blocksWriteOn: readonly ["stale-read", "target-missing"];
}

export interface SingleFileUpdatePatchApprovalFileMetadata {
  readonly path: string;
  readonly operationKind: "update";
  readonly summary: string;
  readonly additions: number;
  readonly deletions: number;
}

export interface SingleFileUpdatePatchApprovalContract {
  readonly capability: "single-file-update-apply-patch-production-gate";
  readonly permissionKind: "edit";
  readonly operationKind: "update";
  readonly targetPath?: string;
  readonly patterns: readonly string[];
  readonly decision: SingleFileUpdatePatchApprovalDecision;
  readonly metadata: SingleFileUpdatePatchApprovalMetadata;
  readonly writeIntent: {
    readonly authorized: boolean;
    readonly count: number;
  };
  readonly nextAction: string;
}

export type SingleFileUpdatePatchSurfaceBlocker =
  | "approval-denied"
  | "ambiguous-target"
  | "patch-context-missing"
  | "patch-target-missing"
  | "unsupported-patch-shape"
  | "production-gate-not-wired";

export interface SingleFileUpdatePatchResultSurfaceContract {
  readonly status: "ready" | "blocked";
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly PatchFailure[];
  readonly patches: readonly SingleFileUpdatePatchResultRecord[];
  readonly evidence: readonly string[];
  readonly nextAction: string;
  readonly doNext: string;
  readonly failureCategory?: SingleFileUpdatePatchSurfaceBlocker;
  readonly blocker?: SingleFileUpdatePatchSurfaceBlocker;
  readonly noWriteProof: {
    readonly willWrite: false;
    readonly writeIntentCount: number;
    readonly blockedWrites: boolean;
    readonly reason: string;
  };
}

export function buildSingleFileUpdatePatchApprovalContract(
  readiness: SingleFileUpdatePatchReadinessContract,
  input: {
    readonly decision?: SingleFileUpdatePatchApprovalDecision;
    readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
    readonly staleRead?: SingleFileApplyPatchStaleReadResult;
  } = {},
): SingleFileUpdatePatchApprovalContract {
  const baseEvidence = input.baseEvidence ?? input.staleRead?.baseEvidence;
  const decision = approvalDecision(readiness, input);
  const metadata = buildApprovalMetadata(readiness, {
    baseEvidence,
  });
  const authorized = decision === "approved" && readiness.ready && !baseEvidence;

  return {
    capability: "single-file-update-apply-patch-production-gate",
    permissionKind: "edit",
    operationKind: "update",
    targetPath: readiness.permissionMetadata.targetPath,
    patterns: readiness.permissionMetadata.targetPath
      ? [readiness.permissionMetadata.targetPath]
      : [],
    decision,
    metadata,
    writeIntent: {
      authorized,
      count: authorized ? readiness.noPartial.writeIntents : 0,
    },
    nextAction: approvalNextAction(decision),
  };
}

export function buildSingleFileUpdatePatchResultSurfaceContract(input: {
  readonly readiness: SingleFileUpdatePatchReadinessContract;
  readonly approval?: SingleFileUpdatePatchApprovalContract;
}): SingleFileUpdatePatchResultSurfaceContract {
  const approval =
    input.approval ??
    buildSingleFileUpdatePatchApprovalContract(input.readiness);

  if (approval.decision === "denied") {
    return blockedSurface({
      readiness: input.readiness,
      approval,
      failureCategory: "approval-denied",
      reason: "Approval denied for single-file Update File patch.",
      nextAction:
        "Ask the user to approve the single-file update before any write is attempted.",
    });
  }

  if (!input.readiness.ready || approval.decision === "blocked") {
    const failureCategory = surfaceBlockerFromFailures(
      input.readiness.result.failedFiles,
    );
    return blockedSurface({
      readiness: input.readiness,
      approval,
      failureCategory,
      reason:
        input.readiness.result.failedFiles[0]?.message ??
        "Single-file Update File patch is blocked before production wiring.",
      nextAction: input.readiness.result.nextAction,
    });
  }

  return {
    status: "ready",
    changedFiles: input.readiness.result.changedFiles,
    failedFiles: [],
    patches: input.readiness.result.patches,
    evidence: [
      ...input.readiness.result.evidence,
      "apply-patch-production-gate:approval-metadata-ready",
      "apply-patch-production-gate:result-surface-ready",
      "apply-patch-production-gate:no-production-wiring",
    ],
    nextAction:
      "Keep production apply_patch rejected until this contract is wired through approval, stale-read, result mapping, and session runtime gates.",
    doNext:
      "Wire only a dry-run production gate next; do not write until explicit approval and stale-read revalidation are proven.",
    noWriteProof: {
      willWrite: false,
      writeIntentCount:
        approval.decision === "approved" ? input.readiness.noPartial.writeIntents : 0,
      blockedWrites: false,
      reason: "Contract-only production gate; no disk write is performed.",
    },
  };
}

function buildApprovalMetadata(
  readiness: SingleFileUpdatePatchReadinessContract,
  input: {
    readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
  } = {},
): SingleFileUpdatePatchApprovalMetadata {
  const targetPath = readiness.permissionMetadata.targetPath;
  const summary = readiness.permissionMetadata.previewSummary[0];
  const files =
    targetPath && summary
      ? [
          {
            path: targetPath,
            operationKind: "update" as const,
            summary,
            additions: readiness.permissionMetadata.additions,
            deletions: readiness.permissionMetadata.deletions,
          },
        ]
      : [];

  return {
    auditSafe: true,
    filepath: targetPath,
    diff: buildDiffSummary(readiness),
    previewSummary: readiness.permissionMetadata.previewSummary,
    files,
    additions: readiness.permissionMetadata.additions,
    deletions: readiness.permissionMetadata.deletions,
    singleFileOnly: true,
    unsupportedOperations: readiness.permissionMetadata.unsupportedOperations,
    willWrite: false,
    ...(input.baseEvidence
      ? {
          baseEvidence: input.baseEvidence,
          staleReadPrecondition: {
            required: true,
            phase: "write-decision-dry-run",
            requiredBefore: "write-decision",
            blocksWriteOn: ["stale-read", "target-missing"],
          },
        }
      : {}),
  };
}

function approvalDecision(
  readiness: SingleFileUpdatePatchReadinessContract,
  input: {
    readonly decision?: SingleFileUpdatePatchApprovalDecision;
    readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
    readonly staleRead?: SingleFileApplyPatchStaleReadResult;
  },
): SingleFileUpdatePatchApprovalDecision {
  if (!readiness.ready || input.staleRead?.status === "blocked") {
    return "blocked";
  }

  const requested = input.decision ?? "pending";
  if ((input.baseEvidence || input.staleRead) && requested === "approved") {
    return "pending";
  }
  return requested;
}

function buildDiffSummary(
  readiness: SingleFileUpdatePatchReadinessContract,
): string {
  const targetPath = readiness.permissionMetadata.targetPath ?? "(unknown)";
  const summary =
    readiness.permissionMetadata.previewSummary[0] ?? "blocked patch preview";
  return [
    summary,
    `target=${targetPath}`,
    `additions=${readiness.permissionMetadata.additions}`,
    `deletions=${readiness.permissionMetadata.deletions}`,
    "willWrite=false",
  ].join("; ");
}

function approvalNextAction(
  decision: SingleFileUpdatePatchApprovalDecision,
): string {
  switch (decision) {
    case "approved":
      return "Approval metadata is available; production wiring must still revalidate stale-read before writing.";
    case "denied":
      return "Do not write. Surface approval denial with an actionable retry path.";
    case "blocked":
      return "Do not request write approval until the patch verifies as one supported Update File operation.";
    case "pending":
      return "Request explicit edit approval using the audit-safe metadata before any write intent is authorized.";
  }
}

function blockedSurface(input: {
  readonly readiness: SingleFileUpdatePatchReadinessContract;
  readonly approval: SingleFileUpdatePatchApprovalContract;
  readonly failureCategory: SingleFileUpdatePatchSurfaceBlocker;
  readonly reason: string;
  readonly nextAction: string;
}): SingleFileUpdatePatchResultSurfaceContract {
  const failedFiles =
    input.readiness.result.failedFiles.length > 0
      ? input.readiness.result.failedFiles
      : [
          {
            code: "patch-apply-plan-not-verified" as const,
            path: input.readiness.permissionMetadata.targetPath,
            message: input.reason,
            nextAction: input.nextAction,
          },
        ];

  return {
    status: "blocked",
    changedFiles: [],
    failedFiles,
    patches: input.readiness.result.patches,
    evidence: [
      ...input.readiness.result.evidence,
      `apply-patch-production-gate:blocker:${input.failureCategory}`,
      "apply-patch-production-gate:no-write",
      "apply-patch-production-gate:no-production-wiring",
    ],
    nextAction: input.nextAction,
    doNext: input.nextAction,
    failureCategory: input.failureCategory,
    blocker: input.failureCategory,
    noWriteProof: {
      willWrite: false,
      writeIntentCount: input.approval.writeIntent.count,
      blockedWrites: true,
      reason: input.reason,
    },
  };
}

function surfaceBlockerFromFailures(
  failures: readonly PatchFailure[],
): SingleFileUpdatePatchSurfaceBlocker {
  const code = failures[0]?.code;
  switch (code) {
    case "patch-verify-hunk-context-ambiguous":
      return "ambiguous-target";
    case "patch-verify-hunk-context-missing":
      return "patch-context-missing";
    case "patch-verify-file-missing":
      return "patch-target-missing";
    case "patch-apply-plan-not-verified":
    case "patch-parse-empty":
    case "patch-parse-invalid-format":
    case "patch-parse-unsupported-operation":
    case "patch-verify-operation-unsupported":
    case "patch-add-file-not-enabled":
    case "patch-add-file-parent-missing":
    case "patch-add-file-target-exists":
      return "unsupported-patch-shape";
    default:
      return "production-gate-not-wired";
  }
}
