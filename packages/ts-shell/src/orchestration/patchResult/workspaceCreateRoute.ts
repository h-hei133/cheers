import path from "node:path";
import { applySingleFileCreateIntent } from "../patchApplication/singleFileCreateApply.js";
import { buildNoPartialPatchApplicationContract } from "../patchApplication/noPartialApply.js";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import type { PatchFailure, PatchFileOperation } from "../patchParsing/types.js";
import { verifyParsedPatch } from "../patchVerification/verify.js";
import {
  buildPerFilePatchPlan,
  type PerFilePatchPlan,
} from "./perFilePatchPlan.js";
import type { SingleFileApplyPatchRequestedUserDecision } from "./singleFileApplyPatchPermissionUxContract.js";
import type { WorkspaceCreateTargetAuthority } from "./workspaceAuthority.js";
import {
  buildWorkspaceWriteFailureState,
  type WorkspaceWriteEffect,
  type WorkspaceWriteFailurePhase,
  type WorkspaceWriteFailureState,
} from "./writeFailureState.js";

export type WorkspaceCreateRouteStatus = "created" | "blocked";

export type WorkspaceCreateRouteBlocker =
  | "runtime-opt-in-missing"
  | "workspace-write-opt-in-missing"
  | "write-decision"
  | "patch-parse"
  | "unsupported-operation"
  | "patch-verification"
  | "target-mismatch"
  | "workspace-boundary"
  | "final-create-preflight"
  | "aborted-before-write"
  | "write-application"
  | "post-write-verification";

export interface WorkspaceCreateRouteOptions {
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
  readonly explicitRuntimeOptIn: boolean;
  readonly explicitWorkspaceWriteOptIn: boolean;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly defaultProductionRejectionUnchanged: true;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly readVerifiedFile: (relativePath: string) => string | undefined;
  readonly directoryExists: (absolutePath: string) => boolean;
  readonly validateCreateTarget: (
    relativePath: string,
  ) => WorkspaceCreateTargetAuthority;
  readonly createFileExclusive: (
    relativePath: string,
    content: string,
  ) => void | Promise<void>;
  readonly abortSignal?: AbortSignal;
}

