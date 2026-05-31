import path from "node:path";
import {
  captureRecoveryAuthorityRecords,
  type RecoveryAuthorityCaptureBatchResult,
  type RecoveryAuthorityStoreConfig,
} from "../patchRecovery/recoveryAuthorityStore.js";
import {
  applySingleFileDeleteIntent,
  buildSingleFileDeleteApplicationContract,
  type SingleFileDeleteApplicationContract,
} from "../patchApplication/singleFileDeleteApply.js";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import type { PatchFailure, PatchFileOperation } from "../patchParsing/types.js";
import { verifyParsedPatch } from "../patchVerification/verify.js";
import {
  buildPerFilePatchPlan,
  type PerFilePatchPlan,
} from "./perFilePatchPlan.js";
import type { SingleFileApplyPatchRequestedUserDecision } from "./singleFileApplyPatchPermissionUxContract.js";
import type { WorkspaceWriteTargetAuthority } from "./workspaceAuthority.js";
import {
  buildWorkspaceWriteFailureState,
  type WorkspaceWriteEffect,
  type WorkspaceWriteFailurePhase,
  type WorkspaceWriteFailureState,
} from "../../edit/result/workspace/writeFailureState.js";

export type WorkspaceDeleteRouteStatus = "deleted" | "blocked";

export type WorkspaceDeleteRouteBlocker =
  | "runtime-opt-in-missing"
  | "workspace-write-opt-in-missing"
  | "write-decision"
  | "patch-parse"
  | "unsupported-operation"
  | "workspace-boundary"
  | "patch-verification"
  | "final-stale-read"
  | "aborted-before-write"
  | "recovery-authority-capture"
  | "write-application"
  | "post-write-verification";

export interface WorkspaceDeleteRouteOptions {
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
  readonly explicitRuntimeOptIn: boolean;
  readonly explicitWorkspaceWriteOptIn: boolean;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly defaultProductionRejectionUnchanged: true;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly readVerifiedFile: (relativePath: string) => string | undefined;
  readonly directoryExists?: (absolutePath: string) => boolean;
  readonly validateWriteTarget: (
    relativePath: string,
  ) => WorkspaceWriteTargetAuthority;
  readonly deleteFile: (relativePath: string) => void | Promise<void>;
  readonly recoveryAuthority?: RecoveryAuthorityStoreConfig;
  readonly abortSignal?: AbortSignal;
}

export type WorkspaceDeleteRoute =
  | {
      readonly source: "single-file-apply-patch-workspace-delete-route";
      readonly status: "deleted";
      readonly targetPath: string;
      readonly perFilePatchPlan?: PerFilePatchPlan;
      readonly recoveryAuthorityCapture?: RecoveryAuthorityCaptureBatchResult;
      readonly applicationContract: SingleFileDeleteApplicationContract;
      readonly failures: readonly [];
      readonly workspaceWriterInvoked: true;
      readonly deleteMoveInvoked: true;
      readonly writerTarget: "selected-workspace";
      readonly selectedWorkspaceWrite: true;
      readonly writerStarted: true;
      readonly writeEffect: "verified";
      readonly writeFailureState: WorkspaceWriteFailureState;
      readonly changedFiles: readonly [string];
      readonly failedFiles: readonly [];
      readonly plannedFiles: readonly [];
      readonly writeIntents: readonly [string];
      readonly appliedPatchRecord: false;
      readonly postWriteVerification: "passed";
      readonly terminalClassification: "success";
      readonly terminalSuccessAllowed: true;
      readonly mutationSuccessClaimAllowed: true;
      readonly resultSessionStatus: "write-success";
      readonly nextAction: string;
      readonly doNext: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly source: "single-file-apply-patch-workspace-delete-route";
      readonly status: "blocked";
      readonly blocker: WorkspaceDeleteRouteBlocker;
      readonly targetPath?: string;
      readonly perFilePatchPlan?: PerFilePatchPlan;
      readonly recoveryAuthorityCapture?: RecoveryAuthorityCaptureBatchResult;
      readonly applicationContract?: SingleFileDeleteApplicationContract;
      readonly failures: readonly PatchFailure[];
      readonly workspaceWriterInvoked: boolean;
      readonly deleteMoveInvoked: boolean;
      readonly writerTarget: "none" | "selected-workspace";
      readonly selectedWorkspaceWrite: boolean;
      readonly writerStarted: boolean;
      readonly writeEffect: WorkspaceWriteEffect;
      readonly writeFailureState: WorkspaceWriteFailureState;
      readonly changedFiles: readonly string[];
      readonly failedFiles: readonly PatchFailure[];
      readonly plannedFiles: readonly [];
      readonly writeIntents: readonly string[];
      readonly appliedPatchRecord: false;
      readonly postWriteVerification: "not-run" | "blocked" | "failed";
      readonly terminalClassification: "stopped";
      readonly terminalSuccessAllowed: false;
      readonly mutationSuccessClaimAllowed: false;
      readonly resultSessionStatus: "stopped";
      readonly nextAction: string;
      readonly doNext: string;
      readonly evidence: readonly string[];
    };

