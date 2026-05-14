import path from "node:path";
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

export type WorkspaceMoveRouteStatus = "blocked";

export type WorkspaceMoveRouteBlocker =
  | "runtime-opt-in-missing"
  | "workspace-write-opt-in-missing"
  | "write-decision"
  | "patch-parse"
  | "unsupported-operation"
  | "target-mismatch"
  | "workspace-boundary"
  | "patch-verification"
  | "aborted-before-write"
  | "move-writer-not-enabled";

export interface WorkspaceMoveRouteOptions {
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
  readonly explicitRuntimeOptIn: boolean;
  readonly explicitWorkspaceWriteOptIn: boolean;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly defaultProductionRejectionUnchanged: true;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly directoryExists?: (absolutePath: string) => boolean;
  readonly validateWriteTarget: (
    relativePath: string,
  ) => WorkspaceWriteTargetAuthority;
  readonly validateCreateTarget: (
    relativePath: string,
  ) => WorkspaceCreateTargetAuthority;
  readonly abortSignal?: AbortSignal;
}

export interface WorkspaceMoveRoute {
  readonly source: "single-file-apply-patch-workspace-move-route";
  readonly status: WorkspaceMoveRouteStatus;
  readonly blocker: WorkspaceMoveRouteBlocker;
  readonly sourcePath?: string;
  readonly targetPath?: string;
  readonly perFilePatchPlan?: PerFilePatchPlan;
  readonly failures: readonly PatchFailure[];
  readonly workspaceWriterInvoked: false;
  readonly deleteMoveInvoked: false;
  readonly writerTarget: "none";
  readonly selectedWorkspaceWrite: false;
  readonly writerStarted: false;
  readonly writeEffect: WorkspaceWriteEffect;
  readonly writeFailureState: WorkspaceWriteFailureState;
  readonly changedFiles: readonly [];
  readonly failedFiles: readonly PatchFailure[];
  readonly plannedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly appliedPatchRecord: false;
  readonly postWriteVerification: "not-run";
  readonly terminalClassification: "stopped";
  readonly terminalSuccessAllowed: false;
  readonly mutationSuccessClaimAllowed: false;
  readonly resultSessionStatus: "stopped";
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export function patchIsSingleMoveFile(rawPatchText: string): boolean {
  const parsed = parseApplyPatchText(rawPatchText);
  return (
    parsed.ok === true &&
    parsed.patch.operations.length === 1 &&
    parsed.patch.operations[0]?.kind === "move"
  );
}

export function runWorkspaceMoveRoute(
  options: WorkspaceMoveRouteOptions,
): WorkspaceMoveRoute {
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

  return blocked({
    blocker: "move-writer-not-enabled",
    sourcePath: moveOperation.path,
    targetPath: moveOperation.moveTo,
    perFilePatchPlan,
    failures: [moveWriterNotEnabledFailure(moveOperation)],
    nextAction:
      "Move File was recognized and all current guards passed, but no selected-workspace move writer is enabled in this route. No file was moved.",
    evidence: [
      "apply-patch-workspace-move-route:single-file-move-guards-passed",
      "apply-patch-workspace-move-route:move-writer-not-enabled",
      "apply-patch-workspace-move-route:no-delete-writer",
      "apply-patch-workspace-move-route:no-broad-apply-patch",
    ],
  });
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

function moveWriterNotEnabledFailure(
  operation: Extract<PatchFileOperation, { kind: "move" }>,
): PatchFailure {
  return {
    code: "patch-apply-plan-not-verified",
    path: operation.moveTo,
    message:
      "Selected-workspace Move File writer is not enabled; the route stopped after guard verification.",
    nextAction:
      "Keep this as no-write move-lane evidence until a dedicated exclusive move writer is approved.",
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
  readonly failures: readonly PatchFailure[];
  readonly writeFailureState?: WorkspaceWriteFailureState;
  readonly failurePhase?: WorkspaceWriteFailurePhase;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): WorkspaceMoveRoute {
  const writeFailureState =
    input.writeFailureState ??
    buildWorkspaceWriteFailureState({
      phase: input.failurePhase ?? "before-writer",
      targetPath: input.targetPath ?? input.sourcePath,
    });
  return {
    source: "single-file-apply-patch-workspace-move-route",
    status: "blocked",
    blocker: input.blocker,
    ...(input.sourcePath ? { sourcePath: input.sourcePath } : {}),
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    ...(input.perFilePatchPlan ? { perFilePatchPlan: input.perFilePatchPlan } : {}),
    failures: input.failures,
    workspaceWriterInvoked: false,
    deleteMoveInvoked: false,
    writerTarget: "none",
    selectedWorkspaceWrite: false,
    writerStarted: false,
    writeEffect: writeFailureState.writeEffect,
    writeFailureState,
    changedFiles: [],
    failedFiles: input.failures,
    plannedFiles: [],
    writeIntents: [],
    appliedPatchRecord: false,
    postWriteVerification: "not-run",
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
      "apply-patch-workspace-move-route:changed-files-empty",
      "apply-patch-workspace-move-route:planned-files-empty",
      "apply-patch-workspace-move-route:write-intents-empty",
      "apply-patch-workspace-move-route:no-writer-invoked",
      "apply-patch-workspace-move-route:no-delete-move-invoked",
      "apply-patch-workspace-move-route:no-applied-patch-record",
      "apply-patch-workspace-move-route:no-success-claim",
      "apply-patch-workspace-move-route:no-rollback",
      "apply-patch-workspace-move-route:default-production-rejection-unchanged",
    ],
  };
}
