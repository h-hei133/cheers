import path from "node:path";
import {
  captureRecoveryAuthorityRecords,
  type RecoveryAuthorityCaptureBatchResult,
  type RecoveryAuthorityStoreConfig,
} from "../patchRecovery/recoveryAuthorityStore.js";
import { buildNoPartialPatchApplicationContract } from "../patchApplication/noPartialApply.js";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import type {
  ParsedPatch,
  PatchFailure,
  PatchFileOperation,
  PatchHunk,
  PatchOperationKind,
  PatchVerificationResult,
  VerifiedPatchFileOperation,
} from "../patchParsing/types.js";
import {
  buildPerFilePatchPlan,
  type PerFilePatchPlan,
} from "./perFilePatchPlan.js";
import {
  MAX_BOUNDED_WRITE_OPERATIONS,
  isBoundedWriteOperationCount,
} from "./boundedWritePolicy.js";
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

export type MixedFileWriteRouteStatus = "written" | "blocked";

export type MixedFileWriteRouteBlocker =
  | "runtime-opt-in-missing"
  | "workspace-write-opt-in-missing"
  | "write-decision"
  | "patch-parse"
  | "unsupported-operation"
  | "target-mismatch"
  | "workspace-boundary"
  | "patch-verification"
  | "final-preflight"
  | "aborted-before-write"
  | "recovery-authority-capture"
  | "write-application"
  | "post-write-verification";

export type MixedFileWriteTargetPaths = readonly string[];

export type MixedFileWriteApproval =
  | {
      readonly status: "approved-for-write";
      readonly targetPaths: MixedFileWriteTargetPaths;
      readonly message: string;
    }
  | {
      readonly status: "denied" | "pending" | "not-requested";
      readonly targetPaths: readonly string[];
      readonly message: string;
    };

export interface MixedFileWriteRouteOptions {
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
  readonly explicitRuntimeOptIn: boolean;
  readonly explicitWorkspaceWriteOptIn: boolean;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly defaultProductionRejectionUnchanged: true;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly readVerifiedFile: (relativePath: string) => string | undefined;
  readonly directoryExists: (absolutePath: string) => boolean;
  readonly validateWriteTarget: (
    relativePath: string,
  ) => WorkspaceWriteTargetAuthority;
  readonly validateCreateTarget: (
    relativePath: string,
  ) => WorkspaceCreateTargetAuthority;
  readonly writeFile: (relativePath: string, content: string) => void | Promise<void>;
  readonly createFileExclusive: (
    relativePath: string,
    content: string,
  ) => void | Promise<void>;
  readonly moveFileExclusive: (
    sourcePath: string,
    targetPath: string,
  ) => void | Promise<void>;
  readonly deleteFile: (relativePath: string) => void | Promise<void>;
  readonly recoveryAuthority?: RecoveryAuthorityStoreConfig;
  readonly abortSignal?: AbortSignal;
}

export type MixedFileWriteRoute =
  | {
      readonly source: "mixed-file-apply-patch-workspace-write-route";
      readonly status: "written";
      readonly targetPaths: MixedFileWriteTargetPaths;
      readonly operationKinds: readonly PatchOperationKind[];
      readonly approval: Extract<MixedFileWriteApproval, { status: "approved-for-write" }>;
      readonly perFilePatchPlan?: PerFilePatchPlan;
      readonly recoveryAuthorityCapture?: RecoveryAuthorityCaptureBatchResult;
      readonly workspaceWriterInvoked: true;
      readonly creatorInvoked: boolean;
      readonly deleteMoveInvoked: boolean;
      readonly writerTarget: "selected-workspace";
      readonly selectedWorkspaceWrite: true;
      readonly writerStarted: true;
      readonly writeEffect: "verified";
      readonly writeFailureState: WorkspaceWriteFailureState;
      readonly changedFiles: MixedFileWriteTargetPaths;
      readonly failedFiles: readonly [];
      readonly writeIntents: MixedFileWriteTargetPaths;
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
      readonly source: "mixed-file-apply-patch-workspace-write-route";
      readonly status: "blocked";
      readonly blocker: MixedFileWriteRouteBlocker;
      readonly targetPaths: readonly string[];
      readonly targetPath?: string;
      readonly operationKinds: readonly PatchOperationKind[];
      readonly approval: MixedFileWriteApproval;
      readonly perFilePatchPlan?: PerFilePatchPlan;
      readonly recoveryAuthorityCapture?: RecoveryAuthorityCaptureBatchResult;
      readonly failures: readonly PatchFailure[];
      readonly workspaceWriterInvoked: boolean;
      readonly creatorInvoked: boolean;
      readonly deleteMoveInvoked: boolean;
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
    };

export function patchIsExactlyTwoMixedWriteFiles(rawPatchText: string): boolean {
  return patchIsTwoOrThreeMixedWriteFiles(rawPatchText);
}

export function patchIsTwoOrThreeMixedWriteFiles(rawPatchText: string): boolean {
  return patchIsBoundedMixedWriteFiles(rawPatchText);
}

export function patchIsTwoThreeOrFourMixedWriteFiles(rawPatchText: string): boolean {
  return patchIsBoundedMixedWriteFiles(rawPatchText);
}

export function patchIsBoundedMixedWriteFiles(rawPatchText: string): boolean {
  const parsed = parseApplyPatchText(rawPatchText);
  if (
    parsed.ok === false ||
    !mixedOperationCountIsEnabled(parsed.patch.operations.length)
  ) {
    return false;
  }
  const kinds = parsed.patch.operations.map((operation) => operation.kind);
  return boundedOperationCombinationIsEnabled(kinds);
}

