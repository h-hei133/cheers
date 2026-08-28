import type {
  PatchFailure,
  PatchFileOperation,
} from "../../../orchestration/patchParsing/types.js";
import type {
  PerFilePatchFailureClass,
  PerFilePatchOperation,
  PerFilePatchPlan,
  PerFilePatchPlanOptions,
} from "./types.js";
import { targetPathForOperation } from "./operation.js";

export function buildInvalidPatchPlan(
  _options: PerFilePatchPlanOptions,
  failure?: PatchFailure,
): PerFilePatchPlan {
  const failureList = failure ? [failure] : [];
  const reason =
    failure?.message ??
    "Failed to parse apply_patch text as valid patch syntax.";
  return {
    source: "per-file-patch-plan",
    operations: [],
    summary: {
      supportStatus: "invalid-model-output",
      failureClass: "parse-failure",
      targetFiles: [],
      writeIntentFiles: [],
      plannedFiles: [],
      changedFiles: [],
      failedFiles: failureList,
      willWrite: false,
      writerInvoked: false,
      workspaceWriterInvoked: false,
      postWriteVerification: "not-run",
      writerInvocationCondition: "never",
      userVisibleReason: reason,
      nextAction:
        failure?.nextAction ??
        "Inspect raw patch syntax and regenerate valid diff hunks.",
    },
    evidence: [
      "per-file-patch:parse-invalid",
      "per-file-patch:invalid-model-output",
      "per-file-patch:writer-not-invoked",
    ],
  };
}

export function buildUnsupportedPlan(input: {
  readonly operations: readonly PatchFileOperation[];
  readonly targetFiles: readonly string[];
  readonly supportStatus: "unsupported-no-write";
  readonly failureClass: PerFilePatchFailureClass;
  readonly reason: string;
  readonly nextAction: string;
  readonly failures: readonly PatchFailure[];
}): PerFilePatchPlan {
  const operations: PerFilePatchOperation[] = input.operations.map((op) => ({
    operationKind:
      op.kind === "add"
        ? "create"
        : op.kind === "update"
          ? "update"
          : op.kind === "delete"
            ? "delete"
            : "move",
    supportStatus: input.supportStatus,
    targetPath: targetPathForOperation(op),
    writeIntent: "none",
    verificationExpectation: "not-run-unsupported",
    userVisibleReason: input.reason,
  }));

  return {
    source: "per-file-patch-plan",
    operations,
    summary: {
      supportStatus: input.supportStatus,
      failureClass: input.failureClass,
      targetFiles: input.targetFiles,
      writeIntentFiles: [],
      plannedFiles: [],
      changedFiles: [],
      failedFiles: input.failures,
      willWrite: false,
      writerInvoked: false,
      workspaceWriterInvoked: false,
      postWriteVerification: "not-run",
      writerInvocationCondition: "never",
      userVisibleReason: input.reason,
      nextAction: input.nextAction,
    },
    evidence: [
      "per-file-patch:unsupported-no-write",
      "per-file-patch:writer-not-invoked",
      `per-file-patch:failure-class:${input.failureClass}`,
    ],
  };
}
