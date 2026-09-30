import type { MixedOperationReadinessProjection } from "../patch/status/mixedOperation.js";
import type { JournalFailureSurfaceProjection } from "./journal/projection/failure.js";
import type { PerFilePatchFailureClass, PerFilePatchOperationKind, PerFilePatchSupportStatus } from "../patch/plan/types.js";

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
