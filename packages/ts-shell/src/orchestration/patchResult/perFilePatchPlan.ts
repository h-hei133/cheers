import path from "node:path";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import type {
  ParsedPatch,
  PatchFailure,
  PatchFileOperation,
  PatchOperationKind,
} from "../patchParsing/types.js";
import { verifyParsedPatch } from "../patchVerification/verify.js";

export type PerFilePatchOperationKind =
  | "update"
  | "create"
  | "delete"
  | "move"
  | "broad"
  | "malformed"
  | "unknown";

export type PerFilePatchSupportStatus =
  | "supported-write"
  | "supported-planning-no-write"
  | "unsupported-no-write"
  | "invalid-model-output";

export type PerFilePatchFailureClass =
  | "none"
  | "parse-failure"
  | "broad-apply-patch"
  | "mixed-operations"
  | "too-many-update-files"
  | "duplicate-target"
  | "unsupported-operation"
  | "verification-failed"
  | "workspace-boundary"
  | "missing-target"
  | "stale-read"
  | "write-application"
  | "post-write-verification"
  | "partial-failure";

export type PerFilePatchVerificationExpectation =
  | "route-owned-write-preflight"
  | "planning-preflight-only"
  | "not-run-unsupported"
  | "not-run-invalid-model-output";

export interface PerFilePatchOperation {
  readonly operationKind: PerFilePatchOperationKind;
  readonly supportStatus: PerFilePatchSupportStatus;
  readonly targetPath?: string;
  readonly sourcePath?: string;
  readonly writeIntent: "eligible" | "none";
  readonly plannedFile?: string;
  readonly changedFile?: string;
  readonly failedFile?: PatchFailure;
  readonly verificationExpectation: PerFilePatchVerificationExpectation;
  readonly userVisibleReason: string;
}

export interface PerFilePatchPlanSummary {
  readonly supportStatus: PerFilePatchSupportStatus;
  readonly failureClass: PerFilePatchFailureClass;
  readonly targetFiles: readonly string[];
  readonly writeIntentFiles: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly changedFiles: readonly [];
  readonly failedFiles: readonly PatchFailure[];
  readonly willWrite: false;
  readonly writerInvoked: false;
  readonly workspaceWriterInvoked: false;
  readonly postWriteVerification: "not-run";
  readonly writerInvocationCondition:
    | "existing-explicit-route-only"
    | "never";
  readonly userVisibleReason: string;
  readonly nextAction: string;
}

export interface PerFilePatchPlan {
  readonly source: "per-file-patch-plan";
  readonly operations: readonly PerFilePatchOperation[];
  readonly summary: PerFilePatchPlanSummary;
  readonly evidence: readonly string[];
}

export interface PerFilePatchPlanOptions {
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly directoryExists?: (absolutePath: string) => boolean;
}

export interface PerFilePatchResultProjection {
  readonly supportStatus: PerFilePatchSupportStatus;
  readonly failureClass: PerFilePatchFailureClass;
  readonly operations: readonly {
    readonly operationKind: PerFilePatchOperationKind;
    readonly supportStatus: PerFilePatchSupportStatus;
    readonly targetPath?: string;
    readonly sourcePath?: string;
    readonly writeIntent: "eligible" | "none";
    readonly plannedFile?: string;
    readonly changedFile?: string;
    readonly failedFile?: { readonly path: string; readonly reason: string };
  }[];
  readonly writeIntentFiles: readonly string[];
  readonly changedFiles: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly failedFiles: readonly { readonly path: string; readonly reason: string }[];
  readonly writerInvoked: boolean;
  readonly creatorInvoked: boolean;
  readonly deleteMoveInvoked: boolean;
  readonly postWriteVerification: "passed" | "blocked" | "failed" | "not-run";
  readonly successLike: boolean;
  readonly evidence: readonly string[];
}

export function buildPerFilePatchPlan(
  options: PerFilePatchPlanOptions,
): PerFilePatchPlan {
  const parsed = parseApplyPatchText(options.rawPatchText);
  if (parsed.ok === false) {
    return buildInvalidPatchPlan(options, parsed.failure);
  }

  return buildParsedPatchPlan(parsed.patch, options);
}

