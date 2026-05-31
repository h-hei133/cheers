import { mapTerminalToOrchestrationResult } from "../../../core/query/mapping/mapper.js";
import type { OrchestrationResult } from "../../../orchestration/types.js";
import type { SingleFileApplyPatchResultMapperConsumerContract } from "./mapper.js";

export type SingleFileApplyPatchResultMapperSeamStatus =
  | "dry-run-ready"
  | "blocked"
  | "permission-pending";

export interface SingleFileApplyPatchResultMapperSeamContract {
  readonly source: "single-file-apply-patch-resultmapper-safe-seam";
  readonly seamSafe: true;
  readonly inputKind: "mapper-consumer-contract";
  readonly status: SingleFileApplyPatchResultMapperSeamStatus;
  readonly terminalStatus: OrchestrationResult["status"];
  readonly terminalClassification: Exclude<
    OrchestrationResult["terminalClassification"],
    "success"
  >;
  readonly terminalReason: OrchestrationResult["terminalReason"];
  readonly stopReason: string;
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly patchesApplied: false;
  readonly verificationPassed: false;
  readonly taskSatisfied: false;
  readonly rawApprovalMetadataAccepted: false;
  readonly rawBaseContentAccepted: false;
  readonly rawWriterBoundaryAccepted: false;
  readonly attemptedFiles: readonly string[];
  readonly wouldChangeFiles: readonly string[];
  readonly previewChangedFiles: readonly string[];
  readonly nextAction: string;
  readonly doNext: string;
  readonly safetyProof: {
    readonly consumesMapperSafeProjection: true;
    readonly noMutationSuccess: true;
    readonly noWriteSuccess: true;
    readonly noAppliedPatch: true;
    readonly noChangedFiles: true;
    readonly noPermissionGrant: true;
    readonly noProductionWriteReady: true;
    readonly noRawBaseContent: true;
    readonly noRawWriterBoundary: true;
  };
  readonly evidence: readonly string[];
}

export function buildSingleFileApplyPatchResultMapperSeamContract(input: {
  readonly mapperConsumer: SingleFileApplyPatchResultMapperConsumerContract;
}): SingleFileApplyPatchResultMapperSeamContract {
  const consumer = input.mapperConsumer;
  const mappedResult = mapTerminalToOrchestrationResult(
    consumer.resultMapperInput.state,
    consumer.resultMapperInput.terminal,
  );

  if (mappedResult.terminalClassification === "success") {
    throw new Error(
      "single-file apply_patch mapper seam requires non-success mapped output",
    );
  }

  return {
    source: "single-file-apply-patch-resultmapper-safe-seam",
    seamSafe: true,
    inputKind: "mapper-consumer-contract",
    status: consumer.status,
    terminalStatus: mappedResult.status,
    terminalClassification: mappedResult.terminalClassification,
    terminalReason: mappedResult.terminalReason,
    stopReason:
      mappedResult.stopReason ??
      consumer.codingResult.verification.reason ??
      consumer.nextAction,
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    patchesApplied: false,
    verificationPassed: false,
    taskSatisfied: false,
    rawApprovalMetadataAccepted: false,
    rawBaseContentAccepted: false,
    rawWriterBoundaryAccepted: false,
    attemptedFiles: consumer.attemptedFiles,
    wouldChangeFiles: consumer.wouldChangeFiles,
    previewChangedFiles: consumer.previewChangedFiles,
    nextAction: consumer.nextAction,
    doNext: consumer.doNext,
    safetyProof: {
      consumesMapperSafeProjection: true,
      noMutationSuccess: true,
      noWriteSuccess: true,
      noAppliedPatch: true,
      noChangedFiles: true,
      noPermissionGrant: true,
      noProductionWriteReady: true,
      noRawBaseContent: true,
      noRawWriterBoundary: true,
    },
    evidence: [
      "single-file-apply-patch-resultmapper-seam:mapper-safe-input",
      `single-file-apply-patch-resultmapper-seam:status:${consumer.status}`,
      "single-file-apply-patch-resultmapper-seam:will-write-false",
      "single-file-apply-patch-resultmapper-seam:changed-files-empty",
      "single-file-apply-patch-resultmapper-seam:write-intents-empty",
      "single-file-apply-patch-resultmapper-seam:no-write-success",
      "single-file-apply-patch-resultmapper-seam:no-mutation-success",
      "single-file-apply-patch-resultmapper-seam:no-applied-patch",
      "single-file-apply-patch-resultmapper-seam:no-permission-grant",
      "single-file-apply-patch-resultmapper-seam:no-production-ready-claim",
      "single-file-apply-patch-resultmapper-seam:no-raw-base-content",
      "single-file-apply-patch-resultmapper-seam:no-raw-writer-boundary",
    ],
  };
}
