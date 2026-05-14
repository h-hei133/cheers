import path from "node:path";
import {
  applySingleFileMoveIntent,
  buildSingleFileMoveApplicationContract,
  type SingleFileMoveApplicationContract,
} from "../patchApplication/singleFileMoveApply.js";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import type { PatchFailure, PatchFileOperation } from "../patchParsing/types.js";
import { verifyParsedPatch } from "../patchVerification/verify.js";
import {
  buildPerFilePatchPlan,
  type PerFilePatchPlan,
} from "./perFilePatchPlan.js";
import type { SingleFileApplyPatchRequestedUserDecision } from "./singleFileApplyPatchPermissionUxContract.js";
import type {
  WorkspaceCreateTargetAuthority,
  WorkspaceWriteTargetAuthority,
} from "./workspaceAuthority.js";
import {
  buildWorkspaceWriteFailureState,
  type WorkspaceWriteEffect,
  type WorkspaceWriteFailurePhase,
  type WorkspaceWriteFailureState,
} from "./writeFailureState.js";

export type WorkspaceMoveRouteStatus = "moved" | "blocked";

export type WorkspaceMoveRouteBlocker =
  | "runtime-opt-in-missing"
  | "workspace-write-opt-in-missing"
  | "write-decision"
  | "patch-parse"
  | "unsupported-operation"
  | "target-mismatch"
  | "workspace-boundary"
  | "patch-verification"
  | "final-stale-read"
  | "aborted-before-write"
  | "write-application"
  | "post-write-verification";

export interface WorkspaceMoveRouteOptions {
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
  readonly validateCreateTarget: (
    relativePath: string,
  ) => WorkspaceCreateTargetAuthority;
  readonly moveFileExclusive: (
    sourcePath: string,
    targetPath: string,
  ) => void | Promise<void>;
  readonly abortSignal?: AbortSignal;
}