export function projectPerFilePatchResult(input: {
  readonly plan: PerFilePatchPlan;
  readonly changedFiles?: readonly string[];
  readonly failedFiles?: readonly { readonly path: string; readonly reason: string }[];
  readonly writerInvoked?: boolean;
  readonly creatorInvoked?: boolean;
  readonly deleteMoveInvoked?: boolean;
  readonly postWriteVerification?: "passed" | "blocked" | "failed" | "not-run";
  readonly runtimeFailureClass?: PerFilePatchFailureClass | undefined;
}): PerFilePatchResultProjection {
  const changedFiles = [...(input.changedFiles ?? [])];
  const failedFiles =
    input.failedFiles ??
    input.plan.summary.failedFiles.map((failure) => ({
      path: failure.path ?? "(apply_patch)",
      reason: failure.message,
    }));
  const writerInvoked = input.writerInvoked ?? false;
  const creatorInvoked = input.creatorInvoked ?? false;
  const deleteMoveInvoked = input.deleteMoveInvoked ?? false;
  const postWriteVerification = input.postWriteVerification ?? "not-run";
  const failureClass =
    input.runtimeFailureClass ??
    deriveRuntimeFailureClass({
      planFailureClass: input.plan.summary.failureClass,
      changedFiles,
      failedFiles,
      writerInvoked,
      postWriteVerification,
    });
  const successLike =
    input.plan.summary.supportStatus === "supported-write" &&
    changedFiles.length > 0 &&
    failedFiles.length === 0 &&
    writerInvoked &&
    postWriteVerification === "passed";

  return {
    supportStatus: input.plan.summary.supportStatus,
    failureClass,
    operations: input.plan.operations.map((operation) => {
      const failedFile = operation.targetPath
        ? failedFiles.find((failure) => failure.path === operation.targetPath)
        : undefined;
      const changedFile =
        operation.targetPath && changedFiles.includes(operation.targetPath)
          ? operation.targetPath
          : undefined;
      return {
        operationKind: operation.operationKind,
        supportStatus: operation.supportStatus,
        ...(operation.targetPath ? { targetPath: operation.targetPath } : {}),
        ...(operation.sourcePath ? { sourcePath: operation.sourcePath } : {}),
        writeIntent: operation.writeIntent,
        ...(operation.plannedFile ? { plannedFile: operation.plannedFile } : {}),
        ...(changedFile ? { changedFile } : {}),
        ...(failedFile ? { failedFile } : {}),
      };
    }),
    writeIntentFiles: [...input.plan.summary.writeIntentFiles],
    changedFiles,
    plannedFiles: [...input.plan.summary.plannedFiles],
    failedFiles: [...failedFiles],
    writerInvoked,
    creatorInvoked,
    deleteMoveInvoked,
    postWriteVerification,
    successLike,
    evidence: [
      "per-file-patch-result:projection-only",
      `per-file-patch-result:support-status:${input.plan.summary.supportStatus}`,
      `per-file-patch-result:failure-class:${failureClass}`,
      ...(successLike
        ? ["per-file-patch-result:success-after-verified-write"]
        : ["per-file-patch-result:no-success-claim"]),
      ...(writerInvoked
        ? ["per-file-patch-result:writer-invoked-by-existing-route"]
        : ["per-file-patch-result:no-writer-invoked"]),
      ...(creatorInvoked
        ? ["per-file-patch-result:creator-invoked-by-existing-route"]
        : ["per-file-patch-result:no-creator-invoked"]),
      ...(deleteMoveInvoked
        ? ["per-file-patch-result:delete-move-invoked"]
        : ["per-file-patch-result:no-delete-move-invoked"]),
      ...(changedFiles.length > 0 && failedFiles.length > 0
        ? ["per-file-patch-result:partial-failure-surface"]
        : []),
      ...(postWriteVerification === "failed"
        ? ["per-file-patch-result:post-write-verification-failed"]
        : []),
    ],
  };
}