export type WorkspaceCreateRoute =
  | {
      readonly source: "single-file-apply-patch-workspace-create-route";
      readonly status: "created";
      readonly targetPath: string;
      readonly perFilePatchPlan?: PerFilePatchPlan;
      readonly workspaceWriterInvoked: true;
      readonly writerTarget: "selected-workspace";
      readonly selectedWorkspaceWrite: true;
      readonly writerStarted: true;
      readonly writeEffect: "verified";
      readonly writeFailureState: WorkspaceWriteFailureState;
      readonly changedFiles: readonly [string];
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
      readonly source: "single-file-apply-patch-workspace-create-route";
      readonly status: "blocked";
      readonly blocker: WorkspaceCreateRouteBlocker;
      readonly targetPath?: string;
      readonly perFilePatchPlan?: PerFilePatchPlan;
      readonly failures: readonly PatchFailure[];
      readonly workspaceWriterInvoked: boolean;
      readonly writerTarget: "none" | "selected-workspace";
      readonly selectedWorkspaceWrite: boolean;
      readonly writerStarted: boolean;
      readonly writeEffect: WorkspaceWriteEffect;
      readonly writeFailureState: WorkspaceWriteFailureState;
      readonly changedFiles: readonly [];
      readonly writeIntents: readonly [];
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

export function patchIsSingleAddFile(rawPatchText: string): boolean {
  const parsed = parseApplyPatchText(rawPatchText);
  return (
    parsed.ok === true &&
    parsed.patch.operations.length === 1 &&
    parsed.patch.operations[0]?.kind === "add"
  );
}

export async function runWorkspaceCreateRoute(
  options: WorkspaceCreateRouteOptions,
): Promise<WorkspaceCreateRoute> {
  if (options.abortSignal?.aborted) {
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase: "before-writer",
    });
    return blocked({
      blocker: "aborted-before-write",
      failures: [],
      nextAction:
        "Stop: apply_patch workspace create was aborted before the workspace writer became reachable.",
      evidence: [
        "apply-patch-workspace-create-route:aborted-before-write",
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
        "Keep Add File rejected unless an explicit runtime route opt-in is present.",
      evidence: ["apply-patch-workspace-create-route:runtime-opt-in-missing"],
    });
  }

  const perFilePatchPlan = buildPerFilePatchPlan({
    workspaceRoot: options.workspaceRoot,
    rawPatchText: options.rawPatchText,
    readFile: options.readFile,
    directoryExists: options.directoryExists,
  });

  const parsed = parseApplyPatchText(options.rawPatchText);
  if (parsed.ok === false) {
    return blocked({
      blocker: "patch-parse",
      perFilePatchPlan,
      failures: [parsed.failure],
      nextAction: parsed.failure.nextAction,
      evidence: ["apply-patch-workspace-create-route:parse-blocked"],
    });
  }

  const addOperation = singleAddOperation(parsed.patch.operations);
  if (!addOperation) {
    return blocked({
      blocker: "unsupported-operation",
      perFilePatchPlan,
      failures: [unsupportedCreateFailure(parsed.patch.operations)],
      nextAction:
        "Use exactly one Add File operation. Update, delete, move, mixed, and multi-file patches are outside this create route.",
      evidence: [
        "apply-patch-workspace-create-route:unsupported-operation",
        "apply-patch-workspace-create-route:no-writer-reachable-for-mixed-or-multi-file",
      ],
    });
  }

  if (!options.explicitWorkspaceWriteOptIn) {
    return blocked({
      blocker: "workspace-write-opt-in-missing",
      targetPath: addOperation.path,
      perFilePatchPlan,
      failures: [],
      nextAction:
        "Keep Add File no-write unless the selected-workspace write entrypoint is explicitly opted in.",
      evidence: [
        "apply-patch-workspace-create-route:workspace-write-opt-in-missing",
      ],
    });
  }

  if (options.requestedUserDecision !== "approved") {
    return blocked({
      blocker: "write-decision",
      targetPath: addOperation.path,
      perFilePatchPlan,
      failures: [],
      nextAction:
        options.requestedUserDecision === "denied"
          ? "Do not create the file. Surface the denial and require a fresh explicit approval before any future write."
          : "Request explicit approved-for-write input before the selected-workspace create route can write.",
      evidence: [
        "apply-patch-workspace-create-route:write-decision-blocked",
        "apply-patch-workspace-create-route:explicit-approval-required",
      ],
    });
  }

  const targetAuthority = options.validateCreateTarget(addOperation.path);
  if (targetAuthority.ok === false) {
    return blocked({
      blocker: "workspace-boundary",
      targetPath: addOperation.path,
      perFilePatchPlan,
      failures: [patchFailureFromCreateAuthority(addOperation.path, targetAuthority)],
      nextAction: targetAuthority.message,
      evidence: [
        "apply-patch-workspace-create-route:workspace-boundary-blocked",
        ...targetAuthority.evidence,
      ],
    });
  }

  const verification = verifyParsedPatch(parsed.patch, {
    workspaceRoot: options.workspaceRoot,
    readFile: options.readFile,
    directoryExists: options.directoryExists,
    supportedOperations: ["add"],
  });
  if (verification.ok === false) {
    return blocked({
      blocker: "patch-verification",
      targetPath: addOperation.path,
      perFilePatchPlan,
      failures: verification.failures,
      nextAction:
        verification.failures[0]?.nextAction ??
        "Regenerate the single-file Add File patch against current workspace state.",
      evidence: ["apply-patch-workspace-create-route:verification-blocked"],
    });
  }

  const writeIntent = buildNoPartialPatchApplicationContract(verification);
  if (writeIntent.ok === false) {
    return blocked({
      blocker: "patch-verification",
      targetPath: addOperation.path,
      perFilePatchPlan,
      failures: writeIntent.failures,
      nextAction:
        writeIntent.failures[0]?.nextAction ??
        "Regenerate the single-file Add File patch.",
      evidence: ["apply-patch-workspace-create-route:no-partial-blocked"],
    });
  }

  const intent = writeIntent.writeIntents[0];
  if (
    writeIntent.writeIntents.length !== 1 ||
    !intent ||
    intent.kind !== "add" ||
    intent.path !== addOperation.path
  ) {
    return blocked({
      blocker: "target-mismatch",
      targetPath: addOperation.path,
      perFilePatchPlan,
      failures: [],
      nextAction:
        "Only one approval-bound Add File target may enter the workspace create route.",
      evidence: ["apply-patch-workspace-create-route:target-mismatch"],
    });
  }

  if (!pathStaysInsideWorkspace(options.workspaceRoot, intent.path)) {
    return blocked({
      blocker: "workspace-boundary",
      targetPath: intent.path,
      perFilePatchPlan,
      failures: [],
      nextAction: "Refuse to create outside the selected workspace.",
      evidence: ["apply-patch-workspace-create-route:workspace-boundary-blocked"],
    });
  }

  const finalAuthority = options.validateCreateTarget(intent.path);
  if (finalAuthority.ok === false) {
    return blocked({
      blocker: "final-create-preflight",
      targetPath: intent.path,
      perFilePatchPlan,
      failures: [patchFailureFromCreateAuthority(intent.path, finalAuthority)],
      nextAction: finalAuthority.message,
      evidence: [
        "apply-patch-workspace-create-route:final-create-preflight-blocked",
        ...finalAuthority.evidence,
      ],
    });
  }

  if (options.abortSignal?.aborted) {
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase: "before-writer",
      targetPath: intent.path,
    });
    return blocked({
      blocker: "aborted-before-write",
      targetPath: intent.path,
      perFilePatchPlan,
      failures: [],
      nextAction:
        "Stop: apply_patch workspace create was aborted after final create preflight but before the workspace writer ran.",
      evidence: [
        "apply-patch-workspace-create-route:aborted-before-writer",
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  const applied = await applySingleFileCreateIntent(writeIntent, {
    createFileExclusive: options.createFileExclusive,
    readFile: options.readVerifiedFile,
  });
  if (applied.ok === false) {
    const phase: WorkspaceWriteFailurePhase =
      applied.failureKind === "post-write-verification"
        ? "post-write-verification-failed"
        : "writer-failed";
    const blocker: WorkspaceCreateRouteBlocker =
      applied.failureKind === "post-write-verification"
        ? "post-write-verification"
        : "write-application";
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase,
      targetPath: intent.path,
    });
    return blocked({
      blocker,
      targetPath: intent.path,
      perFilePatchPlan,
      failures: applied.failedFiles,
      workspaceWriterInvoked: true,
      writerTarget: "selected-workspace",
      selectedWorkspaceWrite: true,
      postWriteVerification: applied.postWriteVerification,
      nextAction: `${applied.failedFiles[0]?.nextAction ?? "Retry after checking workspace write permissions."} ${writeFailureState.nextAction}`,
      evidence: [
        `apply-patch-workspace-create-route:${blocker}-blocked`,
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  const targetPath = applied.changedFiles[0];
  const nextAction =
    "Review the selected workspace created file; default apply_patch remains rejected outside this explicit create entrypoint.";
  const writeFailureState = buildWorkspaceWriteFailureState({
    phase: "verified-write",
    targetPath,
  });
  return {
    source: "single-file-apply-patch-workspace-create-route",
    status: "created",
    targetPath,
    perFilePatchPlan,
    workspaceWriterInvoked: true,
    writerTarget: "selected-workspace",
    selectedWorkspaceWrite: true,
    writerStarted: true,
    writeEffect: "verified",
    writeFailureState,
    changedFiles: [targetPath],
    writeIntents: [targetPath],
    appliedPatchRecord: false,
    postWriteVerification: "passed",
    terminalClassification: "success",
    terminalSuccessAllowed: true,
    mutationSuccessClaimAllowed: true,
    resultSessionStatus: "write-success",
    nextAction,
    doNext: nextAction,
    evidence: [
      "apply-patch-workspace-create-route:explicit-runtime-opt-in",
      "apply-patch-workspace-create-route:explicit-workspace-write-opt-in",
      "apply-patch-workspace-create-route:approved-for-write",
      "apply-patch-workspace-create-route:single-file-add-only",
      "apply-patch-workspace-create-route:parent-directory-preexists",
      "apply-patch-workspace-create-route:target-confirmed-missing-before-writer",
      "apply-patch-workspace-create-route:exclusive-create",
      "apply-patch-workspace-create-route:workspace-writer-invoked",
      "apply-patch-workspace-create-route:selected-workspace-write",
      "apply-patch-workspace-create-route:post-write-verification-passed",
      "apply-patch-workspace-create-route:success-after-verified-create",
      "apply-patch-workspace-create-route:default-production-rejection-unchanged",
      ...writeFailureState.evidence,
    ],
  };
}

function singleAddOperation(
  operations: readonly PatchFileOperation[],
): Extract<PatchFileOperation, { kind: "add" }> | undefined {
  if (operations.length !== 1) {
    return undefined;
  }
  const operation = operations[0];
  return operation?.kind === "add" ? operation : undefined;
}

function unsupportedCreateFailure(
  operations: readonly PatchFileOperation[],
): PatchFailure {
  const operation = operations[0];
  return {
    code: "patch-apply-plan-not-verified",
    ...(operation ? { path: operation.path } : {}),
    message:
      "Selected-workspace create route only accepts exactly one Add File operation.",
    nextAction:
      "Use one Add File patch for one new file. Keep update, delete, move, mixed, and multi-file patches out of this route.",
  };
}

function patchFailureFromCreateAuthority(
  targetPath: string,
  authority: Extract<WorkspaceCreateTargetAuthority, { ok: false }>,
): PatchFailure {
  return {
    code: patchFailureCodeForCreateAuthority(authority),
    path: targetPath,
    message: authority.message,
    nextAction: nextActionForCreateAuthority(authority),
  };
}

function patchFailureCodeForCreateAuthority(
  authority: Extract<WorkspaceCreateTargetAuthority, { ok: false }>,
): PatchFailure["code"] {
  switch (authority.reason) {
    case "target-exists":
    case "target-symlink":
      return "patch-add-file-target-exists";
    case "parent-missing":
      return "patch-add-file-parent-missing";
    case "path-outside-workspace":
    case "parent-realpath-outside-workspace":
      return "patch-verify-path-outside-workspace";
    case "parent-symlink":
    case "parent-not-directory":
    case "filesystem-error":
      return "patch-apply-plan-not-verified";
  }
}

function nextActionForCreateAuthority(
  authority: Extract<WorkspaceCreateTargetAuthority, { ok: false }>,
): string {
  switch (authority.reason) {
    case "target-exists":
    case "target-symlink":
      return "Choose a non-existing regular file target, or use the existing-file update route for existing files.";
    case "parent-missing":
      return "Create the parent directory through a separate approved capability before using the single-file create route.";
    case "path-outside-workspace":
    case "parent-realpath-outside-workspace":
      return "Regenerate the Add File patch with a path inside the selected workspace.";
    case "parent-symlink":
    case "parent-not-directory":
    case "filesystem-error":
      return "Choose a target with an existing regular parent directory inside the selected workspace.";
  }
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

function blocked(
  input: {
    readonly blocker: WorkspaceCreateRouteBlocker;
    readonly targetPath?: string;
    readonly perFilePatchPlan?: PerFilePatchPlan;
    readonly failures: readonly PatchFailure[];
    readonly workspaceWriterInvoked?: boolean;
    readonly writerTarget?: "none" | "selected-workspace";
    readonly selectedWorkspaceWrite?: boolean;
    readonly writeFailureState?: WorkspaceWriteFailureState;
    readonly failurePhase?: WorkspaceWriteFailurePhase;
    readonly postWriteVerification?: "not-run" | "blocked" | "failed";
    readonly nextAction: string;
    readonly evidence: readonly string[];
  },
): WorkspaceCreateRoute {
  const writeFailureState =
    input.writeFailureState ??
    buildWorkspaceWriteFailureState({
      phase: input.failurePhase ?? "before-writer",
      targetPath: input.targetPath,
    });
  return {
    source: "single-file-apply-patch-workspace-create-route",
    status: "blocked",
    blocker: input.blocker,
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    ...(input.perFilePatchPlan ? { perFilePatchPlan: input.perFilePatchPlan } : {}),
    failures: input.failures,
    workspaceWriterInvoked: input.workspaceWriterInvoked ?? false,
    writerTarget: input.writerTarget ?? "none",
    selectedWorkspaceWrite: input.selectedWorkspaceWrite ?? false,
    writerStarted: writeFailureState.writerStarted,
    writeEffect: writeFailureState.writeEffect,
    writeFailureState,
    changedFiles: [],
    writeIntents: [],
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
      `apply-patch-workspace-create-route:blocker:${input.blocker}`,
      `apply-patch-workspace-create-route:write-effect:${writeFailureState.writeEffect}`,
      `apply-patch-workspace-create-route:failure-phase:${writeFailureState.failurePhase}`,
      "apply-patch-workspace-create-route:changed-files-empty",
      "apply-patch-workspace-create-route:write-intents-empty",
      ...(input.workspaceWriterInvoked
        ? ["apply-patch-workspace-create-route:writer-invoked-no-success-claim"]
        : ["apply-patch-workspace-create-route:no-writer-invoked"]),
      "apply-patch-workspace-create-route:no-applied-patch-record",
      "apply-patch-workspace-create-route:no-success-claim",
    ],
  };
}