export async function runMixedFileWriteRoute(
  options: MixedFileWriteRouteOptions,
): Promise<MixedFileWriteRoute> {
  if (options.abortSignal?.aborted) {
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase: "before-writer",
    });
    return blocked({
      blocker: "aborted-before-write",
      targetPaths: [],
      operationKinds: [],
      approval: buildApproval([], options.requestedUserDecision, false),
      failures: [],
      nextAction:
        "Stop: apply_patch mixed workspace write was aborted before any workspace writer became reachable.",
      evidence: [
        "apply-patch-mixed-file-write-route:aborted-before-write",
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  if (!options.explicitRuntimeOptIn) {
    return blocked({
      blocker: "runtime-opt-in-missing",
      targetPaths: [],
      operationKinds: [],
      approval: buildApproval([], options.requestedUserDecision, false),
      failures: [],
      nextAction:
        "Keep mixed apply_patch writes rejected unless an explicit runtime route opt-in is present.",
      evidence: ["apply-patch-mixed-file-write-route:runtime-opt-in-missing"],
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
      targetPaths: [],
      operationKinds: [],
      approval: buildApproval([], options.requestedUserDecision, false),
      perFilePatchPlan,
      failures: [parsed.failure],
      nextAction: parsed.failure.nextAction,
      evidence: ["apply-patch-mixed-file-write-route:parse-blocked"],
    });
  }

  const operations = parsed.patch.operations;
  const targetPaths = operations.map(targetPathForOperation);
  const operationKinds = operations.map((operation) => operation.kind);
  const approval = buildApproval(
    targetPaths,
    options.requestedUserDecision,
    options.explicitWorkspaceWriteOptIn,
  );

  if (!boundedOperationCombinationIsEnabled(operationKinds)) {
    return blocked({
      blocker: "unsupported-operation",
      targetPaths,
      operationKinds,
      approval,
      perFilePatchPlan,
      failures: [unsupportedMixedFailure(operations)],
      nextAction:
        `Use 2-${MAX_BOUNDED_WRITE_OPERATIONS} mixed operations from the guarded update/create/move/delete lanes, or 2-${MAX_BOUNDED_WRITE_OPERATIONS} destructive delete-only/move-only operations. Other same-family, ${MAX_BOUNDED_WRITE_OPERATIONS + 1}+, and broad patches stay outside this route.`,
      evidence: [
        "apply-patch-mixed-file-write-route:unsupported-operation",
        "apply-patch-mixed-file-write-route:bounded-small-n-operation-required",
      ],
    });
  }

  if (!boundedOperationCombinationIsEnabled(operationKinds)) {
    return blocked({
      blocker: "unsupported-operation",
      targetPaths,
      operationKinds,
      approval,
      perFilePatchPlan,
      failures: [unsupportedMixedFailure(operations)],
      nextAction:
        "This mixed operation combination is not enabled by the guarded bounded mixed write route.",
      evidence: ["apply-patch-mixed-file-write-route:mixed-combination-not-enabled"],
    });
  }

  const supportedTargetPaths = toSupportedTargetPaths(targetPaths);
  if (!supportedTargetPaths) {
    return blocked({
      blocker: "target-mismatch",
      targetPaths,
      operationKinds,
      approval,
      perFilePatchPlan,
      failures: [targetMismatchFailure()],
      nextAction:
        `Regenerate the mixed patch with 2-${MAX_BOUNDED_WRITE_OPERATIONS} operation targets.`,
      evidence: ["apply-patch-mixed-file-write-route:target-count-mismatch"],
    });
  }

  const pathConflict = firstPathConflict(options.workspaceRoot, operations);
  if (pathConflict) {
    return blocked({
      blocker: "target-mismatch",
      targetPaths,
      targetPath: pathConflict.path,
      operationKinds,
      approval,
      perFilePatchPlan,
      failures: [pathConflict],
      nextAction:
        "Regenerate the mixed patch so no operation source or target path is reused by another operation.",
      evidence: [
        "apply-patch-mixed-file-write-route:path-conflict-blocked",
        "apply-patch-mixed-file-write-route:duplicate-source-target-rejected",
      ],
    });
  }

  if (!options.explicitWorkspaceWriteOptIn) {
    return blocked({
      blocker: "workspace-write-opt-in-missing",
      targetPaths,
      operationKinds,
      approval,
      perFilePatchPlan,
      failures: [],
      nextAction:
        "Keep mixed apply_patch no-write unless the selected-workspace write entrypoint is explicitly opted in.",
      evidence: [
        "apply-patch-mixed-file-write-route:workspace-write-opt-in-missing",
      ],
    });
  }

  if (approval.status !== "approved-for-write") {
    return blocked({
      blocker: "write-decision",
      targetPaths,
      operationKinds,
      approval,
      perFilePatchPlan,
      failures: [],
      nextAction:
        options.requestedUserDecision === "denied"
          ? "Do not write these mixed operations. Surface the denial and require fresh explicit approval before any future write."
          : "Request explicit approval for writing exactly these mixed operation targets before the mixed route can write.",
      evidence: [
        "apply-patch-mixed-file-write-route:write-decision-blocked",
        "apply-patch-mixed-file-write-route:explicit-approval-required",
      ],
    });
  }

  const authorityFailure = firstAuthorityFailure(options, operations);
  if (authorityFailure) {
    return blocked({
      blocker: authorityFailure.blocker,
      targetPaths,
      targetPath: authorityFailure.failure.path,
      operationKinds,
      approval,
      perFilePatchPlan,
      failures: [authorityFailure.failure],
      nextAction: authorityFailure.nextAction,
      evidence: [
        "apply-patch-mixed-file-write-route:workspace-boundary-blocked",
        ...authorityFailure.evidence,
      ],
    });
  }

  const verification = verifyMixedPatchWithMoveUpdateDependencies(parsed.patch, {
    workspaceRoot: options.workspaceRoot,
    readFile: options.readFile,
    directoryExists: options.directoryExists,
  });
  if (verification.ok === false) {
    return blocked({
      blocker: "patch-verification",
      targetPaths,
      operationKinds,
      approval,
      perFilePatchPlan,
      failures: verification.failures,
      nextAction:
        verification.failures[0]?.nextAction ??
        "Regenerate the bounded mixed patch against current workspace state.",
      evidence: ["apply-patch-mixed-file-write-route:verification-blocked"],
    });
  }

  const moveContentFailure = firstMoveContentEditFailure(verification.plan.operations);
  if (moveContentFailure) {
    return blocked({
      blocker: "unsupported-operation",
      targetPaths,
      targetPath: moveContentFailure.path,
      operationKinds,
      approval,
      perFilePatchPlan,
      failures: [moveContentFailure],
      nextAction:
        "Regenerate a pure Move File operation and keep content edits in the immediately following update operation on the move target.",
      evidence: [
        "apply-patch-mixed-file-write-route:move-content-edit-blocked",
      ],
    });
  }

  const writeIntent = buildNoPartialPatchApplicationContract(verification);
  if (writeIntent.ok === false) {
    return blocked({
      blocker: "patch-verification",
      targetPaths,
      operationKinds,
      approval,
      perFilePatchPlan,
      failures: writeIntent.failures,
      nextAction:
        writeIntent.failures[0]?.nextAction ??
        "Regenerate the bounded mixed patch.",
      evidence: ["apply-patch-mixed-file-write-route:no-partial-blocked"],
    });
  }

  const finalPreflightFailure = firstFinalPreflightFailure(options, verification.plan.operations);
  if (finalPreflightFailure) {
    return blocked({
      blocker: finalPreflightFailure.blocker,
      targetPaths,
      targetPath: finalPreflightFailure.failure.path,
      operationKinds,
      approval,
      perFilePatchPlan,
      failures: [finalPreflightFailure.failure],
      nextAction: finalPreflightFailure.nextAction,
      evidence: [
        "apply-patch-mixed-file-write-route:final-preflight-blocked",
        "apply-patch-mixed-file-write-route:all-final-preflight-before-writer",
        ...finalPreflightFailure.evidence,
      ],
    });
  }

  if (options.abortSignal?.aborted) {
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase: "before-writer",
      targetPath: targetPaths[0],
    });
    return blocked({
      blocker: "aborted-before-write",
      targetPaths,
      operationKinds,
      approval,
      perFilePatchPlan,
      failures: [],
      nextAction:
        "Stop: apply_patch mixed workspace write was aborted after final preflight but before the first writer ran.",
      evidence: [
        "apply-patch-mixed-file-write-route:aborted-before-writer",
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  const recoveryAuthorityCapture = options.recoveryAuthority
    ? await captureRecoveryAuthorityRecords({
        store: options.recoveryAuthority,
        records: verification.plan.operations.flatMap((operation, index) =>
          buildRecoveryAuthorityRecordsForOperation({
            operation,
            index,
            includeMoveTargetAbsenceRecord: operation.operation.kind === "move",
          }),
        ),
      })
    : undefined;
  if (recoveryAuthorityCapture?.status === "blocked") {
    return blocked({
      blocker: "recovery-authority-capture",
      targetPaths,
      operationKinds,
      approval,
      perFilePatchPlan,
      recoveryAuthorityCapture,
      failures: [],
      nextAction:
        "No mixed workspace writer ran because recovery authority capture failed before the write.",
      evidence: [
        "apply-patch-mixed-file-write-route:recovery-authority-capture-blocked",
        ...recoveryAuthorityCapture.evidence,
      ],
    });
  }

  const applied = await applyMixedOperations(options, verification.plan.operations);
  if (applied.ok === false) {
    const phase: WorkspaceWriteFailurePhase =
      applied.postWriteVerification === "failed"
        ? "post-write-verification-failed"
        : "writer-failed";
    const blocker: MixedFileWriteRouteBlocker =
      applied.postWriteVerification === "failed"
        ? "post-write-verification"
        : "write-application";
    const failedPath = applied.failedFiles[0]?.path ?? targetPaths[0];
    const writeFailureState = buildWorkspaceWriteFailureState({
      phase,
      targetPath: failedPath,
    });
    return blocked({
      blocker,
      targetPaths,
      targetPath: failedPath,
      operationKinds,
      approval,
      perFilePatchPlan,
      recoveryAuthorityCapture,
      failures: applied.failedFiles,
      changedFiles: applied.changedFiles,
      writeIntents: targetPaths,
      workspaceWriterInvoked: true,
      creatorInvoked: operationKinds.includes("add"),
      deleteMoveInvoked:
        operationKinds.includes("delete") || operationKinds.includes("move"),
      writerTarget: "selected-workspace",
      selectedWorkspaceWrite: true,
      postWriteVerification: applied.postWriteVerification,
      nextAction:
        "Stop: mixed workspace write is partial or uncertain. Inspect/re-read all attempted paths before retrying; no rollback was attempted.",
      evidence: [
        `apply-patch-mixed-file-write-route:${blocker}-blocked`,
        "apply-patch-mixed-file-write-route:parsed-order-write-no-rollback",
        "apply-patch-mixed-file-write-route:partial-failure-stopped",
        ...writeFailureState.evidence,
      ],
      writeFailureState,
    });
  }

  const changedFiles = toSupportedTargetPaths(applied.changedFiles);
  if (!changedFiles) {
    return blocked({
      blocker: "target-mismatch",
      targetPaths,
      operationKinds,
      approval,
      perFilePatchPlan,
      failures: [targetMismatchFailure()],
      nextAction:
        "Only the approved mixed operation targets may be reported as changed.",
      evidence: ["apply-patch-mixed-file-write-route:verified-target-mismatch"],
    });
  }

  const nextAction =
    "Review the selected workspace mixed-operation changes; default apply_patch remains rejected outside this explicit candidate write entrypoint.";
  const writeFailureState = buildWorkspaceWriteFailureState({
    phase: "verified-write",
    targetPath: changedFiles.join(", "),
  });
  return {
    source: "mixed-file-apply-patch-workspace-write-route",
    status: "written",
    targetPaths: changedFiles,
    operationKinds,
    approval,
    perFilePatchPlan,
    ...(recoveryAuthorityCapture ? { recoveryAuthorityCapture } : {}),
    workspaceWriterInvoked: true,
    creatorInvoked: operationKinds.includes("add"),
    deleteMoveInvoked:
      operationKinds.includes("delete") || operationKinds.includes("move"),
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
      "apply-patch-mixed-file-write-route:explicit-runtime-opt-in",
      "apply-patch-mixed-file-write-route:explicit-workspace-write-opt-in",
      "apply-patch-mixed-file-write-route:approved-for-write",
      `apply-patch-mixed-file-write-route:exactly-${operationKinds.length}-bounded-operations`,
      ...(sameFamilyDestructiveKind(operationKinds)
        ? [
            `apply-patch-mixed-file-write-route:bounded-${sameFamilyDestructiveKind(operationKinds)}-only`,
          ]
        : [
            `apply-patch-mixed-file-write-route:exactly-${operationKinds.length}-mixed-operations`,
          ]),
      `apply-patch-mixed-file-write-route:operation-combination:${operationKinds.join("+")}`,
      "apply-patch-mixed-file-write-route:all-preflight-before-writer",
      "apply-patch-mixed-file-write-route:all-final-preflight-before-writer",
      "apply-patch-mixed-file-write-route:parsed-order-write-no-rollback",
      "apply-patch-mixed-file-write-route:workspace-writer-invoked",
      "apply-patch-mixed-file-write-route:selected-workspace-write",
      "apply-patch-mixed-file-write-route:post-write-verification-passed",
      "apply-patch-mixed-file-write-route:success-after-verified-write",
      "apply-patch-mixed-file-write-route:no-rollback",
      `apply-patch-mixed-file-write-route:no-${MAX_BOUNDED_WRITE_OPERATIONS + 1}-plus-mixed`,
      "apply-patch-mixed-file-write-route:no-5-plus-mixed",
      "apply-patch-mixed-file-write-route:no-broad-apply-patch",
      "apply-patch-mixed-file-write-route:default-production-rejection-unchanged",
      ...writeFailureState.evidence,
    ],
  };
}

function mixedOperationCountIsEnabled(count: number): boolean {
  return isBoundedWriteOperationCount(count);
}

function mixedCombinationIsEnabled(kinds: readonly PatchOperationKind[]): boolean {
  if (!mixedOperationCountIsEnabled(kinds.length) || new Set(kinds).size <= 1) {
    return false;
  }
  return kinds.every((kind) =>
    new Set<PatchOperationKind>([
      "add",
      "delete",
      "move",
      "update",
    ]).has(kind),
  );
}

function boundedOperationCombinationIsEnabled(
  kinds: readonly PatchOperationKind[],
): boolean {
  if (!mixedOperationCountIsEnabled(kinds.length)) {
    return false;
  }
  if (mixedCombinationIsEnabled(kinds)) {
    return true;
  }
  return Boolean(sameFamilyDestructiveKind(kinds));
}

function sameFamilyDestructiveKind(
  kinds: readonly PatchOperationKind[],
): "delete" | "move" | undefined {
  if (!mixedOperationCountIsEnabled(kinds.length) || new Set(kinds).size !== 1) {
    return undefined;
  }
  const [kind] = kinds;
  return kind === "delete" || kind === "move" ? kind : undefined;
}

function targetPathForOperation(operation: PatchFileOperation): string {
  return operation.kind === "move" ? operation.moveTo : operation.path;
}

function buildRecoveryAuthorityRecordsForOperation(input: {
  readonly operation: VerifiedPatchFileOperation;
  readonly index: number;
  readonly includeMoveTargetAbsenceRecord: boolean;
}): readonly Parameters<typeof captureRecoveryAuthorityRecords>[0]["records"][number][] {
  const record = buildRecoveryAuthorityRecord(input.operation, input.index);
  if (
    input.includeMoveTargetAbsenceRecord &&
    input.operation.operation.kind === "move"
  ) {
    return [
      record,
      {
        recordId: recordIdForPath(
          "move-target",
          input.operation.operation.moveTo,
          input.index,
        ),
        workspaceRelativePath: input.operation.operation.moveTo,
        operationKind: "move",
        beforeState: "absent",
        expectedCurrentState: "exists",
        expectedCurrentContent: input.operation.originalContent,
      },
    ];
  }
  return [record];
}

function buildRecoveryAuthorityRecord(
  operation: VerifiedPatchFileOperation,
  index: number,
): Parameters<typeof captureRecoveryAuthorityRecords>[0]["records"][number] {
  const path = capturePathForOperation(operation);
  const recoveryKind =
    operation.operation.kind === "add" ? "create" : operation.operation.kind;
  const common = {
    recordId: recordIdForPath(recoveryKind, path, index),
    workspaceRelativePath: path,
    operationKind: recoveryKind,
  } as const;

  switch (operation.operation.kind) {
    case "update":
      return {
        ...common,
        beforeState: "exists",
        beforeContent: operation.originalContent,
        expectedCurrentState: "exists",
        expectedCurrentContent: operation.plannedContent,
      };
    case "add":
      return {
        ...common,
        beforeState: "absent",
        expectedCurrentState: "exists",
        expectedCurrentContent: operation.plannedContent,
      };
    case "delete":
      return {
        ...common,
        beforeState: "exists",
        beforeContent: operation.originalContent,
        expectedCurrentState: "absent",
      };
    case "move":
      return {
        ...common,
        beforeState: "exists",
        beforeContent: operation.originalContent,
        expectedCurrentState: "absent",
      };
  }
}

function capturePathForOperation(operation: VerifiedPatchFileOperation): string {
  return operation.operation.kind === "move"
    ? operation.operation.path
    : operation.operation.path;
}

function recordIdForPath(kind: string, targetPath: string, index: number): string {
  return `${kind}-${index + 1}-${targetPath.replaceAll(/[^A-Za-z0-9._-]/g, "-")}`;
}

function operationPaths(operation: PatchFileOperation): readonly string[] {
  return operation.kind === "move"
    ? [operation.path, operation.moveTo]
    : [operation.path];
}

function firstPathConflict(
  workspaceRoot: string,
  operations: readonly PatchFileOperation[],
): PatchFailure | undefined {
  const seen = new Map<string, string>();
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index]!;
    for (const candidatePath of operationPaths(operation)) {
      const key = path.resolve(workspaceRoot, candidatePath);
      const previous = seen.get(key);
      if (previous) {
        if (isMoveTargetUpdateDependency(operations, index, candidatePath)) {
          continue;
        }
        return {
          code: "patch-apply-plan-not-verified",
          path: candidatePath,
          message: `Mixed apply_patch source/target path conflict: ${candidatePath} conflicts with ${previous}.`,
          nextAction:
            "Regenerate the mixed patch so each operation source and target path is distinct.",
        };
      }
      seen.set(key, candidatePath);
    }
  }
  return undefined;
}

function firstAuthorityFailure(
  options: MixedFileWriteRouteOptions,
  operations: readonly PatchFileOperation[],
):
  | {
      readonly blocker: "workspace-boundary" | "target-mismatch";
      readonly failure: PatchFailure;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    }
  | undefined {
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index]!;
    for (const candidatePath of operationPaths(operation)) {
      if (!pathStaysInsideWorkspace(options.workspaceRoot, candidatePath)) {
        return {
          blocker: "workspace-boundary",
          failure: workspaceBoundaryFailure(candidatePath),
          nextAction: "Refuse to write outside the selected workspace.",
          evidence: [],
        };
      }
    }

    if (
      (operation.kind === "delete" || operation.kind === "move") &&
      options.directoryExists(path.resolve(options.workspaceRoot, operation.path))
    ) {
      return {
        blocker: "workspace-boundary",
        failure: directoryOperationFailure(operation),
        nextAction:
          "Choose an existing regular file; directory delete/move is not enabled.",
        evidence: ["apply-patch-mixed-file-write-route:directory-operation-blocked"],
      };
    }

    if (operation.kind === "add") {
      const target = options.validateCreateTarget(operation.path);
      if (target.ok === false) {
        return createAuthorityFailure(operation.path, target);
      }
      continue;
    }

    if (isMoveTargetUpdateDependency(operations, index, operation.path)) {
      continue;
    }

    const source = options.validateWriteTarget(operation.path);
    if (source.ok === false) {
      return writeAuthorityFailure(operation.path, source);
    }

    if (operation.kind === "move") {
      const target = options.validateCreateTarget(operation.moveTo);
      if (target.ok === false) {
        return createAuthorityFailure(operation.moveTo, target);
      }
    }
  }
  return undefined;
}