function deriveRuntimeFailureClass(input: {
  readonly planFailureClass: PerFilePatchFailureClass;
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly { readonly path: string; readonly reason: string }[];
  readonly writerInvoked: boolean;
  readonly postWriteVerification: "passed" | "blocked" | "failed" | "not-run";
}): PerFilePatchFailureClass {
  if (input.failedFiles.length === 0) {
    return input.planFailureClass;
  }

  if (input.postWriteVerification === "failed") {
    return "post-write-verification";
  }

  if (input.writerInvoked && input.changedFiles.length > 0) {
    return "partial-failure";
  }

  if (input.writerInvoked) {
    return "write-application";
  }

  if (
    input.failedFiles.some((failure) =>
      failure.reason.toLowerCase().includes("stale-read"),
    )
  ) {
    return "stale-read";
  }

  return input.planFailureClass === "none"
    ? "verification-failed"
    : input.planFailureClass;
}

function buildParsedPatchPlan(
  patch: ParsedPatch,
  options: PerFilePatchPlanOptions,
): PerFilePatchPlan {
  const operations = patch.operations;
  const updateOperations = operations.filter(isUpdateOperation);
  const addOperations = operations.filter(isAddOperation);
  const deleteMoveOperations = operations.filter(
    (operation) => operation.kind === "delete" || operation.kind === "move",
  );
  const targetFiles = operations.map(targetPathForOperation);
  const duplicateTargetFiles = duplicateTargets(targetFiles);

  if (duplicateTargetFiles.length > 0) {
    return buildUnsupportedPlan({
      operations,
      targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: "duplicate-target",
      reason:
        "Duplicate apply_patch targets are represented as unsupported/no-write; writer routes require distinct target files.",
      nextAction:
        "Regenerate the patch with distinct target files before expecting any write route.",
      failures: duplicateTargetFiles.map((targetPath) =>
        patchFailure({
          code: "patch-apply-plan-not-verified",
          path: targetPath,
          message:
            "Per-file patch plan rejects duplicate target files before any writer is reachable.",
          nextAction:
            "Use one operation per target file, or split repeated edits into a single supported patch for that file.",
        }),
      ),
    });
  }

  if (
    operations.length === 1 &&
    updateOperations.length === 1 &&
    updateOperations[0]
  ) {
    return buildVerifiedPlan({
      patch,
      options,
      supportedOperations: ["update"],
      supportStatus: "supported-write",
      failureClass: "none",
      plannedFiles: [],
      writeIntentFiles: [updateOperations[0].path],
      targetFiles,
      reason:
        "Single existing-file Update File is represented as a supported write intent owned by the existing single-file route.",
      nextAction:
        "Route may write only through explicit runtime/write opt-in, approval, final stale-read, and post-write verification.",
      operationSupportStatus: "supported-write",
    });
  }

  if (operations.length === 1 && addOperations.length === 1 && addOperations[0]) {
    return buildVerifiedPlan({
      patch,
      options,
      supportedOperations: ["add"],
      supportStatus: "supported-write",
      failureClass: "none",
      plannedFiles: [],
      writeIntentFiles: [addOperations[0].path],
      targetFiles,
      reason:
        "Single Add File is represented as a supported create intent owned by the existing create route.",
      nextAction:
        "Route may create only through explicit runtime/write opt-in, approval, exclusive create, and post-write verification.",
      operationSupportStatus: "supported-write",
    });
  }

  if (operations.length === 2 && updateOperations.length === 2) {
    return buildVerifiedPlan({
      patch,
      options,
      supportedOperations: ["update"],
      supportStatus: "supported-write",
      failureClass: "none",
      plannedFiles: [],
      writeIntentFiles: updateOperations.map((operation) => operation.path),
      targetFiles,
      reason:
        "Exactly-two existing-file Update File patch is represented as supported write intents owned by the existing two-file route.",
      nextAction:
        "Route may write only through explicit approval naming both files, all final stale-reads, sequential writes, and per-file post-write verification.",
      operationSupportStatus: "supported-write",
    });
  }

  if (operations.length === 3 && updateOperations.length === 3) {
    return buildVerifiedPlan({
      patch,
      options,
      supportedOperations: ["update"],
      supportStatus: "supported-write",
      failureClass: "none",
      plannedFiles: [],
      writeIntentFiles: updateOperations.map((operation) => operation.path),
      targetFiles,
      reason:
        "Exactly-three existing-file Update File patch is represented as supported write intents owned by the guarded three-file route.",
      nextAction:
        "Route may write only through explicit approval naming all three files, all final stale-reads, sequential writes, and per-file post-write verification.",
      operationSupportStatus: "supported-write",
    });
  }

  if (updateOperations.length > 3 && updateOperations.length === operations.length) {
    return buildUnsupportedPlan({
      operations,
      targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: "too-many-update-files",
      reason:
        "4+ Update File patches are represented as unsupported/no-write; they are not promoted to write intents.",
      nextAction:
        "Reduce the patch to an existing supported route shape before expecting writes.",
      failures: operations.map((operation) =>
        patchFailure({
          code: "patch-apply-plan-not-verified",
          path: operation.path,
          message:
            "Per-file patch plan rejects 4+ Update File operations before any writer is reachable.",
          nextAction:
            "Use one Update File, exactly two Update File operations, or exactly three Update File operations.",
        }),
      ),
    });
  }

  if (deleteMoveOperations.length > 0 || addOperations.length > 0) {
    const failures = unsupportedOperationFailures(operations, options);
    return buildUnsupportedPlan({
      operations,
      targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: failureClassForUnsupportedOperations({
        operations,
        failures,
        mixed:
          operations.length > deleteMoveOperations.length || addOperations.length > 0,
      }),
      reason:
        "Delete, move, add/update mixes, and other mixed apply_patch shapes are represented as unsupported/no-write.",
      nextAction:
        "Regenerate the patch as one supported operation family; delete, move, mixed, and broad apply_patch writes remain unsupported.",
      failures,
    });
  }

  return buildUnsupportedPlan({
    operations,
    targetFiles,
    supportStatus: "unsupported-no-write",
    failureClass: "unsupported-operation",
    reason:
      "Patch shape is valid apply_patch syntax but does not match a supported route shape.",
    nextAction:
      "Use a current supported edit route shape before expecting writes.",
    failures: [
      patchFailure({
        code: "patch-apply-plan-not-verified",
        message:
          "Per-file patch plan could not match this patch to a supported route shape.",
        nextAction:
          "Use one Update File, one Add File, exactly two Update File operations, or exactly three Update File operations.",
      }),
    ],
  });
}