export type WorkspaceMoveRoute =
  | {
      readonly source: "single-file-apply-patch-workspace-move-route";
      readonly status: "moved";
      readonly sourcePath: string;
      readonly targetPath: string;
      readonly perFilePatchPlan?: PerFilePatchPlan;
      readonly applicationContract: SingleFileMoveApplicationContract;
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
      readonly source: "single-file-apply-patch-workspace-move-route";
      readonly status: "blocked";
      readonly blocker: WorkspaceMoveRouteBlocker;
      readonly sourcePath?: string;
      readonly targetPath?: string;
      readonly perFilePatchPlan?: PerFilePatchPlan;
      readonly applicationContract?: SingleFileMoveApplicationContract;
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

export function patchIsSingleMoveFile(rawPatchText: string): boolean {
  const parsed = parseApplyPatchText(rawPatchText);
  return (
    parsed.ok === true &&
    parsed.patch.operations.length === 1 &&
    parsed.patch.operations[0]?.kind === "move"
  );
}

export async function runWorkspaceMoveRoute(
  options: WorkspaceMoveRouteOptions,
): Promise<WorkspaceMoveRoute> {
  if (options.abortSignal?.aborted) {
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase: "before-writer",
    });
    return blocked({
      blocker: "aborted-before-write",
      failures: [],
      nextAction:
        "Stop: apply_patch workspace move was aborted before any move writer became reachable.",
      evidence: [
        "apply-patch-workspace-move-route:aborted-before-write",
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
        "Keep Move File rejected unless an explicit runtime route opt-in is present.",
      evidence: ["apply-patch-workspace-move-route:runtime-opt-in-missing"],
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
      evidence: ["apply-patch-workspace-move-route:parse-blocked"],
    });
  }

  const moveOperation = singleMoveOperation(parsed.patch.operations);
  if (!moveOperation) {
    return blocked({
      blocker: "unsupported-operation",
      perFilePatchPlan,
      failures: [unsupportedMoveFailure(parsed.patch.operations)],
      nextAction:
        "Use exactly one Move File operation. Delete, update-only, create, mixed, multi-file, and broad apply_patch shapes are outside this move route.",
      evidence: [
        "apply-patch-workspace-move-route:unsupported-operation",
        "apply-patch-workspace-move-route:no-writer-reachable-for-mixed-or-delete",
      ],
    });
  }

  if (!options.explicitWorkspaceWriteOptIn) {
    return blocked({
      blocker: "workspace-write-opt-in-missing",
      sourcePath: moveOperation.path,
      targetPath: moveOperation.moveTo,
      perFilePatchPlan,
      failures: [],
      nextAction:
        "Keep Move File no-write unless the selected-workspace write entrypoint is explicitly opted in.",
      evidence: [
        "apply-patch-workspace-move-route:workspace-write-opt-in-missing",
      ],
    });
  }

  if (options.requestedUserDecision !== "approved") {
    return blocked({
      blocker: "write-decision",
      sourcePath: moveOperation.path,
      targetPath: moveOperation.moveTo,
      perFilePatchPlan,
      failures: [],
      nextAction:
        options.requestedUserDecision === "denied"
          ? "Do not move the file. Surface the denial and require a fresh explicit approval before any future move."
          : "Request explicit approved-for-write input before a selected-workspace move route can proceed.",
      evidence: [
        "apply-patch-workspace-move-route:write-decision-blocked",
        "apply-patch-workspace-move-route:explicit-approval-required",
      ],
    });
  }

  if (sameWorkspacePath(options.workspaceRoot, moveOperation.path, moveOperation.moveTo)) {
    return blocked({
      blocker: "target-mismatch",
      sourcePath: moveOperation.path,
      targetPath: moveOperation.moveTo,
      perFilePatchPlan,
      failures: [sameTargetFailure(moveOperation)],
      nextAction:
        "Regenerate the Move File patch with distinct source and target paths.",
      evidence: ["apply-patch-workspace-move-route:distinct-source-target-required"],
    });
  }

  for (const candidatePath of [moveOperation.path, moveOperation.moveTo]) {
    if (!pathStaysInsideWorkspace(options.workspaceRoot, candidatePath)) {
      return blocked({
        blocker: "workspace-boundary",
        sourcePath: moveOperation.path,
        targetPath: moveOperation.moveTo,
        perFilePatchPlan,
        failures: [workspaceBoundaryFailure(candidatePath)],
        nextAction:
          "Refuse to move files outside the selected workspace.",
        evidence: [
          "apply-patch-workspace-move-route:workspace-boundary-blocked",
        ],
      });
    }
  }

  const sourceAuthority = options.validateWriteTarget(moveOperation.path);
  if (sourceAuthority.ok === false) {
    return blocked({
      blocker: "workspace-boundary",
      sourcePath: moveOperation.path,
      targetPath: moveOperation.moveTo,
      perFilePatchPlan,
      failures: [
        patchFailureFromWriteAuthority(moveOperation.path, sourceAuthority),
      ],
      nextAction: sourceAuthority.message,
      evidence: [
        "apply-patch-workspace-move-route:source-boundary-blocked",
        ...sourceAuthority.evidence,
      ],
    });
  }

  const targetAuthority = options.validateCreateTarget(moveOperation.moveTo);
  if (targetAuthority.ok === false) {
    return blocked({
      blocker: targetAuthority.reason === "target-exists"
        ? "target-mismatch"
        : "workspace-boundary",
      sourcePath: moveOperation.path,
      targetPath: moveOperation.moveTo,
      perFilePatchPlan,
      failures: [
        patchFailureFromCreateAuthority(moveOperation.moveTo, targetAuthority),
      ],
      nextAction: targetAuthority.message,
      evidence: [
        "apply-patch-workspace-move-route:target-boundary-blocked",
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
    supportedOperations: ["move"],
  });
  if (verification.ok === false) {
    return blocked({
      blocker: "patch-verification",
      sourcePath: moveOperation.path,
      targetPath: moveOperation.moveTo,
      perFilePatchPlan,
      failures: verification.failures,
      nextAction:
        verification.failures[0]?.nextAction ??
        "Regenerate the single-file Move File patch against current workspace state.",
      evidence: ["apply-patch-workspace-move-route:verification-blocked"],
    });
  }

  const applicationContract = buildSingleFileMoveApplicationContract(verification);
  if (applicationContract.ok === false) {
    return blocked({
      blocker: "patch-verification",
      sourcePath: moveOperation.path,
      targetPath: moveOperation.moveTo,
      perFilePatchPlan,
      applicationContract,
      failures: applicationContract.failures,
      nextAction:
        applicationContract.failures[0]?.nextAction ??
        "Regenerate the single-file Move File patch.",
      evidence: ["apply-patch-workspace-move-route:move-application-contract-blocked"],
    });
  }

  const finalSourceAuthority = options.validateWriteTarget(moveOperation.path);
  if (finalSourceAuthority.ok === false) {
    return blocked({
      blocker: "final-stale-read",
      sourcePath: moveOperation.path,
      targetPath: moveOperation.moveTo,
      perFilePatchPlan,
      applicationContract,
      failures: [
        patchFailureFromWriteAuthority(moveOperation.path, finalSourceAuthority),
      ],
      nextAction:
        "No move writer ran. Re-read the source file and regenerate the Move File patch from current workspace state.",
      evidence: [
        "apply-patch-workspace-move-route:final-source-preflight-blocked",
        "apply-patch-workspace-move-route:final-stale-read-before-writer",
        ...finalSourceAuthority.evidence,
      ],
    });
  }

  const finalSourceContent = options.readVerifiedFile(moveOperation.path);
  if (finalSourceContent !== applicationContract.moveIntent.content) {
    return blocked({
      blocker: "final-stale-read",
      sourcePath: moveOperation.path,
      targetPath: moveOperation.moveTo,
      perFilePatchPlan,
      applicationContract,
      failures: [finalStaleReadFailure(moveOperation.path)],
      nextAction:
        "No move writer ran. Re-read the source file and regenerate the Move File patch from current content.",
      evidence: [
        "apply-patch-workspace-move-route:final-stale-read-blocked",
        "apply-patch-workspace-move-route:final-stale-read-before-writer",
      ],
    });
  }

  const finalTargetAuthority = options.validateCreateTarget(moveOperation.moveTo);
  if (finalTargetAuthority.ok === false) {
    return blocked({
      blocker: finalTargetAuthority.reason === "target-exists"
        ? "target-mismatch"
        : "workspace-boundary",
      sourcePath: moveOperation.path,
      targetPath: moveOperation.moveTo,
      perFilePatchPlan,
      applicationContract,
      failures: [
        patchFailureFromCreateAuthority(moveOperation.moveTo, finalTargetAuthority),
      ],
      nextAction: finalTargetAuthority.message,
      evidence: [
        "apply-patch-workspace-move-route:final-target-preflight-blocked",
        ...finalTargetAuthority.evidence,
      ],
    });
  }

  if (options.abortSignal?.aborted) {
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase: "before-writer",
      targetPath: moveOperation.moveTo,
    });
    return blocked({
      blocker: "aborted-before-write",
      sourcePath: moveOperation.path,
      targetPath: moveOperation.moveTo,
      perFilePatchPlan,
      applicationContract,
      failures: [],
      nextAction:
        "Stop: apply_patch workspace move was aborted after final preflight but before the move writer ran.",
      evidence: [
        "apply-patch-workspace-move-route:aborted-before-writer",
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  const applied = await applySingleFileMoveIntent(applicationContract, {
    moveFileExclusive: options.moveFileExclusive,
    readFile: options.readVerifiedFile,
  });
  if (applied.ok === false) {
    const phase: WorkspaceWriteFailurePhase =
      applied.failureKind === "post-write-verification"
        ? "post-write-verification-failed"
        : "writer-failed";
    const blocker: WorkspaceMoveRouteBlocker =
      applied.failureKind === "post-write-verification"
        ? "post-write-verification"
        : "write-application";
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase,
      targetPath: moveOperation.moveTo,
    });
    return blocked({
      blocker,
      sourcePath: moveOperation.path,
      targetPath: moveOperation.moveTo,
      perFilePatchPlan,
      applicationContract,
      failures: applied.failedFiles,
      changedFiles: applied.changedFiles,
      writeIntents: [moveOperation.moveTo],
      workspaceWriterInvoked: true,
      deleteMoveInvoked: true,
      writerTarget: "selected-workspace",
      selectedWorkspaceWrite: true,
      postWriteVerification: applied.postWriteVerification,
      nextAction:
        "Stop: workspace move is failed or uncertain. Inspect/re-read the source and target paths before retrying; no rollback was attempted.",
      evidence: [
        `apply-patch-workspace-move-route:${blocker}-blocked`,
        "apply-patch-workspace-move-route:no-rollback",
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  const nextAction =
    "Review the selected workspace moved file; default apply_patch remains rejected outside this explicit move entrypoint.";
  const writeFailureState = buildWorkspaceWriteFailureState({
    phase: "verified-write",
    targetPath: moveOperation.moveTo,
  });
  return {
    source: "single-file-apply-patch-workspace-move-route",
    status: "moved",
    sourcePath: moveOperation.path,
    targetPath: moveOperation.moveTo,
    perFilePatchPlan,
    applicationContract,
    failures: [],
    workspaceWriterInvoked: true,
    deleteMoveInvoked: true,
    writerTarget: "selected-workspace",
    selectedWorkspaceWrite: true,
    writerStarted: true,
    writeEffect: "verified",
    writeFailureState,
    changedFiles: [moveOperation.moveTo],
    failedFiles: [],
    plannedFiles: [],
    writeIntents: [moveOperation.moveTo],
    appliedPatchRecord: false,
    postWriteVerification: "passed",
    terminalClassification: "success",
    terminalSuccessAllowed: true,
    mutationSuccessClaimAllowed: true,
    resultSessionStatus: "write-success",
    nextAction,
    doNext: nextAction,
    evidence: [
      "apply-patch-workspace-move-route:explicit-runtime-opt-in",
      "apply-patch-workspace-move-route:explicit-workspace-write-opt-in",
      "apply-patch-workspace-move-route:approved-for-write",
      "apply-patch-workspace-move-route:single-file-move-only",
      "apply-patch-workspace-move-route:content-preserved",
      "apply-patch-workspace-move-route:final-source-preflight-before-writer",
      "apply-patch-workspace-move-route:final-target-missing-before-writer",
      "apply-patch-workspace-move-route:move-writer-invoked",
      "apply-patch-workspace-move-route:selected-workspace-write",
      "apply-patch-workspace-move-route:post-write-verification-passed",
      "apply-patch-workspace-move-route:success-after-verified-move",
      "apply-patch-workspace-move-route:no-delete-operation",
      "apply-patch-workspace-move-route:no-broad-apply-patch",
      "apply-patch-workspace-move-route:default-production-rejection-unchanged",
      ...writeFailureState.evidence,
    ],
  };
}

function singleMoveOperation(
  operations: readonly PatchFileOperation[],
): Extract<PatchFileOperation, { kind: "move" }> | undefined {
  if (operations.length !== 1) {
    return undefined;
  }
  const operation = operations[0];
  return operation?.kind === "move" ? operation : undefined;
}

function unsupportedMoveFailure(
  operations: readonly PatchFileOperation[],
): PatchFailure {
  const operation = operations[0];
  return {
    code: "patch-apply-plan-not-verified",
    ...(operation ? { path: operation.path } : {}),
    message:
      "Selected-workspace move route only accepts exactly one Move File operation.",
    nextAction:
      "Use one Move File patch for one existing regular source file and one missing target. Keep delete, mixed, multi-file, and broad apply_patch shapes out of this route.",
  };
}

function sameTargetFailure(
  operation: Extract<PatchFileOperation, { kind: "move" }>,
): PatchFailure {
  return {
    code: "patch-apply-plan-not-verified",
    path: operation.moveTo,
    message: "Patch move source and destination resolve to the same workspace path.",
    nextAction:
      "Regenerate the Move File patch with distinct source and target paths.",
  };
}

function workspaceBoundaryFailure(targetPath: string): PatchFailure {
  return {
    code: "patch-verify-path-outside-workspace",
    path: targetPath,
    message: "Patch path resolves outside the workspace root.",
    nextAction:
      "Regenerate the Move File patch with source and target paths inside the selected workspace.",
  };
}

function finalStaleReadFailure(targetPath: string): PatchFailure {
  return {
    code: "patch-apply-plan-not-verified",
    path: targetPath,
    message:
      "Final stale-read failed before the workspace move writer started.",
    nextAction:
      "Re-read the source file and regenerate the Move File patch from current content.",
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
        ? "Re-read the workspace and regenerate the Move File patch against an existing source file."
        : "Choose a regular existing source file inside the selected workspace before using the move route.",
  };
}

function patchFailureFromCreateAuthority(
  targetPath: string,
  authority: Extract<WorkspaceCreateTargetAuthority, { ok: false }>,
): PatchFailure {
  return {
    code:
      authority.reason === "path-outside-workspace" ||
      authority.reason === "parent-realpath-outside-workspace"
        ? "patch-verify-path-outside-workspace"
        : authority.reason === "target-exists" ||
            authority.reason === "target-symlink"
          ? "patch-verify-file-already-exists"
          : authority.reason === "parent-missing"
            ? "patch-add-file-parent-missing"
            : "patch-apply-plan-not-verified",
    path: targetPath,
    message: authority.message,
    nextAction:
      authority.reason === "target-exists" ||
      authority.reason === "target-symlink"
        ? "Choose a missing regular-file destination for the Move File patch."
        : "Choose a destination with an existing regular parent directory inside the selected workspace.",
  };
}

function sameWorkspacePath(
  workspaceRoot: string,
  left: string,
  right: string,
): boolean {
  return (
    path.resolve(workspaceRoot, left) === path.resolve(workspaceRoot, right)
  );
}

function pathStaysInsideWorkspace(
  workspaceRoot: string,
  relativePath: string,
): boolean {
  const resolved = path.resolve(workspaceRoot, relativePath);
  const relative = path.relative(workspaceRoot, resolved);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

function blocked(input: {
  readonly blocker: WorkspaceMoveRouteBlocker;
  readonly sourcePath?: string;
  readonly targetPath?: string;
  readonly perFilePatchPlan?: PerFilePatchPlan;
  readonly applicationContract?: SingleFileMoveApplicationContract;
  readonly failures: readonly PatchFailure[];
  readonly changedFiles?: readonly string[];
  readonly writeIntents?: readonly string[];
  readonly workspaceWriterInvoked?: boolean;
  readonly deleteMoveInvoked?: boolean;
  readonly writerTarget?: "none" | "selected-workspace";
  readonly selectedWorkspaceWrite?: boolean;
  readonly writeFailureState?: WorkspaceWriteFailureState;
  readonly failurePhase?: WorkspaceWriteFailurePhase;
  readonly postWriteVerification?: "not-run" | "blocked" | "failed";
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): WorkspaceMoveRoute {
  const writeFailureState =
    input.writeFailureState ??
    buildWorkspaceWriteFailureState({
      phase: input.failurePhase ?? "before-writer",
      targetPath: input.targetPath ?? input.sourcePath,
    });
  const changedFiles = input.changedFiles ?? [];
  const writeIntents = input.writeIntents ?? [];
  const workspaceWriterInvoked = input.workspaceWriterInvoked ?? false;
  const deleteMoveInvoked = input.deleteMoveInvoked ?? false;
  return {
    source: "single-file-apply-patch-workspace-move-route",
    status: "blocked",
    blocker: input.blocker,
    ...(input.sourcePath ? { sourcePath: input.sourcePath } : {}),
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    ...(input.perFilePatchPlan ? { perFilePatchPlan: input.perFilePatchPlan } : {}),
    ...(input.applicationContract
      ? { applicationContract: input.applicationContract }
      : {}),
    failures: input.failures,
    workspaceWriterInvoked,
    deleteMoveInvoked,
    writerTarget: input.writerTarget ?? "none",
    selectedWorkspaceWrite: input.selectedWorkspaceWrite ?? false,
    writerStarted: writeFailureState.writerStarted,
    writeEffect: writeFailureState.writeEffect,
    writeFailureState,
    changedFiles: [...changedFiles],
    failedFiles: input.failures,
    plannedFiles: [],
    writeIntents: [...writeIntents],
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
      ...writeFailureState.evidence,
      `apply-patch-workspace-move-route:blocker:${input.blocker}`,
      `apply-patch-workspace-move-route:write-effect:${writeFailureState.writeEffect}`,
      `apply-patch-workspace-move-route:failure-phase:${writeFailureState.failurePhase}`,
      ...(changedFiles.length === 0
        ? ["apply-patch-workspace-move-route:changed-files-empty"]
        : ["apply-patch-workspace-move-route:changed-files-verified-prefix-only"]),
      "apply-patch-workspace-move-route:planned-files-empty",
      ...(writeIntents.length === 0
        ? ["apply-patch-workspace-move-route:write-intents-empty"]
        : ["apply-patch-workspace-move-route:write-intents-approved-target"]),
      ...(workspaceWriterInvoked
        ? ["apply-patch-workspace-move-route:writer-invoked-no-success-claim"]
        : ["apply-patch-workspace-move-route:no-writer-invoked"]),
      ...(deleteMoveInvoked
        ? ["apply-patch-workspace-move-route:delete-move-invoked-no-success-claim"]
        : ["apply-patch-workspace-move-route:no-delete-move-invoked"]),
      "apply-patch-workspace-move-route:no-applied-patch-record",
      "apply-patch-workspace-move-route:no-success-claim",
      "apply-patch-workspace-move-route:no-rollback",
      "apply-patch-workspace-move-route:default-production-rejection-unchanged",
    ],
  };
}