function isMoveTargetUpdateDependency(
  operations: readonly PatchFileOperation[],
  index: number,
  candidatePath: string,
): boolean {
  const operation = operations[index];
  const previous = operations[index - 1];
  return (
    operation?.kind === "update" &&
    previous?.kind === "move" &&
    path.normalize(operation.path) === path.normalize(candidatePath) &&
    path.normalize(previous.moveTo) === path.normalize(candidatePath)
  );
}

function verifyMixedPatchWithMoveUpdateDependencies(
  patch: ParsedPatch,
  options: Pick<
    MixedFileWriteRouteOptions,
    "workspaceRoot" | "readFile" | "directoryExists"
  >,
): PatchVerificationResult {
  const verified: VerifiedPatchFileOperation[] = [];
  const plannedContentByPath = new Map<string, string | undefined>();

  for (let index = 0; index < patch.operations.length; index += 1) {
    const operation = patch.operations[index]!;
    const verifiedOperation = verifyMixedOperationInParsedOrder({
      operation,
      index,
      operations: patch.operations,
      options,
      plannedContentByPath,
    });
    if (verifiedOperation.ok === false) {
      return {
        ok: false,
        failures: verifiedOperation.failures,
        changedFiles: [],
      };
    }
    verified.push(verifiedOperation.operation);
    updatePlannedContentMap(plannedContentByPath, verifiedOperation.operation);
  }

  return {
    ok: true,
    plan: {
      parsedPatch: patch,
      operations: verified,
      atomicity: "verify-all-before-write",
    },
    warnings: [],
  };
}