function buildVerifiedPlan(input: {
  readonly patch: ParsedPatch;
  readonly options: PerFilePatchPlanOptions;
  readonly supportedOperations: readonly PatchOperationKind[];
  readonly supportStatus: PerFilePatchSupportStatus;
  readonly operationSupportStatus: PerFilePatchSupportStatus;
  readonly failureClass: PerFilePatchFailureClass;
  readonly targetFiles: readonly string[];
  readonly writeIntentFiles: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly reason: string;
  readonly nextAction: string;
}): PerFilePatchPlan {
  const verification = verifyParsedPatch(input.patch, {
    workspaceRoot: input.options.workspaceRoot,
    readFile: input.options.readFile,
    ...(input.options.directoryExists
      ? { directoryExists: input.options.directoryExists }
      : {}),
    supportedOperations: input.supportedOperations,
  });
  if (verification.ok === false) {
    return buildUnsupportedPlan({
      operations: input.patch.operations,
      targetFiles: input.targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: failureClassForVerificationFailures(verification.failures),
      reason:
        "Patch matched a current route shape, but preflight verification failed before any writer was reachable.",
      nextAction:
        verification.failures[0]?.nextAction ??
        "Re-read current workspace files and regenerate the patch.",
      failures: verification.failures,
    });
  }

  return {
    source: "per-file-patch-plan",
    operations: input.patch.operations.map((operation) =>
      perFileOperationFromPatchOperation({
        operation,
        supportStatus: input.operationSupportStatus,
        writeIntent:
          input.operationSupportStatus === "supported-write" ? "eligible" : "none",
        planned: input.plannedFiles.includes(targetPathForOperation(operation)),
        failure: undefined,
        reason: input.reason,
      }),
    ),
    summary: {
      supportStatus: input.supportStatus,
      failureClass: input.failureClass,
      targetFiles: [...input.targetFiles],
      writeIntentFiles: [...input.writeIntentFiles],
      plannedFiles: [...input.plannedFiles],
      changedFiles: [],
      failedFiles: [],
      willWrite: false,
      writerInvoked: false,
      workspaceWriterInvoked: false,
      postWriteVerification: "not-run",
      writerInvocationCondition:
        input.supportStatus === "supported-write"
          ? "existing-explicit-route-only"
          : "never",
      userVisibleReason: input.reason,
      nextAction: input.nextAction,
    },
    evidence: [
      "per-file-patch-plan:projection-only",
      `per-file-patch-plan:support-status:${input.supportStatus}`,
      ...(input.supportStatus === "supported-write"
        ? ["per-file-patch-plan:write-intent-only-existing-route-owned"]
        : ["per-file-patch-plan:no-write-planning-only"]),
      "per-file-patch-plan:no-writer-invoked",
      "per-file-patch-plan:changed-files-empty",
    ],
  };
}

