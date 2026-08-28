import type { MixedOperationReadinessProjection } from "../patch/status/mixedOperation.js";
import {
  projectJournalFailureSurface,
  type JournalFailureSurfaceProjection,
} from "./journal/projection/failure.js";
import type {
  PerFilePatchFailureClass,
  PerFilePatchOperationKind,
  PerFilePatchPlan,
  PerFilePatchSupportStatus,
} from "../patch/plan/types.js";
import type { RouteScopedEditJournal } from "./journal/model.js";

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
  readonly mixedOperationReadiness?: MixedOperationReadinessProjection;
  readonly routeScopedEditJournal?: JournalFailureSurfaceProjection;
  readonly successLike: boolean;
  readonly evidence: readonly string[];
}

export function projectPerFilePatchResult(input: {
  readonly plan: PerFilePatchPlan;
  readonly routeScopedEditJournal?: RouteScopedEditJournal;
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
    ...(input.plan.summary.mixedOperationReadiness
      ? { mixedOperationReadiness: input.plan.summary.mixedOperationReadiness }
      : {}),
    ...(input.routeScopedEditJournal
      ? {
          routeScopedEditJournal: projectJournalFailureSurface(
            input.routeScopedEditJournal,
          ),
        }
      : {}),
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
      ...(input.plan.summary.mixedOperationReadiness?.isMixedOperation
        ? ["per-file-patch-result:mixed-operation-no-write"]
        : []),
      ...(input.routeScopedEditJournal
        ? ["per-file-patch-result:route-scoped-journal-attached"]
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
