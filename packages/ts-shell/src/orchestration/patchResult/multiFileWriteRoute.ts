import path from "node:path";
import {
  captureRecoveryAuthorityRecords,
  type RecoveryAuthorityCaptureBatchResult,
  type RecoveryAuthorityStoreConfig,
} from "../patchRecovery/recoveryAuthorityStore.js";
import {
  applyMultiFileUpdateIntents,
  type MultiFileUpdateTargetCount,
} from "../patchApplication/multiFileUpdateApply.js";
import { buildNoPartialPatchApplicationContract } from "../patchApplication/noPartialApply.js";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import type { PatchFailure, PatchFileOperation } from "../patchParsing/types.js";
import { verifyParsedPatch } from "../patchVerification/verify.js";
import {
  buildPerFilePatchPlan,
  type PerFilePatchPlan,
} from "../../edit/patch/plan/perFile.js";
import {
  MAX_BOUNDED_WRITE_OPERATIONS,
  isBoundedWriteOperationCount,
} from "../../edit/authority/writePolicy.js";
import type { SingleFileApplyPatchRequestedUserDecision } from "./singleFileApplyPatchPermissionUxContract.js";
import type { WorkspaceWriteTargetAuthority } from "../../edit/authority/workspace.js";
import {
  buildWorkspaceWriteFailureState,
  type WorkspaceWriteEffect,
  type WorkspaceWriteFailurePhase,
  type WorkspaceWriteFailureState,
} from "../../edit/result/workspace/writeFailureState.js";

export type MultiFileWriteRouteStatus = "written" | "blocked" | "bypassed";

export type MultiFileWriteRouteBlocker =
  | "runtime-opt-in-missing"
  | "workspace-write-opt-in-missing"
  | "write-decision"
  | "patch-parse"
  | "single-file-bypass"
  | "unsupported-operation"
  | "too-many-files"
  | "patch-verification"
  | "target-mismatch"
  | "workspace-boundary"
  | "final-stale-read"
  | "no-op"
  | "aborted-before-write"
  | "recovery-authority-capture"
  | "write-application"
  | "post-write-verification";

export type MultiFileWriteTargetPaths =
  readonly string[];

export type MultiFileWriteApproval =
  | {
      readonly status: "approved-for-write";
      readonly targetPaths: MultiFileWriteTargetPaths;
      readonly message: string;
    }
  | {
      readonly status: "denied" | "pending" | "not-requested";
      readonly targetPaths: readonly string[];
      readonly message: string;
    };

export interface MultiFileWriteRouteOptions {
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
  readonly explicitRuntimeOptIn: boolean;
  readonly explicitWorkspaceWriteOptIn: boolean;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly defaultProductionRejectionUnchanged: true;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly readVerifiedFile: (relativePath: string) => string | undefined;
  readonly validateWriteTarget: (
    relativePath: string,
  ) => WorkspaceWriteTargetAuthority;
  readonly writeFile: (relativePath: string, content: string) => void | Promise<void>;
  readonly recoveryAuthority?: RecoveryAuthorityStoreConfig;
  readonly abortSignal?: AbortSignal;
}

export type MultiFileWriteRoute =
  | {
      readonly source: "multi-file-apply-patch-workspace-write-route";
      readonly status: "written";
      readonly targetPaths: MultiFileWriteTargetPaths;
      readonly approval: Extract<MultiFileWriteApproval, { status: "approved-for-write" }>;
      readonly perFilePatchPlan?: PerFilePatchPlan;
      readonly recoveryAuthorityCapture?: RecoveryAuthorityCaptureBatchResult;
      readonly workspaceWriterInvoked: true;
      readonly writerTarget: "selected-workspace";
      readonly selectedWorkspaceWrite: true;
      readonly writerStarted: true;
      readonly writeEffect: "verified";
      readonly writeFailureState: WorkspaceWriteFailureState;
      readonly changedFiles: MultiFileWriteTargetPaths;
      readonly failedFiles: readonly [];
      readonly writeIntents: MultiFileWriteTargetPaths;
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
      readonly source: "multi-file-apply-patch-workspace-write-route";
      readonly status: "blocked";
      readonly blocker: MultiFileWriteRouteBlocker;
      readonly targetPaths: readonly string[];
      readonly targetPath?: string;
      readonly approval: MultiFileWriteApproval;
      readonly perFilePatchPlan?: PerFilePatchPlan;
      readonly recoveryAuthorityCapture?: RecoveryAuthorityCaptureBatchResult;
      readonly failures: readonly PatchFailure[];
      readonly workspaceWriterInvoked: boolean;
      readonly writerTarget: "none" | "selected-workspace";
      readonly selectedWorkspaceWrite: boolean;
      readonly writerStarted: boolean;
      readonly writeEffect: WorkspaceWriteEffect;
      readonly writeFailureState: WorkspaceWriteFailureState;
      readonly changedFiles: readonly string[];
      readonly failedFiles: readonly PatchFailure[];
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
    }
  | {
      readonly source: "multi-file-apply-patch-workspace-write-route";
      readonly status: "bypassed";
      readonly blocker: "single-file-bypass";
      readonly targetPaths: readonly string[];
      readonly approval: MultiFileWriteApproval;
      readonly perFilePatchPlan?: PerFilePatchPlan;
      readonly failures: readonly [];
      readonly workspaceWriterInvoked: false;
      readonly writerTarget: "none";
      readonly selectedWorkspaceWrite: false;
      readonly writerStarted: false;
      readonly writeEffect: "none";
      readonly writeFailureState: WorkspaceWriteFailureState;
      readonly changedFiles: readonly [];
      readonly failedFiles: readonly [];
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
    };