function buildUnsupportedPlan(input: {
  readonly operations: readonly PatchFileOperation[];
  readonly targetFiles: readonly string[];
  readonly supportStatus: PerFilePatchSupportStatus;
  readonly failureClass: PerFilePatchFailureClass;
  readonly reason: string;
  readonly nextAction: string;
  readonly failures: readonly PatchFailure[];
}): PerFilePatchPlan {
  return {
    source: "per-file-patch-plan",
    operations: input.operations.map((operation) =>
      perFileOperationFromPatchOperation({
        operation,
        supportStatus: input.supportStatus,
        writeIntent: "none",
        planned: false,
        failure: failureForOperation(input.failures, operation),
        reason: input.reason,
      }),
    ),
    summary: {
      supportStatus: input.supportStatus,
      failureClass: input.failureClass,
      targetFiles: [...input.targetFiles],
      writeIntentFiles: [],
      plannedFiles: [],
      changedFiles: [],
      failedFiles: [...input.failures],
      willWrite: false,
      writerInvoked: false,
      workspaceWriterInvoked: false,
      postWriteVerification: "not-run",
      writerInvocationCondition: "never",
      userVisibleReason: input.reason,
      nextAction: input.nextAction,
    },
    evidence: [
      "per-file-patch-plan:projection-only",
      `per-file-patch-plan:support-status:${input.supportStatus}`,
      `per-file-patch-plan:failure-class:${input.failureClass}`,
      "per-file-patch-plan:no-writer-invoked",
      "per-file-patch-plan:changed-files-empty",
      "per-file-patch-plan:write-intents-empty",
    ],
  };
}

function buildInvalidPatchPlan(
  options: PerFilePatchPlanOptions,
  failure: PatchFailure,
): PerFilePatchPlan {
  const broad = looksLikeBroadApplyPatch(options.rawPatchText);
  const supportStatus: PerFilePatchSupportStatus = broad
    ? "unsupported-no-write"
    : "invalid-model-output";
  const operationKind: PerFilePatchOperationKind = broad
    ? "broad"
    : failure.code === "patch-parse-unsupported-operation"
      ? "unknown"
      : "malformed";
  const failureClass: PerFilePatchFailureClass = broad
    ? "broad-apply-patch"
    : "parse-failure";
  const reason = broad
    ? "Broad or unified-diff apply_patch text is represented as unsupported/no-write."
    : "Malformed model output is represented as invalid model output and cannot become a write intent.";
  const nextAction = broad
    ? "Use the current bounded apply_patch shape instead of broad apply_patch or unified-diff input."
    : failure.nextAction;
  const broadTargets = broadPatchTargets(options.rawPatchText);
  const broadFailures = broad
    ? broadTargets.map((targetPath) => broadPatchFailure(targetPath, options, reason, nextAction))
    : [];
  const failedFiles =
    broad && broadFailures.length > 0
      ? broadFailures
      : [
          patchFailure({
            ...failure,
            path: failure.path ?? "(apply_patch)",
            message: broad ? reason : failure.message,
            nextAction,
          }),
        ];
  const operations =
    broad && broadTargets.length > 0
      ? broadTargets.map((targetPath, index) => ({
          operationKind,
          supportStatus,
          targetPath,
          writeIntent: "none" as const,
          failedFile: failedFiles[index],
          verificationExpectation: "not-run-unsupported" as const,
          userVisibleReason: reason,
        }))
      : [
          {
            operationKind,
            supportStatus,
            targetPath: failedFiles[0]?.path,
            writeIntent: "none" as const,
            failedFile: failedFiles[0],
            verificationExpectation: broad
              ? ("not-run-unsupported" as const)
              : ("not-run-invalid-model-output" as const),
            userVisibleReason: reason,
          },
        ];

  return {
    source: "per-file-patch-plan",
    operations,
    summary: {
      supportStatus,
      failureClass,
      targetFiles: failedFiles
        .map((failedFile) => failedFile.path)
        .filter((failedPath): failedPath is string => Boolean(failedPath)),
      writeIntentFiles: [],
      plannedFiles: [],
      changedFiles: [],
      failedFiles,
      willWrite: false,
      writerInvoked: false,
      workspaceWriterInvoked: false,
      postWriteVerification: "not-run",
      writerInvocationCondition: "never",
      userVisibleReason: reason,
      nextAction,
    },
    evidence: [
      "per-file-patch-plan:projection-only",
      `per-file-patch-plan:support-status:${supportStatus}`,
      `per-file-patch-plan:failure-class:${failureClass}`,
      "per-file-patch-plan:no-writer-invoked",
      "per-file-patch-plan:changed-files-empty",
      "per-file-patch-plan:write-intents-empty",
    ],
  };
}