type MixedOperationVerification =
  | { readonly ok: true; readonly operation: VerifiedPatchFileOperation }
  | { readonly ok: false; readonly failures: readonly PatchFailure[] };

function verifyMixedOperationInParsedOrder(input: {
  readonly operation: PatchFileOperation;
  readonly index: number;
  readonly operations: readonly PatchFileOperation[];
  readonly options: Pick<
    MixedFileWriteRouteOptions,
    "workspaceRoot" | "readFile" | "directoryExists"
  >;
  readonly plannedContentByPath: Map<string, string | undefined>;
}): MixedOperationVerification {
  const { operation, options } = input;
  const absolutePath = path.resolve(options.workspaceRoot, operation.path);

  switch (operation.kind) {
    case "add": {
      if (options.directoryExists?.(path.dirname(absolutePath)) === false) {
        return { ok: false, failures: [addParentMissingFailure(operation.path)] };
      }
      if (contentForPath(input.plannedContentByPath, operation.path, options) !== undefined) {
        return { ok: false, failures: [fileAlreadyExistsFailure(operation.path)] };
      }
      return {
        ok: true,
        operation: {
          operation,
          plannedContent: operation.content,
          additions: countLines(operation.content),
          deletions: 0,
        },
      };
    }
    case "delete": {
      const originalContent = contentForPath(
        input.plannedContentByPath,
        operation.path,
        options,
      );
      if (originalContent === undefined) {
        return { ok: false, failures: [missingFileFailure(operation.path)] };
      }
      return {
        ok: true,
        operation: {
          operation,
          originalContent,
          plannedContent: "",
          additions: 0,
          deletions: countLines(originalContent),
        },
      };
    }
    case "move": {
      const targetContent = contentForPath(
        input.plannedContentByPath,
        operation.moveTo,
        options,
      );
      if (targetContent !== undefined) {
        return { ok: false, failures: [fileAlreadyExistsFailure(operation.moveTo)] };
      }
      const originalContent = contentForPath(
        input.plannedContentByPath,
        operation.path,
        options,
      );
      if (originalContent === undefined) {
        return { ok: false, failures: [missingFileFailure(operation.path)] };
      }
      const hunked = applyVerifiedHunks(operation, originalContent);
      if (hunked.ok === false) {
        return { ok: false, failures: [{ ...hunked.failure, path: operation.path }] };
      }
      return {
        ok: true,
        operation: {
          operation,
          originalContent,
          plannedContent: hunked.content,
          additions: hunked.additions,
          deletions: hunked.deletions,
        },
      };
    }
    case "update": {
      const originalContent = contentForPath(
        input.plannedContentByPath,
        operation.path,
        options,
      );
      if (originalContent === undefined) {
        return { ok: false, failures: [missingFileFailure(operation.path)] };
      }
      const hunked = applyVerifiedHunks(operation, originalContent);
      if (hunked.ok === false) {
        return { ok: false, failures: [{ ...hunked.failure, path: operation.path }] };
      }
      return {
        ok: true,
        operation: {
          operation,
          originalContent,
          plannedContent: hunked.content,
          additions: hunked.additions,
          deletions: hunked.deletions,
        },
      };
    }
  }
}