export function patchIsSingleDeleteFile(rawPatchText: string): boolean {
  const parsed = parseApplyPatchText(rawPatchText);
  return (
    parsed.ok === true &&
    parsed.patch.operations.length === 1 &&
    parsed.patch.operations[0]?.kind === "delete"
  );
}

export async function runWorkspaceDeleteRoute(
  options: WorkspaceDeleteRouteOptions,
): Promise<WorkspaceDeleteRoute> {
  if (options.abortSignal?.aborted) {
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase: "before-writer",
    });
    return blocked({
      blocker: "aborted-before-write",
      failures: [],
      nextAction:
        "Stop: apply_patch workspace delete was aborted before any delete writer became reachable.",
      evidence: [
        "apply-patch-workspace-delete-route:aborted-before-write",
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  if (!options.explicitRuntimeOptIn) {
    return blocked({
      blocker: "runtime-opt-in-missing",
      failures: [],
      nextAction:
        "Keep Delete File rejected unless an explicit runtime route opt-in is present.",
      evidence: ["apply-patch-workspace-delete-route:runtime-opt-in-missing"],
    });
  }

  const perFilePatchPlan = buildPerFilePatchPlan({
    workspaceRoot: options.workspaceRoot,
    rawPatchText: options.rawPatchText,
    readFile: options.readFile,
    ...(options.directoryExists
      ? { directoryExists: options.directoryExists }
      : {}),
  });

  const parsed = parseApplyPatchText(options.rawPatchText);
  if (parsed.ok === false) {
    return blocked({
      blocker: "patch-parse",
      perFilePatchPlan,
      failures: [parsed.failure],
      nextAction: parsed.failure.nextAction,
      evidence: ["apply-patch-workspace-delete-route:parse-blocked"],
    });
  }

  const deleteOperation = singleDeleteOperation(parsed.patch.operations);
  if (!deleteOperation) {
    return blocked({
      blocker: "unsupported-operation",
      perFilePatchPlan,
      failures: [unsupportedDeleteFailure(parsed.patch.operations)],
      nextAction:
        "Use exactly one Delete File operation. Update, create, move, mixed, multi-file, and broad apply_patch shapes are outside this delete route.",
      evidence: [
        "apply-patch-workspace-delete-route:unsupported-operation",
        "apply-patch-workspace-delete-route:no-writer-reachable-for-mixed-or-broad",
      ],
    });
  }

  if (!options.explicitWorkspaceWriteOptIn) {
    return blocked({
      blocker: "workspace-write-opt-in-missing",
      targetPath: deleteOperation.path,
      perFilePatchPlan,
      failures: [],
      nextAction:
        "Keep Delete File no-write unless the selected-workspace write entrypoint is explicitly opted in.",
      evidence: [
        "apply-patch-workspace-delete-route:workspace-write-opt-in-missing",
      ],
    });
  }

  if (options.requestedUserDecision !== "approved") {
    return blocked({
      blocker: "write-decision",
      targetPath: deleteOperation.path,
      perFilePatchPlan,
      failures: [],
      nextAction:
        options.requestedUserDecision === "denied"
          ? "Do not delete the file. Surface the denial and require a fresh explicit approval before any future delete."
          : "Request explicit approved-for-write input before a selected-workspace delete route can proceed.",
      evidence: [
        "apply-patch-workspace-delete-route:write-decision-blocked",
        "apply-patch-workspace-delete-route:explicit-approval-required",
      ],
    });
  }

  if (!pathStaysInsideWorkspace(options.workspaceRoot, deleteOperation.path)) {
    return blocked({
      blocker: "workspace-boundary",
      targetPath: deleteOperation.path,
      perFilePatchPlan,
      failures: [workspaceBoundaryFailure(deleteOperation.path)],
      nextAction:
        "Refuse to delete files outside the selected workspace.",
      evidence: [
        "apply-patch-workspace-delete-route:workspace-boundary-blocked",
      ],
    });
  }

  const targetAuthority = options.validateWriteTarget(deleteOperation.path);
  if (targetAuthority.ok === false) {
    return blocked({
      blocker: "workspace-boundary",
      targetPath: deleteOperation.path,
      perFilePatchPlan,
      failures: [patchFailureFromWriteAuthority(deleteOperation.path, targetAuthority)],
      nextAction: targetAuthority.message,
      evidence: [
        "apply-patch-workspace-delete-route:target-boundary-blocked",
        ...targetAuthority.evidence,
      ],
    });
  }

  const verification = verifyParsedPatch(parsed.patch, {
    workspaceRoot: options.workspaceRoot,
    readFile: options.readFile,
    ...(options.directoryExists
      ? { directoryExists: options.directoryExists }
      : {}),
    supportedOperations: ["delete"],
  });
  if (verification.ok === false) {
    return blocked({
      blocker: "patch-verification",
      targetPath: deleteOperation.path,
      perFilePatchPlan,
      failures: verification.failures,
      nextAction:
        verification.failures[0]?.nextAction ??
        "Regenerate the single-file Delete File patch against current workspace state.",
      evidence: ["apply-patch-workspace-delete-route:verification-blocked"],
    });
  }

  const applicationContract = buildSingleFileDeleteApplicationContract(verification);
  if (applicationContract.ok === false) {
    return blocked({
      blocker: "patch-verification",
      targetPath: deleteOperation.path,
      perFilePatchPlan,
      applicationContract,
      failures: applicationContract.failures,
      nextAction:
        applicationContract.failures[0]?.nextAction ??
        "Regenerate the single-file Delete File patch.",
      evidence: ["apply-patch-workspace-delete-route:delete-application-contract-blocked"],
    });
  }

  const finalTargetAuthority = options.validateWriteTarget(deleteOperation.path);
  if (finalTargetAuthority.ok === false) {
    return blocked({
      blocker: "final-stale-read",
      targetPath: deleteOperation.path,
      perFilePatchPlan,
      applicationContract,
      failures: [
        patchFailureFromWriteAuthority(deleteOperation.path, finalTargetAuthority),
      ],
      nextAction:
        "No delete writer ran. Re-read the target file and regenerate the Delete File patch from current workspace state.",
      evidence: [
        "apply-patch-workspace-delete-route:final-target-preflight-blocked",
        "apply-patch-workspace-delete-route:final-stale-read-before-writer",
        ...finalTargetAuthority.evidence,
      ],
    });
  }

  const finalTargetContent = options.readVerifiedFile(deleteOperation.path);
  if (finalTargetContent !== applicationContract.deleteIntent.content) {
    return blocked({
      blocker: "final-stale-read",
      targetPath: deleteOperation.path,
      perFilePatchPlan,
      applicationContract,
      failures: [finalStaleReadFailure(deleteOperation.path)],
      nextAction:
        "No delete writer ran. Re-read the target file and regenerate the Delete File patch from current content.",
      evidence: [
        "apply-patch-workspace-delete-route:final-stale-read-blocked",
        "apply-patch-workspace-delete-route:final-stale-read-before-writer",
      ],
    });
  }

  if (options.abortSignal?.aborted) {
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase: "before-writer",
      targetPath: deleteOperation.path,
    });
    return blocked({
      blocker: "aborted-before-write",
      targetPath: deleteOperation.path,
      perFilePatchPlan,
      applicationContract,
      failures: [],
      nextAction:
        "Stop: apply_patch workspace delete was aborted after final preflight but before the delete writer ran.",
      evidence: [
        "apply-patch-workspace-delete-route:aborted-before-writer",
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  const recoveryAuthorityCapture = options.recoveryAuthority
    ? await captureRecoveryAuthorityRecords({
        store: options.recoveryAuthority,
        records: [
          {
            recordId: recordIdForPath("delete", deleteOperation.path),
            workspaceRelativePath: deleteOperation.path,
            operationKind: "delete",
            beforeState: "exists",
            beforeContent: finalTargetContent,
            expectedCurrentState: "absent",
          },
        ],
      })
    : undefined;
  if (recoveryAuthorityCapture?.status === "blocked") {
    return blocked({
      blocker: "recovery-authority-capture",
      targetPath: deleteOperation.path,
      perFilePatchPlan,
      applicationContract,
      recoveryAuthorityCapture,
      failures: [],
      nextAction:
        "No delete writer ran because recovery authority capture failed before the write.",
      evidence: [
        "apply-patch-workspace-delete-route:recovery-authority-capture-blocked",
        ...recoveryAuthorityCapture.evidence,
      ],
    });
  }

  const applied = await applySingleFileDeleteIntent(applicationContract, {
    deleteFile: options.deleteFile,
    readFile: options.readVerifiedFile,
  });
  if (applied.ok === false) {
    const phase: WorkspaceWriteFailurePhase =
      applied.failureKind === "post-write-verification"
        ? "post-write-verification-failed"
        : "writer-failed";
    const blocker: WorkspaceDeleteRouteBlocker =
      applied.failureKind === "post-write-verification"
        ? "post-write-verification"
        : "write-application";
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase,
      targetPath: deleteOperation.path,
    });
    return blocked({
      blocker,
      targetPath: deleteOperation.path,
      perFilePatchPlan,
      applicationContract,
      recoveryAuthorityCapture,
      failures: applied.failedFiles,
      changedFiles: applied.changedFiles,
      writeIntents: [deleteOperation.path],
      workspaceWriterInvoked: true,
      deleteMoveInvoked: true,
      writerTarget: "selected-workspace",
      selectedWorkspaceWrite: true,
      postWriteVerification: applied.postWriteVerification,
      nextAction:
        "Stop: workspace delete is failed or uncertain. Inspect/re-read the target path before retrying; no rollback was attempted.",
      evidence: [
        `apply-patch-workspace-delete-route:${blocker}-blocked`,
        "apply-patch-workspace-delete-route:no-rollback",
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  const nextAction =
    "Review the selected workspace deleted-file result; default apply_patch remains rejected outside this explicit delete entrypoint.";
  const writeFailureState = buildWorkspaceWriteFailureState({
    phase: "verified-write",
    targetPath: deleteOperation.path,
  });
  return {
    source: "single-file-apply-patch-workspace-delete-route",
    status: "deleted",
    targetPath: deleteOperation.path,
    perFilePatchPlan,
    ...(recoveryAuthorityCapture ? { recoveryAuthorityCapture } : {}),
    applicationContract,
    failures: [],
    workspaceWriterInvoked: true,
    deleteMoveInvoked: true,
    writerTarget: "selected-workspace",
    selectedWorkspaceWrite: true,
    writerStarted: true,
    writeEffect: "verified",
    writeFailureState,
    changedFiles: [deleteOperation.path],
    failedFiles: [],
    plannedFiles: [],
    writeIntents: [deleteOperation.path],
    appliedPatchRecord: false,
    postWriteVerification: "passed",
    terminalClassification: "success",
    terminalSuccessAllowed: true,
    mutationSuccessClaimAllowed: true,
    resultSessionStatus: "write-success",
    nextAction,
    doNext: nextAction,
    evidence: [
      "apply-patch-workspace-delete-route:explicit-runtime-opt-in",
      "apply-patch-workspace-delete-route:explicit-workspace-write-opt-in",
      "apply-patch-workspace-delete-route:approved-for-write",
      "apply-patch-workspace-delete-route:single-file-delete-only",
      "apply-patch-workspace-delete-route:target-regular-file",
      "apply-patch-workspace-delete-route:final-target-preflight-before-writer",
      "apply-patch-workspace-delete-route:delete-writer-invoked",
      "apply-patch-workspace-delete-route:selected-workspace-write",
      "apply-patch-workspace-delete-route:post-write-verification-passed",
      "apply-patch-workspace-delete-route:success-after-verified-delete",
      "apply-patch-workspace-delete-route:no-broad-apply-patch",
      "apply-patch-workspace-delete-route:default-production-rejection-unchanged",
      ...writeFailureState.evidence,
    ],
  };
}

function singleDeleteOperation(
  operations: readonly PatchFileOperation[],
): Extract<PatchFileOperation, { kind: "delete" }> | undefined {
  if (operations.length !== 1) {
    return undefined;
  }
  const operation = operations[0];
  return operation?.kind === "delete" ? operation : undefined;
}

function unsupportedDeleteFailure(
  operations: readonly PatchFileOperation[],
): PatchFailure {
  const operation = operations[0];
  return {
    code: "patch-apply-plan-not-verified",
    ...(operation ? { path: operation.path } : {}),
    message:
      "Selected-workspace delete route only accepts exactly one Delete File operation.",
    nextAction:
      "Use one Delete File patch for one existing regular target file. Keep update, create, move, mixed, multi-file, and broad apply_patch shapes out of this route.",
  };
}

function workspaceBoundaryFailure(targetPath: string): PatchFailure {
  return {
    code: "patch-verify-path-outside-workspace",
    path: targetPath,
    message: "Patch path resolves outside the workspace root.",
    nextAction:
      "Regenerate the Delete File patch with the target path inside the selected workspace.",
  };
}

function finalStaleReadFailure(targetPath: string): PatchFailure {
  return {
    code: "patch-apply-plan-not-verified",
    path: targetPath,
    message:
      "Final stale-read failed before the workspace delete writer started.",
    nextAction:
      "Re-read the target file and regenerate the Delete File patch from current content.",
  };
}

function patchFailureFromWriteAuthority(
  targetPath: string,
  authority: Extract<WorkspaceWriteTargetAuthority, { ok: false }>,
): PatchFailure {
  return {
    code:
      authority.reason === "path-outside-workspace" ||
      authority.reason === "realpath-outside-workspace" ||
      authority.reason === "descriptor-outside-workspace"
        ? "patch-verify-path-outside-workspace"
        : authority.reason === "target-missing"
          ? "patch-verify-file-missing"
          : "patch-apply-plan-not-verified",
    path: targetPath,
    message: authority.message,
    nextAction:
      authority.reason === "target-missing"
        ? "Re-read the workspace and regenerate the Delete File patch against an existing target file."
        : "Choose a regular existing target file inside the selected workspace before using the delete route.",
  };
}

function pathStaysInsideWorkspace(workspaceRoot: string, candidatePath: string): boolean {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, candidatePath);
  const relative = path.relative(root, resolved);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function recordIdForPath(kind: string, targetPath: string): string {
  return `${kind}-${targetPath.replaceAll(/[^A-Za-z0-9._-]/g, "-")}`;
}

function blocked(input: {
  readonly blocker: WorkspaceDeleteRouteBlocker;
  readonly targetPath?: string;
  readonly perFilePatchPlan?: PerFilePatchPlan;
  readonly recoveryAuthorityCapture?: RecoveryAuthorityCaptureBatchResult;
  readonly applicationContract?: SingleFileDeleteApplicationContract;
  readonly failures: readonly PatchFailure[];
  readonly changedFiles?: readonly string[];
  readonly writeIntents?: readonly string[];
  readonly workspaceWriterInvoked?: boolean;
  readonly deleteMoveInvoked?: boolean;
  readonly writerTarget?: "none" | "selected-workspace";
  readonly selectedWorkspaceWrite?: boolean;
  readonly postWriteVerification?: "not-run" | "blocked" | "failed";
  readonly writeFailureState?: WorkspaceWriteFailureState;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): WorkspaceDeleteRoute {
  const changedFiles = [...(input.changedFiles ?? [])];
  const writeIntents = [...(input.writeIntents ?? [])];
  const workspaceWriterInvoked = input.workspaceWriterInvoked ?? false;
  const deleteMoveInvoked = input.deleteMoveInvoked ?? false;
  const writeFailureState =
    input.writeFailureState ??
    buildWorkspaceWriteFailureState({
      phase: workspaceWriterInvoked ? "writer-failed" : "before-writer",
      targetPath: input.targetPath,
    });
  return {
    source: "single-file-apply-patch-workspace-delete-route",
    status: "blocked",
    blocker: input.blocker,
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    ...(input.perFilePatchPlan ? { perFilePatchPlan: input.perFilePatchPlan } : {}),
    ...(input.recoveryAuthorityCapture
      ? { recoveryAuthorityCapture: input.recoveryAuthorityCapture }
      : {}),
    ...(input.applicationContract
      ? { applicationContract: input.applicationContract }
      : {}),
    failures: input.failures,
    workspaceWriterInvoked,
    deleteMoveInvoked,
    writerTarget: input.writerTarget ?? "none",
    selectedWorkspaceWrite: input.selectedWorkspaceWrite ?? false,
    writerStarted: workspaceWriterInvoked,
    writeEffect: writeFailureState.writeEffect,
    writeFailureState,
    changedFiles,
    failedFiles: input.failures,
    plannedFiles: [],
    writeIntents,
    appliedPatchRecord: false,
    postWriteVerification: input.postWriteVerification ?? "not-run",
    terminalClassification: "stopped",
    terminalSuccessAllowed: false,
    mutationSuccessClaimAllowed: false,
    resultSessionStatus: "stopped",
    nextAction: input.nextAction,
    doNext: input.nextAction,
    evidence: [
      ...input.evidence,
      `apply-patch-workspace-delete-route:blocker:${input.blocker}`,
      `apply-patch-workspace-delete-route:write-effect:${writeFailureState.writeEffect}`,
      `apply-patch-workspace-delete-route:failure-phase:${writeFailureState.failurePhase}`,
      ...(changedFiles.length === 0
        ? ["apply-patch-workspace-delete-route:changed-files-empty"]
        : ["apply-patch-workspace-delete-route:changed-files-verified-prefix-only"]),
      "apply-patch-workspace-delete-route:planned-files-empty",
      ...(writeIntents.length === 0
        ? ["apply-patch-workspace-delete-route:write-intents-empty"]
        : ["apply-patch-workspace-delete-route:write-intents-approved-target"]),
      ...(workspaceWriterInvoked
        ? ["apply-patch-workspace-delete-route:writer-invoked-no-success-claim"]
        : ["apply-patch-workspace-delete-route:no-writer-invoked"]),
      ...(deleteMoveInvoked
        ? ["apply-patch-workspace-delete-route:delete-move-invoked-no-success-claim"]
        : ["apply-patch-workspace-delete-route:no-delete-move-invoked"]),
      "apply-patch-workspace-delete-route:no-applied-patch-record",
      "apply-patch-workspace-delete-route:no-success-claim",
      "apply-patch-workspace-delete-route:no-rollback",
      "apply-patch-workspace-delete-route:default-production-rejection-unchanged",
    ],
  };
}