function perFileOperationFromPatchOperation(input: {
  readonly operation: PatchFileOperation;
  readonly supportStatus: PerFilePatchSupportStatus;
  readonly writeIntent: "eligible" | "none";
  readonly planned: boolean;
  readonly failure: PatchFailure | undefined;
  readonly reason: string;
}): PerFilePatchOperation {
  const operationKind = operationKindFromPatchOperation(input.operation);
  const targetPath = targetPathForOperation(input.operation);
  return {
    operationKind,
    supportStatus: input.supportStatus,
    targetPath,
    ...(input.operation.kind === "move" ? { sourcePath: input.operation.path } : {}),
    writeIntent: input.writeIntent,
    ...(input.planned ? { plannedFile: targetPath } : {}),
    ...(input.failure ? { failedFile: input.failure } : {}),
    verificationExpectation:
      input.supportStatus === "supported-write"
        ? "route-owned-write-preflight"
        : input.supportStatus === "supported-planning-no-write"
          ? "planning-preflight-only"
          : input.supportStatus === "invalid-model-output"
            ? "not-run-invalid-model-output"
            : "not-run-unsupported",
    userVisibleReason: input.reason,
  };
}

function unsupportedOperationFailures(
  operations: readonly PatchFileOperation[],
  options: PerFilePatchPlanOptions,
): readonly PatchFailure[] {
  return operations.flatMap((operation) => {
    const pathFailures = unsupportedOperationPathFailures(operation, options);
    if (pathFailures.length > 0) {
      return pathFailures;
    }
    return [
      patchFailure({
        code: "patch-verify-operation-unsupported",
        path: targetPathForOperation(operation),
        message: `Patch operation ${operation.kind} is unsupported by the current per-file edit route contract.`,
        nextAction:
          "Use a currently supported operation shape; delete, move, mixed, and broad apply_patch writes remain unsupported.",
      }),
    ];
  });
}

function failureForOperation(
  failures: readonly PatchFailure[],
  operation: PatchFileOperation,
): PatchFailure | undefined {
  return failures.find(
    (failure) =>
      failure.path === targetPathForOperation(operation) ||
      (operation.kind === "move" && failure.path === operation.path),
  );
}

function unsupportedOperationPathFailures(
  operation: PatchFileOperation,
  options: PerFilePatchPlanOptions,
): readonly PatchFailure[] {
  const sourcePath = operation.path;
  const targetPath = targetPathForOperation(operation);
  const failures: PatchFailure[] = [];
  const sourceBoundary = workspacePathFailure(sourcePath, options.workspaceRoot);
  if (sourceBoundary) {
    failures.push(sourceBoundary);
  }
  if (operation.kind === "move") {
    const targetBoundary = workspacePathFailure(targetPath, options.workspaceRoot);
    if (targetBoundary) {
      failures.push(targetBoundary);
    }
  }
  if (failures.length > 0) {
    return failures;
  }
  if (
    (operation.kind === "delete" || operation.kind === "move") &&
    options.readFile(path.resolve(options.workspaceRoot, sourcePath)) === undefined
  ) {
    return [
      patchFailure({
        code: "patch-verify-file-missing",
        path: sourcePath,
        message: `Patch ${operation.kind} source file is missing.`,
        nextAction:
          "Re-read the selected workspace and regenerate the patch against an existing source file.",
      }),
    ];
  }
  return [];
}