function contentForPath(
  plannedContentByPath: Map<string, string | undefined>,
  relativePath: string,
  options: Pick<MixedFileWriteRouteOptions, "workspaceRoot" | "readFile">,
): string | undefined {
  const key = normalizePathKey(relativePath);
  if (plannedContentByPath.has(key)) {
    return plannedContentByPath.get(key);
  }
  return options.readFile(path.resolve(options.workspaceRoot, relativePath));
}

function updatePlannedContentMap(
  plannedContentByPath: Map<string, string | undefined>,
  operation: VerifiedPatchFileOperation,
): void {
  switch (operation.operation.kind) {
    case "add":
    case "update":
      plannedContentByPath.set(
        normalizePathKey(operation.operation.path),
        operation.plannedContent ?? "",
      );
      return;
    case "delete":
      plannedContentByPath.set(normalizePathKey(operation.operation.path), undefined);
      return;
    case "move":
      plannedContentByPath.set(normalizePathKey(operation.operation.path), undefined);
      plannedContentByPath.set(
        normalizePathKey(operation.operation.moveTo),
        operation.plannedContent ?? operation.originalContent,
      );
      return;
  }
}

function normalizePathKey(relativePath: string): string {
  return path.normalize(relativePath).replaceAll("\\", "/");
}

type HunkApplication =
  | {
      readonly ok: true;
      readonly content: string;
      readonly additions: number;
      readonly deletions: number;
    }
  | { readonly ok: false; readonly failure: PatchFailure };

