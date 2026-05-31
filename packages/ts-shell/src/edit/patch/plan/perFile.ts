import path from "node:path";
import { parseApplyPatchText } from "../../../orchestration/patchParsing/parser.js";
import type {
  ParsedPatch,
  PatchFailure,
  PatchFileOperation,
  PatchOperationKind,
} from "../../../orchestration/patchParsing/types.js";
import { verifyParsedPatch } from "../../../orchestration/patchVerification/verify.js";
import {
  projectMixedOperationReadiness,
  type MixedOperationReadinessProjection,
} from "../../../orchestration/patchResult/mixedOperationReadiness.js";
import {
  MAX_BOUNDED_WRITE_OPERATIONS,
  isBoundedWriteOperationCount,
  isTooManyBoundedWriteOperations,
} from "../../authority/writePolicy.js";

export {
  projectPerFilePatchResult,
  type PerFilePatchResultProjection,
} from "../../result/perFilePatchResultProjection.js";

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
  readonly mixedOperationReadiness?: MixedOperationReadinessProjection;
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

export function buildPerFilePatchPlan(
  options: PerFilePatchPlanOptions,
): PerFilePatchPlan {
  const parsed = parseApplyPatchText(options.rawPatchText);
  if (parsed.ok === false) {
    return buildInvalidPatchPlan(options, parsed.failure);
  }

  return buildParsedPatchPlan(parsed.patch, options);
}