export function patchIsExactlyTwoUpdateFiles(rawPatchText: string): boolean {
  const parsed = parseApplyPatchText(rawPatchText);
  return (
    parsed.ok === true &&
    parsed.patch.operations.length === 2 &&
    parsed.patch.operations.every((operation) => operation.kind === "update")
  );
}

export function patchIsTwoOrThreeUpdateFiles(rawPatchText: string): boolean {
  return patchIsBoundedUpdateFiles(rawPatchText);
}

export function patchIsTwoThreeOrFourUpdateFiles(rawPatchText: string): boolean {
  return patchIsBoundedUpdateFiles(rawPatchText);
}

export function patchIsBoundedUpdateFiles(rawPatchText: string): boolean {
  const parsed = parseApplyPatchText(rawPatchText);
  return (
    parsed.ok === true &&
    isBoundedWriteOperationCount(parsed.patch.operations.length) &&
    parsed.patch.operations.every((operation) => operation.kind === "update")
  );
}

export async function runMultiFileWriteRoute(
  options: MultiFileWriteRouteOptions,
): Promise<MultiFileWriteRoute> {
  if (options.abortSignal?.aborted) {
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase: "before-writer",
    });
    return blocked({
      blocker: "aborted-before-write",
      targetPaths: [],
      approval: buildApproval([], options.requestedUserDecision, false),
      failures: [],
      nextAction:
        "Stop: apply_patch multi-file workspace write was aborted before the workspace writer became reachable.",
      evidence: [
        "apply-patch-multi-file-write-route:aborted-before-write",
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  if (!options.explicitRuntimeOptIn) {
    return blocked({
      blocker: "runtime-opt-in-missing",
      targetPaths: [],
      approval: buildApproval([], options.requestedUserDecision, false),
      failures: [],
      nextAction:
        "Keep multi-file Update File rejected unless an explicit runtime route opt-in is present.",
      evidence: ["apply-patch-multi-file-write-route:runtime-opt-in-missing"],
    });
  }

  const perFilePatchPlan = buildPerFilePatchPlan({
    workspaceRoot: options.workspaceRoot,
    rawPatchText: options.rawPatchText,
    readFile: options.readFile,
  });

  const parsed = parseApplyPatchText(options.rawPatchText);
  if (parsed.ok === false) {
    return blocked({
      blocker: "patch-parse",
      targetPaths: [],
      approval: buildApproval([], options.requestedUserDecision, false),
      perFilePatchPlan,
      failures: [parsed.failure],
      nextAction: parsed.failure.nextAction,
      evidence: ["apply-patch-multi-file-write-route:parse-blocked"],
    });
  }

  const targetPaths = parsed.patch.operations.map((operation) => operation.path);
  const approval = buildApproval(
    targetPaths,
    options.requestedUserDecision,
    options.explicitWorkspaceWriteOptIn,
  );

  if (
    parsed.patch.operations.length === 1 &&
    parsed.patch.operations[0]?.kind === "update"
  ) {
    return bypassed({
      targetPaths,
      approval,
      perFilePatchPlan,
      nextAction:
        "Single-file Update File patches remain owned by the existing single-file workspace write route.",
      evidence: ["apply-patch-multi-file-write-route:single-file-bypass"],
    });
  }

  const updateOperations = parsed.patch.operations.filter(
    (operation) => operation.kind === "update",
  );
  if (updateOperations.length !== parsed.patch.operations.length) {
    return blocked({
      blocker: "unsupported-operation",
      targetPaths,
      approval,
      perFilePatchPlan,
      failures: [unsupportedMultiFileWriteFailure(parsed.patch.operations)],
      nextAction:
        `Use 2-${MAX_BOUNDED_WRITE_OPERATIONS} existing-file Update File operations. Add, delete, move, mixed, and broad apply_patch shapes remain rejected.`,
      evidence: [
        "apply-patch-multi-file-write-route:unsupported-operation",
        "apply-patch-multi-file-write-route:no-add-delete-move",
      ],
    });
  }

  if (!multiFileUpdateCountIsEnabled(updateOperations.length)) {
    return blocked({
      blocker: "too-many-files",
      targetPaths,
      approval,
      perFilePatchPlan,
      failures: [
        {
          code: "patch-apply-plan-not-verified",
          message:
            `Multi-file workspace write route accepts 2-${MAX_BOUNDED_WRITE_OPERATIONS} Update File operations.`,
          nextAction:
            `Use 2-${MAX_BOUNDED_WRITE_OPERATIONS} existing selected-workspace files; ${MAX_BOUNDED_WRITE_OPERATIONS + 1}+ files remain outside this candidate route.`,
        },
      ],
      nextAction:
        `Use 2-${MAX_BOUNDED_WRITE_OPERATIONS} existing selected-workspace Update File targets; keep ${MAX_BOUNDED_WRITE_OPERATIONS + 1}+ files out of this route.`,
      evidence: ["apply-patch-multi-file-write-route:bounded-small-n-required"],
    });
  }

  const targetCount = updateOperations.length as MultiFileUpdateTargetCount;
  if (new Set(targetPaths).size !== targetCount) {
    return blocked({
      blocker: "target-mismatch",
      targetPaths,
      approval,
      perFilePatchPlan,
      failures: [
        {
          code: "patch-apply-plan-not-verified",
          message:
            "Multi-file workspace write route requires distinct target files.",
          nextAction:
            `Regenerate the patch with exactly ${targetCount} distinct existing selected-workspace files.`,
        },
      ],
      nextAction:
        `Regenerate the patch with exactly ${targetCount} distinct existing selected-workspace files.`,
      evidence: ["apply-patch-multi-file-write-route:distinct-targets-required"],
    });
  }

  if (!options.explicitWorkspaceWriteOptIn) {
    return blocked({
      blocker: "workspace-write-opt-in-missing",
      targetPaths,
      approval,
      perFilePatchPlan,
      failures: [],
      nextAction:
        "Keep multi-file Update File no-write unless the selected-workspace write entrypoint is explicitly opted in.",
      evidence: [
        "apply-patch-multi-file-write-route:workspace-write-opt-in-missing",
      ],
    });
  }

  if (approval.status !== "approved-for-write") {
    return blocked({
      blocker: "write-decision",
      targetPaths,
      approval,
      perFilePatchPlan,
      failures: [],
      nextAction:
        options.requestedUserDecision === "denied"
          ? `Do not write these ${targetCount} files. Surface the denial and require a fresh explicit approval before any future write.`
          : `Request explicit approval for writing exactly these ${targetCount} existing files before the multi-file route can write.`,
      evidence: [
        "apply-patch-multi-file-write-route:write-decision-blocked",
        "apply-patch-multi-file-write-route:explicit-approval-required",
      ],
    });
  }

  for (const targetPath of targetPaths) {
    if (!pathStaysInsideWorkspace(options.workspaceRoot, targetPath)) {
      return blocked({
        blocker: "workspace-boundary",
        targetPaths,
        targetPath,
        approval,
        perFilePatchPlan,
        failures: [workspaceBoundaryFailure(targetPath)],
        nextAction: "Refuse to write outside the selected workspace.",
        evidence: [
          "apply-patch-multi-file-write-route:workspace-boundary-blocked",
        ],
      });
    }

    const targetAuthority = options.validateWriteTarget(targetPath);
    if (targetAuthority.ok === false) {
      return blocked({
        blocker: "workspace-boundary",
        targetPaths,
        targetPath,
        approval,
        perFilePatchPlan,
        failures: [patchFailureFromWriteAuthority(targetPath, targetAuthority)],
        nextAction: targetAuthority.message,
        evidence: [
          "apply-patch-multi-file-write-route:workspace-boundary-blocked",
          ...targetAuthority.evidence,
        ],
      });
    }
  }

  const verification = verifyParsedPatch(parsed.patch, {
    workspaceRoot: options.workspaceRoot,
    readFile: options.readFile,
    supportedOperations: ["update"],
  });
  if (verification.ok === false) {
    return blocked({
      blocker: "patch-verification",
      targetPaths,
      approval,
      perFilePatchPlan,
      failures: verification.failures,
      nextAction:
        verification.failures[0]?.nextAction ??
        `Regenerate the ${targetCount}-file Update File patch against current content.`,
      evidence: ["apply-patch-multi-file-write-route:verification-blocked"],
    });
  }

  const writeIntent = buildNoPartialPatchApplicationContract(verification);
  if (writeIntent.ok === false) {
    return blocked({
      blocker: "patch-verification",
      targetPaths,
      approval,
      perFilePatchPlan,
      failures: writeIntent.failures,
      nextAction:
        writeIntent.failures[0]?.nextAction ??
        `Regenerate the ${targetCount}-file Update File patch.`,
      evidence: ["apply-patch-multi-file-write-route:no-partial-blocked"],
    });
  }

  if (!writeIntentMatchesTargets(writeIntent.writeIntents, targetPaths)) {
    return blocked({
      blocker: "target-mismatch",
      targetPaths,
      approval,
      perFilePatchPlan,
      failures: [],
      nextAction:
        "Only the approval-bound Update File targets may enter the multi-file workspace write route.",
      evidence: ["apply-patch-multi-file-write-route:target-mismatch"],
    });
  }

  for (const operation of verification.plan.operations) {
    const targetPath = operation.operation.path;
    const finalContent = options.readVerifiedFile(targetPath);
    if (
      finalContent === undefined ||
      finalContent !== operation.originalContent
    ) {
      return blocked({
        blocker: "final-stale-read",
        targetPaths,
        targetPath,
        approval,
        perFilePatchPlan,
        failures: [finalStaleReadFailure(targetPath)],
        nextAction:
          `No workspace writer ran. Re-read all ${targetCount} target files and regenerate the Update File patch from current content.`,
        evidence: [
          "apply-patch-multi-file-write-route:final-stale-read-blocked",
          "apply-patch-multi-file-write-route:all-final-stale-read-before-writer",
        ],
      });
    }
  }

  for (const intent of writeIntent.writeIntents) {
    const finalContent = options.readVerifiedFile(intent.path);
    if (finalContent === intent.content) {
      return blocked({
        blocker: "no-op",
        targetPaths,
        targetPath: intent.path,
        approval,
        perFilePatchPlan,
        failures: [],
        nextAction:
          "No multi-file workspace write was performed because at least one approved update would not change its target file.",
        evidence: ["apply-patch-multi-file-write-route:no-op-blocked-before-writer"],
      });
    }
  }

  if (options.abortSignal?.aborted) {
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase: "before-writer",
      targetPath: targetPaths[0],
    });
    return blocked({
      blocker: "aborted-before-write",
      targetPaths,
      approval,
      perFilePatchPlan,
      failures: [],
      nextAction:
        "Stop: apply_patch multi-file workspace write was aborted after final stale-read but before the workspace writer ran.",
      evidence: [
        "apply-patch-multi-file-write-route:aborted-before-writer",
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  const recoveryAuthorityCapture =
    options.recoveryAuthority &&
    multiFileUpdateCountIsEnabled(targetCount)
      ? await captureRecoveryAuthorityRecords({
          store: options.recoveryAuthority,
          records: writeIntent.writeIntents.map((intent, index) => {
            const originalContent = verification.plan.operations.find(
              (operation) => operation.operation.path === intent.path,
            )?.originalContent;
            return {
              recordId: recordIdForPath("update", intent.path, index),
              workspaceRelativePath: intent.path,
              operationKind: "update" as const,
              beforeState: "exists" as const,
              beforeContent: originalContent,
              expectedCurrentState: "exists" as const,
              expectedCurrentContent: intent.content,
            };
          }),
        })
      : undefined;
  if (recoveryAuthorityCapture?.status === "blocked") {
    return blocked({
      blocker: "recovery-authority-capture",
      targetPaths,
      approval,
      perFilePatchPlan,
      failures: [],
      recoveryAuthorityCapture,
      nextAction:
        "No multi-file writer ran because recovery authority capture failed before the first write.",
      evidence: [
        "apply-patch-multi-file-write-route:recovery-authority-capture-blocked",
        ...recoveryAuthorityCapture.evidence,
      ],
    });
  }

  const applied = await applyMultiFileUpdateIntents(writeIntent, {
    expectedFileCount: targetCount,
    writeFile: options.writeFile,
    readFile: options.readVerifiedFile,
  });
  if (applied.ok === false) {
    const failedPath = applied.failedFiles[0]?.path ?? targetPaths[0];
    const phase: WorkspaceWriteFailurePhase =
      applied.failureKind === "post-write-verification"
        ? "post-write-verification-failed"
        : "writer-failed";
    const blocker: MultiFileWriteRouteBlocker =
      applied.failureKind === "post-write-verification"
        ? "post-write-verification"
        : "write-application";
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase,
      targetPath: failedPath,
    });
    const nextAction =
      "Stop: multi-file workspace write is partial or uncertain. Inspect/re-read all attempted files before retrying; no rollback was attempted.";
    return blocked({
      blocker,
      targetPaths,
      targetPath: failedPath,
      approval,
      perFilePatchPlan,
      recoveryAuthorityCapture,
      failures: applied.failedFiles,
      changedFiles: applied.changedFiles,
      writeIntents: targetPaths,
      workspaceWriterInvoked: true,
      writerTarget: "selected-workspace",
      selectedWorkspaceWrite: true,
      postWriteVerification: applied.postWriteVerification,
      nextAction,
      evidence: [
        `apply-patch-multi-file-write-route:${blocker}-blocked`,
        "apply-patch-multi-file-write-route:sequential-write-no-rollback",
        "apply-patch-multi-file-write-route:partial-failure-stopped",
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  const nextAction =
    `Review the ${targetCount} selected workspace changes; default apply_patch remains rejected outside this explicit candidate write entrypoint.`;
  const writeFailureState = buildWorkspaceWriteFailureState({
    phase: "verified-write",
    targetPath: applied.changedFiles.join(", "),
  });
  const changedFiles = toSupportedTargetPaths(applied.changedFiles, targetCount);
  if (!changedFiles) {
    return blocked({
      blocker: "target-mismatch",
      targetPaths,
      approval,
      perFilePatchPlan,
      failures: [],
      nextAction:
        "Only verified approved target files may be reported as changed by the multi-file workspace write route.",
      evidence: ["apply-patch-multi-file-write-route:verified-target-mismatch"],
    });
  }
  return {
    source: "multi-file-apply-patch-workspace-write-route",
    status: "written",
    targetPaths: changedFiles,
    approval,
    perFilePatchPlan,
    ...(recoveryAuthorityCapture ? { recoveryAuthorityCapture } : {}),
    workspaceWriterInvoked: true,
    writerTarget: "selected-workspace",
    selectedWorkspaceWrite: true,
    writerStarted: true,
    writeEffect: "verified",
    writeFailureState,
    changedFiles,
    failedFiles: [],
    writeIntents: changedFiles,
    appliedPatchRecord: false,
    postWriteVerification: "passed",
    terminalClassification: "success",
    terminalSuccessAllowed: true,
    mutationSuccessClaimAllowed: true,
    resultSessionStatus: "write-success",
    nextAction,
    doNext: nextAction,
    evidence: [
      "apply-patch-multi-file-write-route:explicit-runtime-opt-in",
      "apply-patch-multi-file-write-route:explicit-workspace-write-opt-in",
      "apply-patch-multi-file-write-route:approved-for-write",
      "apply-patch-multi-file-write-route:approval-targets-listed",
      `apply-patch-multi-file-write-route:bounded-${targetCount}-update-files`,
      ...legacyExactUpdateEvidence(targetCount),
      "apply-patch-multi-file-write-route:existing-files-only",
      "apply-patch-multi-file-write-route:all-preflight-before-writer",
      "apply-patch-multi-file-write-route:all-final-stale-read-before-writer",
      "apply-patch-multi-file-write-route:sequential-write-no-rollback",
      "apply-patch-multi-file-write-route:workspace-writer-invoked",
      "apply-patch-multi-file-write-route:selected-workspace-write",
      "apply-patch-multi-file-write-route:post-write-verification-passed",
      "apply-patch-multi-file-write-route:success-after-verified-write",
      "apply-patch-multi-file-write-route:default-production-rejection-unchanged",
      ...writeFailureState.evidence,
    ],
  };
}

function buildApproval(
  targetPaths: readonly string[],
  requestedUserDecision: SingleFileApplyPatchRequestedUserDecision | undefined,
  explicitWorkspaceWriteOptIn: boolean,
): MultiFileWriteApproval {
  const supportedTargetPaths = toSupportedTargetPaths(targetPaths);
  if (
    explicitWorkspaceWriteOptIn &&
    requestedUserDecision === "approved" &&
    supportedTargetPaths
  ) {
    return {
      status: "approved-for-write",
      targetPaths: supportedTargetPaths,
      message: `Approved writing exactly these ${targetPaths.length} existing files: ${targetPaths.join(", ")}`,
    };
  }
  return {
    status:
      requestedUserDecision === "denied"
        ? "denied"
        : requestedUserDecision === undefined
          ? "not-requested"
          : "pending",
    targetPaths: [...targetPaths],
    message:
      multiFileUpdateCountIsEnabled(targetPaths.length)
        ? `Approval required for writing exactly these ${targetPaths.length} existing files: ${targetPaths.join(", ")}`
        : `Approval required for 2-${MAX_BOUNDED_WRITE_OPERATIONS} existing selected-workspace Update File targets.`,
  };
}

function writeIntentMatchesTargets(
  writeIntents: readonly { path: string; kind: string }[],
  targetPaths: readonly string[],
): boolean {
  if (writeIntents.length !== targetPaths.length) {
    return false;
  }
  return writeIntents.every(
    (intent, index) => intent.kind === "update" && intent.path === targetPaths[index],
  );
}

function unsupportedMultiFileWriteFailure(
  operations: readonly PatchFileOperation[],
): PatchFailure {
  const operation = operations.find((entry) => entry.kind !== "update") ?? operations[0];
  return {
    code: "patch-verify-operation-unsupported",
    ...(operation ? { path: operation.path } : {}),
    message:
      `Multi-file workspace write route only accepts 2-${MAX_BOUNDED_WRITE_OPERATIONS} Update File operations.`,
    nextAction:
      "Keep add, delete, move, mixed, and broad apply_patch shapes out of this candidate write route.",
  };
}

function workspaceBoundaryFailure(targetPath: string): PatchFailure {
  return {
    code: "patch-verify-path-outside-workspace",
    path: targetPath,
    message: "Patch path resolves outside the workspace root.",
    nextAction:
      "Regenerate the Update File patch with paths inside the selected workspace.",
  };
}

function finalStaleReadFailure(targetPath: string): PatchFailure {
  return {
    code: "patch-apply-plan-not-verified",
    path: targetPath,
    message:
      "Final stale-read failed before the multi-file workspace writer started.",
    nextAction:
      "Re-read all target files and regenerate the Update File patch from current content.",
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
        ? "Re-read the workspace and regenerate the patch against existing target files."
        : "Choose regular existing files inside the selected workspace before using the multi-file write route.",
  };
}

function toSupportedTargetPaths(
  targetPaths: readonly string[],
  expectedCount?: MultiFileUpdateTargetCount,
): MultiFileWriteTargetPaths | undefined {
  if (
    (expectedCount === undefined || targetPaths.length === expectedCount) &&
    isBoundedWriteOperationCount(targetPaths.length) &&
    targetPaths.every(Boolean)
  ) {
    return [...targetPaths];
  }
  return undefined;
}

function multiFileUpdateCountIsEnabled(count: number): count is MultiFileUpdateTargetCount {
  return isBoundedWriteOperationCount(count);
}

function legacyExactUpdateEvidence(count: number): readonly string[] {
  if (count === 2 || count === 3 || count === 4) {
    return [`apply-patch-multi-file-write-route:exactly-${targetCountWord(count)}-update-files`];
  }
  return [];
}

function targetCountWord(count: 2 | 3 | 4): "two" | "three" | "four" {
  return count === 2 ? "two" : count === 3 ? "three" : "four";
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

function recordIdForPath(kind: string, targetPath: string, index: number): string {
  return `${kind}-${index + 1}-${targetPath.replaceAll(/[^A-Za-z0-9._-]/g, "-")}`;
}

function bypassed(input: {
  readonly targetPaths: readonly string[];
  readonly approval: MultiFileWriteApproval;
  readonly perFilePatchPlan?: PerFilePatchPlan;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): MultiFileWriteRoute {
  const writeFailureState = buildWorkspaceWriteFailureState({
    phase: "before-writer",
    targetPath: input.targetPaths[0],
  });
  return {
    source: "multi-file-apply-patch-workspace-write-route",
    status: "bypassed",
    blocker: "single-file-bypass",
    targetPaths: input.targetPaths,
    approval: input.approval,
    ...(input.perFilePatchPlan ? { perFilePatchPlan: input.perFilePatchPlan } : {}),
    failures: [],
    workspaceWriterInvoked: false,
    writerTarget: "none",
    selectedWorkspaceWrite: false,
    writerStarted: false,
    writeEffect: "none",
    writeFailureState,
    changedFiles: [],
    failedFiles: [],
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
      "apply-patch-multi-file-write-route:no-writer-invoked",
      "apply-patch-multi-file-write-route:changed-files-empty",
      "apply-patch-multi-file-write-route:write-intents-empty",
    ],
  };
}

function blocked(
  input: {
    readonly blocker: MultiFileWriteRouteBlocker;
    readonly targetPaths: readonly string[];
    readonly targetPath?: string;
    readonly approval: MultiFileWriteApproval;
    readonly perFilePatchPlan?: PerFilePatchPlan;
    readonly recoveryAuthorityCapture?: RecoveryAuthorityCaptureBatchResult;
    readonly failures: readonly PatchFailure[];
    readonly changedFiles?: readonly string[];
    readonly writeIntents?: readonly string[];
    readonly workspaceWriterInvoked?: boolean;
    readonly writerTarget?: "none" | "selected-workspace";
    readonly selectedWorkspaceWrite?: boolean;
    readonly writeFailureState?: WorkspaceWriteFailureState;
    readonly failurePhase?: WorkspaceWriteFailurePhase;
    readonly postWriteVerification?: "not-run" | "blocked" | "failed";
    readonly nextAction: string;
    readonly evidence: readonly string[];
  },
): MultiFileWriteRoute {
  const writeFailureState =
    input.writeFailureState ??
    buildWorkspaceWriteFailureState({
      phase: input.failurePhase ?? "before-writer",
      targetPath: input.targetPath,
    });
  const changedFiles = input.changedFiles ?? [];
  const writeIntents = input.writeIntents ?? [];
  return {
    source: "multi-file-apply-patch-workspace-write-route",
    status: "blocked",
    blocker: input.blocker,
    targetPaths: input.targetPaths,
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    approval: input.approval,
    ...(input.perFilePatchPlan ? { perFilePatchPlan: input.perFilePatchPlan } : {}),
    ...(input.recoveryAuthorityCapture
      ? { recoveryAuthorityCapture: input.recoveryAuthorityCapture }
      : {}),
    failures: input.failures,
    workspaceWriterInvoked: input.workspaceWriterInvoked ?? false,
    writerTarget: input.writerTarget ?? "none",
    selectedWorkspaceWrite: input.selectedWorkspaceWrite ?? false,
    writerStarted: writeFailureState.writerStarted,
    writeEffect: writeFailureState.writeEffect,
    writeFailureState,
    changedFiles: [...changedFiles],
    failedFiles: input.failures,
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
      `apply-patch-multi-file-write-route:blocker:${input.blocker}`,
      `apply-patch-multi-file-write-route:write-effect:${writeFailureState.writeEffect}`,
      `apply-patch-multi-file-write-route:failure-phase:${writeFailureState.failurePhase}`,
      ...(changedFiles.length === 0
        ? ["apply-patch-multi-file-write-route:changed-files-empty"]
        : ["apply-patch-multi-file-write-route:changed-files-verified-prefix-only"]),
      ...(writeIntents.length === 0
        ? ["apply-patch-multi-file-write-route:write-intents-empty"]
        : ["apply-patch-multi-file-write-route:write-intents-approved-targets"]),
      ...(input.workspaceWriterInvoked
        ? ["apply-patch-multi-file-write-route:writer-invoked-no-success-claim"]
        : ["apply-patch-multi-file-write-route:no-writer-invoked"]),
      "apply-patch-multi-file-write-route:no-applied-patch-record",
      "apply-patch-multi-file-write-route:no-success-claim",
      "apply-patch-multi-file-write-route:no-rollback",
    ],
  };
}