function applyVerifiedHunks(
  operation: Extract<PatchFileOperation, { kind: "update" | "move" }>,
  originalContent: string,
): HunkApplication {
  let plannedContent = originalContent;
  let additions = 0;
  let deletions = 0;

  for (const hunk of operation.hunks) {
    const replacement = applyOneHunk(plannedContent, hunk);
    if (replacement.ok === false) {
      return replacement;
    }
    plannedContent = replacement.content;
    additions += replacement.additions;
    deletions += replacement.deletions;
  }

  return { ok: true, content: plannedContent, additions, deletions };
}

function applyOneHunk(content: string, hunk: PatchHunk): HunkApplication {
  const oldLines = hunk.lines
    .filter((line) => line.kind === "context" || line.kind === "remove")
    .map((line) => line.text);
  const newLines = hunk.lines
    .filter((line) => line.kind === "context" || line.kind === "add")
    .map((line) => line.text);
  if (oldLines.length === 0) {
    return {
      ok: false,
      failure: {
        code: "patch-verify-hunk-context-missing",
        message: "Patch hunk does not include any existing context to match.",
        nextAction:
          "Regenerate the patch with enough existing target lines for verification.",
      },
    };
  }

  const contentLines = splitContentLines(content);
  const matches = findLineSequenceMatches(contentLines, oldLines);
  if (matches.length === 0) {
    return {
      ok: false,
      failure: {
        code: "patch-verify-hunk-context-missing",
        message: "Patch hunk context was not found in the target content.",
        nextAction:
          "Re-read the target file and regenerate the patch from current content.",
      },
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      failure: {
        code: "patch-verify-hunk-context-ambiguous",
        message: "Patch hunk context matched multiple locations.",
        nextAction:
          "Regenerate the patch with more surrounding context for a unique match.",
      },
    };
  }

  const match = matches[0]!;
  const nextLines = [
    ...contentLines.slice(0, match),
    ...newLines,
    ...contentLines.slice(match + oldLines.length),
  ];
  return {
    ok: true,
    content: joinContentLines(nextLines, content.endsWith("\n")),
    additions: hunk.lines.filter((line) => line.kind === "add").length,
    deletions: hunk.lines.filter((line) => line.kind === "remove").length,
  };
}

function splitContentLines(content: string): string[] {
  const lines = content.split("\n");
  if (lines.at(-1) === "") {
    return lines.slice(0, -1);
  }
  return lines;
}

function joinContentLines(lines: readonly string[], trailingNewline: boolean) {
  const content = lines.join("\n");
  return trailingNewline ? `${content}\n` : content;
}

function findLineSequenceMatches(
  haystack: readonly string[],
  needle: readonly string[],
): number[] {
  const matches: number[] = [];
  if (needle.length === 0 || needle.length > haystack.length) {
    return matches;
  }

  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    let found = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) {
        found = false;
        break;
      }
    }
    if (found) {
      matches.push(index);
    }
  }
  return matches;
}

function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  return content.split("\n").filter((line, index, lines) => {
    return !(index === lines.length - 1 && line === "");
  }).length;
}

function missingFileFailure(relativePath: string): PatchFailure {
  return {
    code: "patch-verify-file-missing",
    path: relativePath,
    message: "Patch target file does not exist.",
    nextAction:
      "Re-read the workspace and regenerate the patch against an existing target.",
  };
}

function fileAlreadyExistsFailure(relativePath: string): PatchFailure {
  return {
    code: "patch-verify-file-already-exists",
    path: relativePath,
    message: "Patch target already exists.",
    nextAction: "Regenerate the patch with a non-existing add or move target.",
  };
}

function addParentMissingFailure(relativePath: string): PatchFailure {
  return {
    code: "patch-add-file-parent-missing",
    path: relativePath,
    message:
      "Add File patch parent directory is missing; creating directories is not enabled.",
    nextAction:
      "Create parent directories through a separate approved capability before considering a file add route.",
  };
}

function firstFinalPreflightFailure(
  options: MixedFileWriteRouteOptions,
  operations: readonly VerifiedPatchFileOperation[],
):
  | {
      readonly blocker: "final-preflight" | "target-mismatch";
      readonly failure: PatchFailure;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    }
  | undefined {
  const patchOperations = operations.map((operation) => operation.operation);
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index]!;
    const patchOperation = operation.operation;
    if (patchOperation.kind === "add") {
      const target = options.validateCreateTarget(patchOperation.path);
      if (target.ok === false) {
        const failure = createAuthorityFailure(patchOperation.path, target);
        return {
          blocker: target.reason === "target-exists" ? "target-mismatch" : "final-preflight",
          failure: failure.failure,
          nextAction: failure.nextAction,
          evidence: failure.evidence,
        };
      }
      continue;
    }

    if (isMoveTargetUpdateDependency(patchOperations, index, patchOperation.path)) {
      continue;
    }

    const source = options.validateWriteTarget(patchOperation.path);
    if (source.ok === false) {
      const failure = writeAuthorityFailure(patchOperation.path, source);
      return {
        blocker: "final-preflight",
        failure: failure.failure,
        nextAction:
          "No mixed workspace writer ran. Re-read both paths and regenerate the patch from current workspace state.",
        evidence: failure.evidence,
      };
    }

    if (
      operation.originalContent !== undefined &&
      options.readVerifiedFile(patchOperation.path) !== operation.originalContent
    ) {
      return {
        blocker: "final-preflight",
        failure: finalStaleReadFailure(patchOperation.path),
        nextAction:
          "No mixed workspace writer ran. Re-read both paths and regenerate the patch from current content.",
        evidence: [
          "apply-patch-mixed-file-write-route:final-stale-read-blocked",
        ],
      };
    }

    if (patchOperation.kind === "move") {
      const target = options.validateCreateTarget(patchOperation.moveTo);
      if (target.ok === false) {
        const failure = createAuthorityFailure(patchOperation.moveTo, target);
        return {
          blocker: target.reason === "target-exists" ? "target-mismatch" : "final-preflight",
          failure: failure.failure,
          nextAction: failure.nextAction,
          evidence: failure.evidence,
        };
      }
    }
  }
  return undefined;
}