function buildParsedPatchPlan(
  patch: ParsedPatch,
  options: PerFilePatchPlanOptions,
): PerFilePatchPlan {
  const operations = patch.operations;
  const updateOperations = operations.filter(isUpdateOperation);
  const addOperations = operations.filter(isAddOperation);
  const deleteOperations = operations.filter(isDeleteOperation);
  const moveOperations = operations.filter(isMoveOperation);
  const deleteMoveOperations = operations.filter(
    (operation) => operation.kind === "delete" || operation.kind === "move",
  );
  const targetFiles = operations.map(targetPathForOperation);
  const duplicateTargetFiles = duplicateTargetsForOperations(operations);

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

  if (
    operations.length === 1 &&
    deleteOperations.length === 1 &&
    deleteOperations[0]
  ) {
    return buildVerifiedDeletePlan({
      patch,
      options,
      operation: deleteOperations[0],
      targetFiles,
    });
  }

  if (operations.length === 1 && moveOperations.length === 1 && moveOperations[0]) {
    return buildVerifiedMovePlan({
      patch,
      options,
      operation: moveOperations[0],
      targetFiles,
    });
  }

  if (
    isBoundedWriteOperationCount(operations.length) &&
    deleteOperations.length === operations.length
  ) {
    return buildVerifiedDestructiveDeletePlan({
      patch,
      options,
      operations: deleteOperations,
      targetFiles,
    });
  }

  if (
    isBoundedWriteOperationCount(operations.length) &&
    moveOperations.length === operations.length
  ) {
    return buildVerifiedDestructiveMovePlan({
      patch,
      options,
      operations: moveOperations,
      targetFiles,
    });
  }

  if (
    isBoundedWriteOperationCount(operations.length) &&
    updateOperations.length === operations.length
  ) {
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
        `Bounded small-N existing-file Update File patch is represented as supported write intents owned by the guarded 2-${MAX_BOUNDED_WRITE_OPERATIONS} file route.`,
      nextAction:
        "Route may write only through explicit approval naming all files, all final stale-reads, sequential writes, and per-file post-write verification.",
      operationSupportStatus: "supported-write",
    });
  }

  if (
    isTooManyBoundedWriteOperations(updateOperations.length) &&
    updateOperations.length === operations.length
  ) {
    return buildUnsupportedPlan({
      operations,
      targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: "too-many-update-files",
      reason:
        "5+ Update File patches are represented as unsupported/no-write; they are not promoted to write intents.",
      nextAction:
        "Reduce the patch to an existing supported route shape before expecting writes.",
      failures: operations.map((operation) =>
        patchFailure({
          code: "patch-apply-plan-not-verified",
          path: operation.path,
          message:
            `Per-file patch plan rejects ${MAX_BOUNDED_WRITE_OPERATIONS + 1}+ Update File operations before any writer is reachable.`,
          nextAction:
            `Use one Update File or 2-${MAX_BOUNDED_WRITE_OPERATIONS} Update File operations.`,
        }),
      ),
    });
  }

  const operationKinds = new Set(
    operations.map((operation) => operationKindFromPatchOperation(operation)),
  );
  const isMixedOperation = operationKinds.size > 1;

  if (isMixedOperation) {
    if (mixedOperationCombinationIsSupported(operations)) {
      return buildVerifiedMixedPlan({
        patch,
        options,
        operations,
        targetFiles,
      });
    }

    const failures = mixedOperationFailures(operations, options);
    const readiness = projectMixedOperationReadiness(operations);
    return buildUnsupportedPlan({
      operations,
      targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: "mixed-operations",
      reason:
        `Mixed apply_patch operation families outside the bounded 2-${MAX_BOUNDED_WRITE_OPERATIONS} route are represented as unsupported/no-write even when each individual operation has an existing single-operation lane.`,
      nextAction:
        `Use 2-${MAX_BOUNDED_WRITE_OPERATIONS} supported mixed operations, split the patch into one supported operation family, or keep the broader shape out of the writer route.`,
      failures,
      mixedOperationReadiness: readiness,
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
        mixed: false,
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

function buildVerifiedMixedPlan(input: {
  readonly patch: ParsedPatch;
  readonly options: PerFilePatchPlanOptions;
  readonly operations: readonly PatchFileOperation[];
  readonly targetFiles: readonly string[];
}): PerFilePatchPlan {
  const conflict = sourceTargetConflictFailure(
    input.operations,
    input.options.workspaceRoot,
  );
  if (conflict) {
    return buildUnsupportedPlan({
      operations: input.patch.operations,
      targetFiles: input.targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: "duplicate-target",
      reason:
        "Bounded mixed apply_patch shape matched a candidate route, but source/target paths conflict.",
      nextAction:
        "Regenerate the mixed patch so each operation source and target path is distinct.",
      failures: [conflict],
    });
  }

  const directoryFailure = directoryDeleteMoveFailure(
    input.operations,
    input.options,
  );
  if (directoryFailure) {
    return buildUnsupportedPlan({
      operations: input.patch.operations,
      targetFiles: input.targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: "verification-failed",
      reason:
        "Bounded mixed apply_patch shape matched a candidate route, but directory delete/move is not enabled.",
      nextAction:
        "Choose regular files for mixed delete or move operations; directory delete/move remains unsupported.",
      failures: [directoryFailure],
    });
  }

  const verification = verifyParsedPatch(input.patch, {
    workspaceRoot: input.options.workspaceRoot,
    readFile: input.options.readFile,
    ...(input.options.directoryExists
      ? { directoryExists: input.options.directoryExists }
      : {}),
    supportedOperations: ["update", "add", "delete", "move"],
  });
  const verificationOnlyBlockedByMoveTargetUpdate =
    verification.ok === false &&
    verification.failures.every((failure) =>
      isMoveTargetUpdateMissingFailure(input.operations, failure),
    );
  if (verification.ok === false && !verificationOnlyBlockedByMoveTargetUpdate) {
    return buildUnsupportedPlan({
      operations: input.patch.operations,
      targetFiles: input.targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: failureClassForVerificationFailures(verification.failures),
      reason:
        "Bounded mixed apply_patch shape matched a candidate route, but preflight verification failed before any writer was reachable.",
      nextAction:
        verification.failures[0]?.nextAction ??
        "Re-read current workspace files and regenerate the mixed patch.",
      failures: verification.failures,
    });
  }

  const moveContentFailure = verification.ok === true ? verification.plan.operations.find(
    (operation) =>
      operation.operation.kind === "move" &&
      operation.originalContent !== operation.plannedContent,
  ) : undefined;
  if (moveContentFailure?.operation.kind === "move") {
    return buildUnsupportedPlan({
      operations: input.patch.operations,
      targetFiles: input.targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: "unsupported-operation",
      reason:
        "Move File with content edits is represented as unsupported/no-write in the guarded mixed route.",
      nextAction:
        "Use a pure Move File operation and put content edits in a separate update operation on a distinct file.",
      failures: [
        patchFailure({
          code: "patch-apply-plan-not-verified",
          path: moveContentFailure.operation.moveTo,
          message:
            "Guarded mixed Move File must preserve file content exactly; content edits during move are not enabled.",
          nextAction:
            "Use a pure Move File/rename patch before expecting the mixed writer.",
        }),
      ],
    });
  }

  return buildVerifiedPlan({
    patch: input.patch,
    options: input.options,
    supportedOperations: ["update", "add", "delete", "move"],
    supportStatus: "supported-write",
    failureClass: "none",
    plannedFiles: [],
    writeIntentFiles: input.operations.map(targetPathForOperation),
    targetFiles: input.targetFiles,
    reason:
      `Bounded 2-${MAX_BOUNDED_WRITE_OPERATIONS} mixed apply_patch operations are represented as supported write intents owned by the guarded mixed workspace route.`,
    nextAction:
      "Route may write only through explicit approval naming all targets, all source/target guards, all final preflights before the first writer, parsed-order writes, and per-operation post-write verification.",
    operationSupportStatus: "supported-write",
  });
}

function isMoveTargetUpdateMissingFailure(
  operations: readonly PatchFileOperation[],
  failure: PatchFailure,
): boolean {
  if (failure.code !== "patch-verify-file-missing" || !failure.path) {
    return false;
  }
  return operations.some((operation, index) =>
    isMoveTargetUpdateDependency(operations, index, failure.path),
  );
}

function buildVerifiedDeletePlan(input: {
  readonly patch: ParsedPatch;
  readonly options: PerFilePatchPlanOptions;
  readonly operation: Extract<PatchFileOperation, { kind: "delete" }>;
  readonly targetFiles: readonly string[];
}): PerFilePatchPlan {
  if (
    input.options.directoryExists?.(
      path.resolve(input.options.workspaceRoot, input.operation.path),
    ) === true
  ) {
    return buildUnsupportedPlan({
      operations: input.patch.operations,
      targetFiles: input.targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: "verification-failed",
      reason:
        "Delete File patch matched the guarded delete route shape, but the target is a directory.",
      nextAction:
        "Choose one existing regular file for Delete File; directory delete is not enabled.",
      failures: [
        patchFailure({
          code: "patch-apply-plan-not-verified",
          path: input.operation.path,
          message:
            "Guarded Delete File refuses directory targets before any writer is reachable.",
          nextAction:
            "Choose one existing regular file for Delete File; directory delete is not enabled.",
        }),
      ],
    });
  }

  const verification = verifyParsedPatch(input.patch, {
    workspaceRoot: input.options.workspaceRoot,
    readFile: input.options.readFile,
    ...(input.options.directoryExists
      ? { directoryExists: input.options.directoryExists }
      : {}),
    supportedOperations: ["delete"],
  });
  if (verification.ok === false) {
    return buildUnsupportedPlan({
      operations: input.patch.operations,
      targetFiles: input.targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: failureClassForVerificationFailures(verification.failures),
      reason:
        "Delete File patch matched the guarded delete route shape, but preflight verification failed before any writer was reachable.",
      nextAction:
        verification.failures[0]?.nextAction ??
        "Re-read current workspace files and regenerate the Delete File patch.",
      failures: verification.failures,
    });
  }

  return buildVerifiedPlan({
    patch: input.patch,
    options: input.options,
    supportedOperations: ["delete"],
    supportStatus: "supported-write",
    failureClass: "none",
    plannedFiles: [],
    writeIntentFiles: [input.operation.path],
    targetFiles: input.targetFiles,
    reason:
      "Single Delete File is represented as a supported write intent owned by the guarded selected-workspace delete route.",
    nextAction:
      "Route may delete only through explicit runtime/write opt-in, approval, target guards, single-file unlink, and post-delete verification.",
    operationSupportStatus: "supported-write",
  });
}

function buildVerifiedMovePlan(input: {
  readonly patch: ParsedPatch;
  readonly options: PerFilePatchPlanOptions;
  readonly operation: Extract<PatchFileOperation, { kind: "move" }>;
  readonly targetFiles: readonly string[];
}): PerFilePatchPlan {
  const verification = verifyParsedPatch(input.patch, {
    workspaceRoot: input.options.workspaceRoot,
    readFile: input.options.readFile,
    ...(input.options.directoryExists
      ? { directoryExists: input.options.directoryExists }
      : {}),
    supportedOperations: ["move"],
  });
  if (verification.ok === false) {
    return buildUnsupportedPlan({
      operations: input.patch.operations,
      targetFiles: input.targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: failureClassForVerificationFailures(verification.failures),
      reason:
        "Move File patch matched the guarded move route shape, but preflight verification failed before any writer was reachable.",
      nextAction:
        verification.failures[0]?.nextAction ??
        "Re-read current workspace files and regenerate the Move File patch.",
      failures: verification.failures,
    });
  }

  const verifiedOperation = verification.plan.operations[0];
  if (
    !verifiedOperation ||
    verifiedOperation.operation.kind !== "move" ||
    verifiedOperation.originalContent !== verifiedOperation.plannedContent
  ) {
    return buildUnsupportedPlan({
      operations: input.patch.operations,
      targetFiles: input.targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: "unsupported-operation",
      reason:
        "Move File patches that also edit file content are represented as unsupported/no-write.",
      nextAction:
        "Regenerate a pure Move File/rename patch and use a separate approved update route for content changes.",
      failures: [
        patchFailure({
          code: "patch-apply-plan-not-verified",
          path: input.operation.moveTo,
          message:
            "Guarded Move File must preserve file content exactly; content edits during move are not enabled.",
          nextAction:
            "Use a pure Move File/rename patch before expecting the move writer.",
        }),
      ],
    });
  }

  return buildVerifiedPlan({
    patch: input.patch,
    options: input.options,
    supportedOperations: ["move"],
    supportStatus: "supported-write",
    failureClass: "none",
    plannedFiles: [],
    writeIntentFiles: [input.operation.moveTo],
    targetFiles: input.targetFiles,
    reason:
      "Single Move File is represented as a supported write intent owned by the guarded selected-workspace move route.",
    nextAction:
      "Route may move only through explicit runtime/write opt-in, approval, source/target guards, exclusive move, and post-write verification.",
    operationSupportStatus: "supported-write",
  });
}

function buildVerifiedDestructiveDeletePlan(input: {
  readonly patch: ParsedPatch;
  readonly options: PerFilePatchPlanOptions;
  readonly operations: readonly Extract<PatchFileOperation, { kind: "delete" }>[];
  readonly targetFiles: readonly string[];
}): PerFilePatchPlan {
  const directoryFailure = directoryDeleteMoveFailure(
    input.patch.operations,
    input.options,
  );
  if (directoryFailure) {
    return buildUnsupportedPlan({
      operations: input.patch.operations,
      targetFiles: input.targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: "verification-failed",
      reason:
        "Bounded multi-delete apply_patch shape matched a candidate route, but directory delete is not enabled.",
      nextAction:
        "Choose regular files for bounded multi-delete operations; directory delete remains unsupported.",
      failures: [directoryFailure],
    });
  }

  return buildVerifiedPlan({
    patch: input.patch,
    options: input.options,
    supportedOperations: ["delete"],
    supportStatus: "supported-write",
    failureClass: "none",
    plannedFiles: [],
    writeIntentFiles: input.operations.map((operation) => operation.path),
    targetFiles: input.targetFiles,
    reason:
      `Bounded 2-${MAX_BOUNDED_WRITE_OPERATIONS} Delete File operations are represented as supported write intents owned by the guarded bounded destructive workspace route.`,
    nextAction:
      "Route may delete only through explicit approval naming all targets, workspace guards, all final preflights before the first delete, parsed-order deletes, and per-file post-delete verification.",
    operationSupportStatus: "supported-write",
  });
}

function buildVerifiedDestructiveMovePlan(input: {
  readonly patch: ParsedPatch;
  readonly options: PerFilePatchPlanOptions;
  readonly operations: readonly Extract<PatchFileOperation, { kind: "move" }>[];
  readonly targetFiles: readonly string[];
}): PerFilePatchPlan {
  const conflict = sourceTargetConflictFailure(
    input.patch.operations,
    input.options.workspaceRoot,
  );
  if (conflict) {
    return buildUnsupportedPlan({
      operations: input.patch.operations,
      targetFiles: input.targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: "duplicate-target",
      reason:
        "Bounded multi-move apply_patch shape matched a candidate route, but source/target paths conflict.",
      nextAction:
        "Regenerate the multi-move patch so every source and target path is distinct; swaps and cycles remain unsupported.",
      failures: [conflict],
    });
  }

  const directoryFailure = directoryDeleteMoveFailure(
    input.patch.operations,
    input.options,
  );
  if (directoryFailure) {
    return buildUnsupportedPlan({
      operations: input.patch.operations,
      targetFiles: input.targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: "verification-failed",
      reason:
        "Bounded multi-move apply_patch shape matched a candidate route, but directory move is not enabled.",
      nextAction:
        "Choose regular files for bounded multi-move operations; directory move remains unsupported.",
      failures: [directoryFailure],
    });
  }

  const verification = verifyParsedPatch(input.patch, {
    workspaceRoot: input.options.workspaceRoot,
    readFile: input.options.readFile,
    ...(input.options.directoryExists
      ? { directoryExists: input.options.directoryExists }
      : {}),
    supportedOperations: ["move"],
  });
  if (verification.ok === false) {
    return buildUnsupportedPlan({
      operations: input.patch.operations,
      targetFiles: input.targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: failureClassForVerificationFailures(verification.failures),
      reason:
        "Bounded multi-move apply_patch shape matched a candidate route, but preflight verification failed before any writer was reachable.",
      nextAction:
        verification.failures[0]?.nextAction ??
        "Re-read current workspace files and regenerate the Move File patch.",
      failures: verification.failures,
    });
  }

  const moveContentFailure = verification.plan.operations.find(
    (operation) =>
      operation.operation.kind === "move" &&
      operation.originalContent !== operation.plannedContent,
  );
  if (moveContentFailure?.operation.kind === "move") {
    return buildUnsupportedPlan({
      operations: input.patch.operations,
      targetFiles: input.targetFiles,
      supportStatus: "unsupported-no-write",
      failureClass: "unsupported-operation",
      reason:
        "Bounded multi-move patches that also edit file content are represented as unsupported/no-write.",
      nextAction:
        "Regenerate pure Move File/rename operations and use separate approved update routes for content changes.",
      failures: [
        patchFailure({
          code: "patch-apply-plan-not-verified",
          path: moveContentFailure.operation.moveTo,
          message:
            "Guarded multi-move must preserve file content exactly; content edits during move are not enabled.",
          nextAction:
            "Use pure Move File/rename patches before expecting the move writer.",
        }),
      ],
    });
  }

  return buildVerifiedPlan({
    patch: input.patch,
    options: input.options,
    supportedOperations: ["move"],
    supportStatus: "supported-write",
    failureClass: "none",
    plannedFiles: [],
    writeIntentFiles: input.operations.map((operation) => operation.moveTo),
    targetFiles: input.targetFiles,
    reason:
      `Bounded 2-${MAX_BOUNDED_WRITE_OPERATIONS} Move File operations are represented as supported write intents owned by the guarded bounded destructive workspace route.`,
    nextAction:
      "Route may move only through explicit approval naming all sources and targets, workspace guards, all final preflights before the first move, parsed-order moves, and per-file post-move verification.",
    operationSupportStatus: "supported-write",
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
    const verificationOnlyBlockedByMoveTargetUpdate = verification.failures.every(
      (failure) =>
        isMoveTargetUpdateMissingFailure(input.patch.operations, failure),
    );
    if (verificationOnlyBlockedByMoveTargetUpdate) {
      return buildSupportedPlanWithoutVerification(input);
    }
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

  return buildSupportedPlanWithoutVerification(input);
}

function buildSupportedPlanWithoutVerification(input: {
  readonly patch: ParsedPatch;
  readonly supportStatus: PerFilePatchSupportStatus;
  readonly operationSupportStatus: PerFilePatchSupportStatus;
  readonly failureClass: PerFilePatchFailureClass;
  readonly targetFiles: readonly string[];
  readonly writeIntentFiles: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly reason: string;
  readonly nextAction: string;
}): PerFilePatchPlan {
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
  readonly mixedOperationReadiness?: MixedOperationReadinessProjection;
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
      ...(input.mixedOperationReadiness
        ? { mixedOperationReadiness: input.mixedOperationReadiness }
        : {}),
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
      ...(input.mixedOperationReadiness?.isMixedOperation
        ? ["per-file-patch-plan:mixed-operation-blocker"]
        : []),
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

function mixedOperationFailures(
  operations: readonly PatchFileOperation[],
  options: PerFilePatchPlanOptions,
): readonly PatchFailure[] {
  return operations.flatMap((operation) => {
    const pathFailures = unsupportedOperationPathFailures(operation, options);
    if (pathFailures.length > 0) {
      return pathFailures;
    }
    const operationKind = operationKindFromPatchOperation(operation);
    return [
      patchFailure({
        code: "patch-verify-operation-unsupported",
        path: targetPathForOperation(operation),
        message: `Mixed apply_patch operation family ${operationKind} is blocked by the mixed-operation no-write contract; no writer is reachable from this projection.`,
        nextAction:
          "Split the patch into one supported operation family, or wait for a dedicated mixed-operation route with authority, ordering, verification, and failure semantics.",
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

function mixedOperationCombinationIsSupported(
  operations: readonly PatchFileOperation[],
): boolean {
  if (!isBoundedWriteOperationCount(operations.length)) {
    return false;
  }
  const kinds = operations.map((operation) => operation.kind);
  if (new Set(kinds).size <= 1) {
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

function sourceTargetConflictFailure(
  operations: readonly PatchFileOperation[],
  workspaceRoot: string,
): PatchFailure | undefined {
  const seen = new Map<string, string>();
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index]!;
    for (const candidatePath of pathsForOperation(operation)) {
      const key = path.resolve(workspaceRoot, candidatePath);
      const previous = seen.get(key);
      if (previous) {
        if (isMoveTargetUpdateDependency(operations, index, candidatePath)) {
          continue;
        }
        return patchFailure({
          code: "patch-apply-plan-not-verified",
          path: candidatePath,
          message: `Mixed apply_patch source/target path conflict: ${candidatePath} conflicts with ${previous}.`,
          nextAction:
            "Regenerate the mixed patch so each operation source and target path is distinct.",
        });
      }
      seen.set(key, candidatePath);
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
    normalizePathKey(operation.path) === normalizePathKey(candidatePath) &&
    normalizePathKey(previous.moveTo) === normalizePathKey(candidatePath)
  );
}

function normalizePathKey(relativePath: string): string {
  return path.normalize(relativePath).replaceAll("\\", "/");
}

function directoryDeleteMoveFailure(
  operations: readonly PatchFileOperation[],
  options: PerFilePatchPlanOptions,
): PatchFailure | undefined {
  if (!options.directoryExists) {
    return undefined;
  }
  const directoryOperation = operations.find(
    (operation) =>
      (operation.kind === "delete" || operation.kind === "move") &&
      options.directoryExists?.(
        path.resolve(options.workspaceRoot, operation.path),
      ) === true,
  );
  if (!directoryOperation) {
    return undefined;
  }
  return patchFailure({
    code: "patch-apply-plan-not-verified",
    path: directoryOperation.path,
    message: `Mixed apply_patch ${directoryOperation.kind} operation targets a directory.`,
    nextAction:
      "Choose an existing regular file; directory delete/move is not enabled.",
  });
}

function pathsForOperation(operation: PatchFileOperation): readonly string[] {
  return operation.kind === "move"
    ? [operation.path, operation.moveTo]
    : [operation.path];
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

function duplicateTargetsForOperations(
  operations: readonly PatchFileOperation[],
): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (let index = 0; index < operations.length; index += 1) {
    const targetFile = targetPathForOperation(operations[index]!);
    if (seen.has(targetFile)) {
      if (!isMoveTargetUpdateDependency(operations, index, targetFile)) {
        duplicates.add(targetFile);
      }
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

function isDeleteOperation(
  operation: PatchFileOperation,
): operation is Extract<PatchFileOperation, { kind: "delete" }> {
  return operation.kind === "delete";
}

function isMoveOperation(
  operation: PatchFileOperation,
): operation is Extract<PatchFileOperation, { kind: "move" }> {
  return operation.kind === "move";
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