function failureClassForUnsupportedOperations(input: {
  readonly operations: readonly PatchFileOperation[];
  readonly failures: readonly PatchFailure[];
  readonly mixed: boolean;
}): PerFilePatchFailureClass {
  if (
    !input.mixed &&
    input.failures.some(
      (failure) => failure.code === "patch-verify-path-outside-workspace",
    )
  ) {
    return "workspace-boundary";
  }
  if (
    !input.mixed &&
    input.failures.some((failure) => failure.code === "patch-verify-file-missing")
  ) {
    return "missing-target";
  }
  return input.mixed ? "mixed-operations" : "unsupported-operation";
}

function failureClassForVerificationFailures(
  failures: readonly PatchFailure[],
): PerFilePatchFailureClass {
  if (
    failures.some((failure) => failure.code === "patch-verify-path-outside-workspace")
  ) {
    return "workspace-boundary";
  }
  if (failures.some((failure) => failure.code === "patch-verify-file-missing")) {
    return "missing-target";
  }
  return "verification-failed";
}

function operationKindFromPatchOperation(
  operation: PatchFileOperation,
): PerFilePatchOperationKind {
  switch (operation.kind) {
    case "add":
      return "create";
    case "update":
      return "update";
    case "delete":
      return "delete";
    case "move":
      return "move";
  }
}

function targetPathForOperation(operation: PatchFileOperation): string {
  return operation.kind === "move" ? operation.moveTo : operation.path;
}

function duplicateTargets(targetFiles: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const targetFile of targetFiles) {
    if (seen.has(targetFile)) {
      duplicates.add(targetFile);
    } else {
      seen.add(targetFile);
    }
  }
  return [...duplicates];
}

function isUpdateOperation(
  operation: PatchFileOperation,
): operation is Extract<PatchFileOperation, { kind: "update" }> {
  return operation.kind === "update";
}

function isAddOperation(
  operation: PatchFileOperation,
): operation is Extract<PatchFileOperation, { kind: "add" }> {
  return operation.kind === "add";
}

function looksLikeBroadApplyPatch(rawPatchText: string): boolean {
  return /(^|\n)(diff --git\s+|---\s+\S+|\+\+\+\s+\S+|@@\s+-\d)/.test(
    rawPatchText,
  );
}

function broadPatchTargets(rawPatchText: string): readonly string[] {
  const targets = new Set<string>();
  for (const line of rawPatchText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    const gitMatch = /^diff --git\s+\S+\s+(\S+)\s*$/.exec(line.trim());
    if (gitMatch?.[1]) {
      addBroadTarget(targets, gitMatch[1]);
      continue;
    }
    const newFileMatch = /^\+\+\+\s+(\S+)\s*$/.exec(line.trim());
    if (newFileMatch?.[1]) {
      addBroadTarget(targets, newFileMatch[1]);
    }
  }
  return [...targets];
}

function addBroadTarget(targets: Set<string>, rawTarget: string): void {
  if (rawTarget === "/dev/null") {
    return;
  }
  targets.add(rawTarget.replace(/^[ab]\//, ""));
}

function broadPatchFailure(
  targetPath: string,
  options: PerFilePatchPlanOptions,
  reason: string,
  nextAction: string,
): PatchFailure {
  const boundaryFailure = workspacePathFailure(targetPath, options.workspaceRoot);
  if (boundaryFailure) {
    return boundaryFailure;
  }
  return patchFailure({
    code: "patch-apply-plan-not-verified",
    path: targetPath,
    message: reason,
    nextAction,
  });
}

function workspacePathFailure(
  patchPath: string,
  workspaceRoot: string,
): PatchFailure | undefined {
  const absoluteRoot = path.resolve(workspaceRoot);
  const absolutePath = path.resolve(absoluteRoot, patchPath);
  const relative = path.relative(absoluteRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return patchFailure({
      code: "patch-verify-path-outside-workspace",
      path: patchPath,
      message: "Patch path resolves outside the workspace root.",
      nextAction:
        "Regenerate the patch with paths relative to the active workspace.",
    });
  }
  return undefined;
}

function patchFailure(input: PatchFailure): PatchFailure {
  return input;
}
