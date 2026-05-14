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
  | "unsupported-operation"
  | "verification-failed"
  | "workspace-boundary"
  | "missing-target";

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
  readonly changedFiles: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly failedFiles: readonly { readonly path: string; readonly reason: string }[];
  readonly writerInvoked: boolean;
  readonly postWriteVerification: "passed" | "blocked" | "failed" | "not-run";
  readonly successLike: boolean;
  readonly evidence: readonly string[];
}

export function buildPerFilePatchPlan(
  options: PerFilePatchPlanOptions,
): PerFilePatchPlan {
  const parsed = parseApplyPatchText(options.rawPatchText);
  if (parsed.ok === false) {
    return buildInvalidPatchPlan(options.rawPatchText, parsed.failure);
  }

  return buildParsedPatchPlan(parsed.patch, options);
}

export function projectPerFilePatchResult(input: {
  readonly plan: PerFilePatchPlan;
  readonly changedFiles?: readonly string[];
  readonly failedFiles?: readonly { readonly path: string; readonly reason: string }[];
  readonly writerInvoked?: boolean;
  readonly postWriteVerification?: "passed" | "blocked" | "failed" | "not-run";
}): PerFilePatchResultProjection {
  const changedFiles = [...(input.changedFiles ?? [])];
  const failedFiles =
    input.failedFiles ??
    input.plan.summary.failedFiles.map((failure) => ({
      path: failure.path ?? "(apply_patch)",
      reason: failure.message,
    }));
  const writerInvoked = input.writerInvoked ?? false;
  const postWriteVerification = input.postWriteVerification ?? "not-run";
  const successLike =
    input.plan.summary.supportStatus === "supported-write" &&
    changedFiles.length > 0 &&
    failedFiles.length === 0 &&
    writerInvoked &&
    postWriteVerification === "passed";

  return {
    changedFiles,
    plannedFiles: [...input.plan.summary.plannedFiles],
    failedFiles: [...failedFiles],
    writerInvoked,
    postWriteVerification,
    successLike,
    evidence: [
      "per-file-patch-result:projection-only",
      `per-file-patch-result:support-status:${input.plan.summary.supportStatus}`,
      ...(successLike
        ? ["per-file-patch-result:success-after-verified-write"]
        : ["per-file-patch-result:no-success-claim"]),
      ...(writerInvoked
        ? ["per-file-patch-result:writer-invoked-by-existing-route"]
        : ["per-file-patch-result:no-writer-invoked"]),
    ],
  };
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
      supportStatus: "supported-planning-no-write",
      failureClass: "none",
      plannedFiles: updateOperations.map((operation) => operation.path),
      writeIntentFiles: [],
      targetFiles,
      reason:
        "Exactly-three Update File patch is represented as planning/no-write; 3-file writes remain unsupported.",
      nextAction:
        "No writer may run for exactly-three planning. Split into supported smaller operations or wait for a dedicated 3-file write route.",
      operationSupportStatus: "supported-planning-no-write",
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
            "Use one Update File, exactly two Update File operations, or exactly-three planning/no-write.",
        }),
      ),
    });
  }

  if (deleteMoveOperations.length > 0 || addOperations.length > 0) {
    return buildUnsupportedPlan({
      operations,
      targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass:
        operations.length > deleteMoveOperations.length || addOperations.length > 0
          ? "mixed-operations"
          : "unsupported-operation",
      reason:
        "Delete, move, add/update mixes, and other mixed apply_patch shapes are represented as unsupported/no-write.",
      nextAction:
        "Regenerate the patch as one supported operation family; delete, move, mixed, and broad apply_patch writes remain unsupported.",
      failures: unsupportedOperationFailures(operations),
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
          "Use one Update File, one Add File, exactly two Update File operations, or exactly-three planning/no-write.",
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
  rawPatchText: string,
  failure: PatchFailure,
): PerFilePatchPlan {
  const broad = looksLikeBroadApplyPatch(rawPatchText);
  const supportStatus: PerFilePatchSupportStatus = broad
    ? "unsupported-no-write"
    : "invalid-model-output";
  const operationKind: PerFilePatchOperationKind = broad ? "broad" : "malformed";
  const failureClass: PerFilePatchFailureClass = broad
    ? "broad-apply-patch"
    : "parse-failure";
  const reason = broad
    ? "Broad or unified-diff apply_patch text is represented as unsupported/no-write."
    : "Malformed model output is represented as invalid model output and cannot become a write intent.";
  const nextAction = broad
    ? "Use the current bounded apply_patch shape instead of broad apply_patch or unified-diff input."
    : failure.nextAction;
  const failedFile = patchFailure({
    ...failure,
    path: failure.path ?? "(apply_patch)",
    message: broad ? reason : failure.message,
    nextAction,
  });

  return {
    source: "per-file-patch-plan",
    operations: [
      {
        operationKind,
        supportStatus,
        targetPath: failedFile.path,
        writeIntent: "none",
        failedFile,
        verificationExpectation: broad
          ? "not-run-unsupported"
          : "not-run-invalid-model-output",
        userVisibleReason: reason,
      },
    ],
    summary: {
      supportStatus,
      failureClass,
      targetFiles: failedFile.path ? [failedFile.path] : [],
      writeIntentFiles: [],
      plannedFiles: [],
      changedFiles: [],
      failedFiles: [failedFile],
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
): readonly PatchFailure[] {
  return operations
    .filter((operation) => operation.kind !== "update")
    .map((operation) =>
      patchFailure({
        code: "patch-verify-operation-unsupported",
        path: targetPathForOperation(operation),
        message: `Patch operation ${operation.kind} is unsupported by the current per-file edit route contract.`,
        nextAction:
          "Use a currently supported operation shape; delete, move, mixed, and broad apply_patch writes remain unsupported.",
      }),
    );
}

function failureForOperation(
  failures: readonly PatchFailure[],
  operation: PatchFileOperation,
): PatchFailure | undefined {
  return failures.find((failure) => failure.path === targetPathForOperation(operation));
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

function patchFailure(input: PatchFailure): PatchFailure {
  return input;
}