function firstMoveContentEditFailure(
  operations: readonly VerifiedPatchFileOperation[],
): PatchFailure | undefined {
  const move = operations.find(
    (operation) =>
      operation.operation.kind === "move" &&
      operation.originalContent !== operation.plannedContent,
  );
  if (!move || move.operation.kind !== "move") {
    return undefined;
  }
  return {
    code: "patch-apply-plan-not-verified",
    path: move.operation.moveTo,
    message:
      "Move File in this guarded mixed lane must preserve source content exactly; content edits during move are not enabled.",
    nextAction:
      "Regenerate a pure Move File operation and use a separate update operation on a distinct file if content must change.",
  };
}

type MixedApplyResult =
  | {
      readonly ok: true;
      readonly changedFiles: readonly string[];
      readonly failedFiles: readonly [];
      readonly postWriteVerification: "passed";
    }
  | {
      readonly ok: false;
      readonly changedFiles: readonly string[];
      readonly failedFiles: readonly PatchFailure[];
      readonly postWriteVerification: "blocked" | "failed";
    };

async function applyMixedOperations(
  options: MixedFileWriteRouteOptions,
  operations: readonly VerifiedPatchFileOperation[],
): Promise<MixedApplyResult> {
  const changedFiles: string[] = [];
  // Route 48/62 intentionally uses parsed patch order after all preflight checks.
  // Conflict guards make the bounded operations independent, so preserving parsed
  // order is deterministic without implying rollback or atomicity.
  for (const operation of operations) {
    const applied = await applyOneOperation(options, operation);
    if (applied.ok === false) {
      return {
        ok: false,
        changedFiles,
        failedFiles: applied.failedFiles,
        postWriteVerification: applied.postWriteVerification,
      };
    }
    changedFiles.push(applied.changedFile);
  }
  return {
    ok: true,
    changedFiles,
    failedFiles: [],
    postWriteVerification: "passed",
  };
}

type OneOperationApplyResult =
  | {
      readonly ok: true;
      readonly changedFile: string;
    }
  | {
      readonly ok: false;
      readonly failedFiles: readonly PatchFailure[];
      readonly postWriteVerification: "blocked" | "failed";
    };

async function applyOneOperation(
  options: MixedFileWriteRouteOptions,
  operation: VerifiedPatchFileOperation,
): Promise<OneOperationApplyResult> {
  const patchOperation = operation.operation;
  try {
    switch (patchOperation.kind) {
      case "update":
        await options.writeFile(patchOperation.path, operation.plannedContent ?? "");
        if (options.readVerifiedFile(patchOperation.path) !== operation.plannedContent) {
          return postWriteFailure(patchOperation.path, "update");
        }
        return { ok: true, changedFile: patchOperation.path };
      case "add":
        await options.createFileExclusive(
          patchOperation.path,
          operation.plannedContent ?? "",
        );
        if (options.readVerifiedFile(patchOperation.path) !== operation.plannedContent) {
          return postWriteFailure(patchOperation.path, "create");
        }
        return { ok: true, changedFile: patchOperation.path };
      case "move":
        await options.moveFileExclusive(patchOperation.path, patchOperation.moveTo);
        if (
          options.readVerifiedFile(patchOperation.path) !== undefined ||
          options.readVerifiedFile(patchOperation.moveTo) !== operation.originalContent
        ) {
          return postWriteFailure(patchOperation.moveTo, "move");
        }
        return { ok: true, changedFile: patchOperation.moveTo };
      case "delete":
        await options.deleteFile(patchOperation.path);
        if (options.readVerifiedFile(patchOperation.path) !== undefined) {
          return postWriteFailure(patchOperation.path, "delete");
        }
        return { ok: true, changedFile: patchOperation.path };
    }
  } catch (error) {
    return {
      ok: false,
      failedFiles: [
        {
          code: "patch-apply-write-failed",
          path: targetPathForOperation(patchOperation),
          message:
            error instanceof Error
              ? `Patch mixed write failed: ${error.message}`
              : "Patch mixed write failed.",
          nextAction:
            "Inspect/re-read all attempted paths before retrying; no rollback was attempted.",
        },
      ],
      postWriteVerification: "blocked",
    };
  }
}

function postWriteFailure(
  targetPath: string,
  operation: "update" | "create" | "move" | "delete",
): OneOperationApplyResult {
  return {
    ok: false,
    failedFiles: [
      {
        code: "patch-apply-write-failed",
        path: targetPath,
        message: `Patch mixed ${operation} post-write verification failed.`,
        nextAction:
          "Inspect/re-read all attempted paths before retrying; no rollback was attempted.",
      },
    ],
    postWriteVerification: "failed",
  };
}

function buildApproval(
  targetPaths: readonly string[],
  requestedUserDecision: SingleFileApplyPatchRequestedUserDecision | undefined,
  explicitWorkspaceWriteOptIn: boolean,
): MixedFileWriteApproval {
  const supportedTargetPaths = toSupportedTargetPaths(targetPaths);
  if (
    explicitWorkspaceWriteOptIn &&
    requestedUserDecision === "approved" &&
    supportedTargetPaths
  ) {
    return {
      status: "approved-for-write",
      targetPaths: supportedTargetPaths,
      message: `Approved writing exactly these mixed operation targets: ${targetPaths.join(", ")}`,
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
      mixedOperationCountIsEnabled(targetPaths.length)
        ? `Approval required for writing exactly these mixed operation targets: ${targetPaths.join(", ")}`
        : `Approval required for 2-${MAX_BOUNDED_WRITE_OPERATIONS} selected-workspace mixed operation targets.`,
  };
}

function toSupportedTargetPaths(
  targetPaths: readonly string[],
): MixedFileWriteTargetPaths | undefined {
  if (
    mixedOperationCountIsEnabled(targetPaths.length) &&
    targetPaths.every(Boolean)
  ) {
    return [...targetPaths];
  }
  return undefined;
}

function unsupportedMixedFailure(
  operations: readonly PatchFileOperation[],
): PatchFailure {
  const operation = operations[0];
  return {
    code: "patch-verify-operation-unsupported",
    ...(operation ? { path: targetPathForOperation(operation) } : {}),
    message:
      `Bounded workspace write route only accepts 2-${MAX_BOUNDED_WRITE_OPERATIONS} supported mixed operations, delete-only operations, or move-only operations.`,
    nextAction:
      `Keep broad apply_patch, unsupported same-family, ${MAX_BOUNDED_WRITE_OPERATIONS + 1}+ mixed/destructive, malformed, and unknown operation shapes out of this candidate write route.`,
  };
}

function targetMismatchFailure(): PatchFailure {
  return {
    code: "patch-apply-plan-not-verified",
    message:
      `Mixed workspace write route requires 2-${MAX_BOUNDED_WRITE_OPERATIONS} distinct operation targets.`,
    nextAction:
      `Regenerate the patch with 2-${MAX_BOUNDED_WRITE_OPERATIONS} distinct selected-workspace operation targets.`,
  };
}

function workspaceBoundaryFailure(targetPath: string): PatchFailure {
  return {
    code: "patch-verify-path-outside-workspace",
    path: targetPath,
    message: "Patch path resolves outside the workspace root.",
    nextAction:
      "Regenerate the mixed patch with all source and target paths inside the selected workspace.",
  };
}

function directoryOperationFailure(operation: PatchFileOperation): PatchFailure {
  return {
    code: "patch-apply-plan-not-verified",
    path: operation.path,
    message: `Mixed apply_patch ${operation.kind} operation targets a directory.`,
    nextAction:
      "Choose an existing regular file; directory delete/move is not enabled.",
  };
}

function finalStaleReadFailure(targetPath: string): PatchFailure {
  return {
    code: "patch-apply-plan-not-verified",
    path: targetPath,
    message:
      "Final preflight failed before the mixed workspace writer started.",
    nextAction:
      "Re-read both target files and regenerate the mixed patch from current content.",
  };
}

function writeAuthorityFailure(
  targetPath: string,
  authority: Extract<WorkspaceWriteTargetAuthority, { ok: false }>,
): {
  readonly blocker: "workspace-boundary";
  readonly failure: PatchFailure;
  readonly nextAction: string;
  readonly evidence: readonly string[];
} {
  return {
    blocker: "workspace-boundary",
    failure: {
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
          ? "Re-read the workspace and regenerate the mixed patch against existing source files."
          : "Choose regular existing files inside the selected workspace before using the mixed write route.",
    },
    nextAction: authority.message,
    evidence: authority.evidence,
  };
}

function createAuthorityFailure(
  targetPath: string,
  authority: Extract<WorkspaceCreateTargetAuthority, { ok: false }>,
): {
  readonly blocker: "workspace-boundary" | "target-mismatch";
  readonly failure: PatchFailure;
  readonly nextAction: string;
  readonly evidence: readonly string[];
} {
  return {
    blocker: authority.reason === "target-exists" ? "target-mismatch" : "workspace-boundary",
    failure: {
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
          ? "Choose a non-existing target for create or move in the mixed patch."
          : "Choose a target with an existing regular parent directory inside the selected workspace.",
    },
    nextAction: authority.message,
    evidence: authority.evidence,
  };
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
  readonly blocker: MixedFileWriteRouteBlocker;
  readonly targetPaths: readonly string[];
  readonly targetPath?: string;
  readonly operationKinds: readonly PatchOperationKind[];
  readonly approval: MixedFileWriteApproval;
  readonly perFilePatchPlan?: PerFilePatchPlan;
  readonly recoveryAuthorityCapture?: RecoveryAuthorityCaptureBatchResult;
  readonly failures: readonly PatchFailure[];
  readonly changedFiles?: readonly string[];
  readonly writeIntents?: readonly string[];
  readonly workspaceWriterInvoked?: boolean;
  readonly creatorInvoked?: boolean;
  readonly deleteMoveInvoked?: boolean;
  readonly writerTarget?: "none" | "selected-workspace";
  readonly selectedWorkspaceWrite?: boolean;
  readonly writeFailureState?: WorkspaceWriteFailureState;
  readonly failurePhase?: WorkspaceWriteFailurePhase;
  readonly postWriteVerification?: "not-run" | "blocked" | "failed";
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): MixedFileWriteRoute {
  const writeFailureState =
    input.writeFailureState ??
    buildWorkspaceWriteFailureState({
      phase: input.failurePhase ?? "before-writer",
      targetPath: input.targetPath,
    });
  const changedFiles = input.changedFiles ?? [];
  const writeIntents = input.writeIntents ?? [];
  const workspaceWriterInvoked = input.workspaceWriterInvoked ?? false;
  const creatorInvoked = input.creatorInvoked ?? false;
  const deleteMoveInvoked = input.deleteMoveInvoked ?? false;
  return {
    source: "mixed-file-apply-patch-workspace-write-route",
    status: "blocked",
    blocker: input.blocker,
    targetPaths: input.targetPaths,
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    operationKinds: input.operationKinds,
    approval: input.approval,
    ...(input.perFilePatchPlan ? { perFilePatchPlan: input.perFilePatchPlan } : {}),
    ...(input.recoveryAuthorityCapture
      ? { recoveryAuthorityCapture: input.recoveryAuthorityCapture }
      : {}),
    failures: input.failures,
    workspaceWriterInvoked,
    creatorInvoked,
    deleteMoveInvoked,
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
      `apply-patch-mixed-file-write-route:blocker:${input.blocker}`,
      `apply-patch-mixed-file-write-route:write-effect:${writeFailureState.writeEffect}`,
      `apply-patch-mixed-file-write-route:failure-phase:${writeFailureState.failurePhase}`,
      ...(changedFiles.length === 0
        ? ["apply-patch-mixed-file-write-route:changed-files-empty"]
        : ["apply-patch-mixed-file-write-route:changed-files-verified-prefix-only"]),
      ...(writeIntents.length === 0
        ? ["apply-patch-mixed-file-write-route:write-intents-empty"]
        : ["apply-patch-mixed-file-write-route:write-intents-approved-targets"]),
      ...(workspaceWriterInvoked
        ? ["apply-patch-mixed-file-write-route:writer-invoked-no-success-claim"]
        : ["apply-patch-mixed-file-write-route:no-writer-invoked"]),
      ...(creatorInvoked
        ? ["apply-patch-mixed-file-write-route:creator-invoked-no-success-claim"]
        : ["apply-patch-mixed-file-write-route:no-creator-invoked"]),
      ...(deleteMoveInvoked
        ? ["apply-patch-mixed-file-write-route:delete-move-invoked-no-success-claim"]
        : ["apply-patch-mixed-file-write-route:no-delete-move-invoked"]),
      "apply-patch-mixed-file-write-route:no-applied-patch-record",
      "apply-patch-mixed-file-write-route:no-success-claim",
      "apply-patch-mixed-file-write-route:no-rollback",
      "apply-patch-mixed-file-write-route:default-production-rejection-unchanged",
    ],
  };
}
