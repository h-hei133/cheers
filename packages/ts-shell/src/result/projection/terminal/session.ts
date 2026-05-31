import type { SingleFileApplyPatchResultMapperSeamContract } from "../patch/bridge.js";

export type SingleFileApplyPatchSessionRuntimeSeamDisplayStatus =
  | "dry-run"
  | "blocked"
  | "permission-pending";

export interface SingleFileApplyPatchSessionRuntimeSeamContract {
  readonly source: "single-file-apply-patch-sessionruntime-safe-seam";
  readonly displaySafe: true;
  readonly consumesResultMapperSeam: true;
  readonly displayStatus: SingleFileApplyPatchSessionRuntimeSeamDisplayStatus;
  readonly terminalStatus: SingleFileApplyPatchResultMapperSeamContract["terminalStatus"];
  readonly terminalClassification: SingleFileApplyPatchResultMapperSeamContract["terminalClassification"];
  readonly terminalReason: SingleFileApplyPatchResultMapperSeamContract["terminalReason"];
  readonly title: string;
  readonly summaryLines: readonly string[];
  readonly changedDisplay: "none";
  readonly wouldChangeFiles: readonly string[];
  readonly previewChangedFiles: readonly string[];
  readonly mutationSuccessDisplayed: false;
  readonly writeSuccessDisplayed: false;
  readonly approvedDisplayed: false;
  readonly appliedPatchDisplayed: false;
  readonly rawPermissionMetadataDisplayed: false;
  readonly rawBaseContentDisplayed: false;
  readonly productionWriteReadyDisplayed: false;
  readonly nextAction: string;
  readonly doNext: string;
  readonly displaySafetyProof: {
    readonly mapperSeamOnly: true;
    readonly noChangedDisplay: true;
    readonly noMutationSuccess: true;
    readonly noWriteSuccess: true;
    readonly noPermissionGrant: true;
    readonly noAppliedPatch: true;
    readonly noRawPermissionMetadata: true;
    readonly noRawBaseContent: true;
    readonly noProductionWriteReady: true;
    readonly actionableNextStepPreserved: true;
  };
  readonly evidence: readonly string[];
}

export function buildSingleFileApplyPatchSessionRuntimeSeamContract(input: {
  readonly resultMapperSeam: SingleFileApplyPatchResultMapperSeamContract;
}): SingleFileApplyPatchSessionRuntimeSeamContract {
  const seam = input.resultMapperSeam;
  const displayStatus = toDisplayStatus(seam.status);

  return {
    source: "single-file-apply-patch-sessionruntime-safe-seam",
    displaySafe: true,
    consumesResultMapperSeam: true,
    displayStatus,
    terminalStatus: seam.terminalStatus,
    terminalClassification: seam.terminalClassification,
    terminalReason: seam.terminalReason,
    title: displayTitle(displayStatus),
    summaryLines: displaySummaryLines({
      displayStatus,
      stopReason: seam.stopReason,
      wouldChangeFiles: seam.wouldChangeFiles,
      nextAction: seam.nextAction,
    }),
    changedDisplay: "none",
    wouldChangeFiles: seam.wouldChangeFiles,
    previewChangedFiles: seam.previewChangedFiles,
    mutationSuccessDisplayed: false,
    writeSuccessDisplayed: false,
    approvedDisplayed: false,
    appliedPatchDisplayed: false,
    rawPermissionMetadataDisplayed: false,
    rawBaseContentDisplayed: false,
    productionWriteReadyDisplayed: false,
    nextAction: seam.nextAction,
    doNext: seam.doNext,
    displaySafetyProof: {
      mapperSeamOnly: true,
      noChangedDisplay: true,
      noMutationSuccess: true,
      noWriteSuccess: true,
      noPermissionGrant: true,
      noAppliedPatch: true,
      noRawPermissionMetadata: true,
      noRawBaseContent: true,
      noProductionWriteReady: true,
      actionableNextStepPreserved: true,
    },
    evidence: [
      "single-file-apply-patch-sessionruntime-seam:mapper-seam-input",
      `single-file-apply-patch-sessionruntime-seam:display-status:${displayStatus}`,
      "single-file-apply-patch-sessionruntime-seam:changed-display-none",
      "single-file-apply-patch-sessionruntime-seam:no-write-success",
      "single-file-apply-patch-sessionruntime-seam:no-mutation-success",
      "single-file-apply-patch-sessionruntime-seam:no-applied-patch",
      "single-file-apply-patch-sessionruntime-seam:no-permission-grant",
      "single-file-apply-patch-sessionruntime-seam:no-raw-permission-metadata",
      "single-file-apply-patch-sessionruntime-seam:no-raw-base-content",
      "single-file-apply-patch-sessionruntime-seam:no-production-ready-claim",
      "single-file-apply-patch-sessionruntime-seam:next-action-preserved",
    ],
  };
}

function toDisplayStatus(
  status: SingleFileApplyPatchResultMapperSeamContract["status"],
): SingleFileApplyPatchSessionRuntimeSeamDisplayStatus {
  switch (status) {
    case "dry-run-ready":
      return "dry-run";
    case "blocked":
      return "blocked";
    case "permission-pending":
      return "permission-pending";
  }
}

function displayTitle(
  status: SingleFileApplyPatchSessionRuntimeSeamDisplayStatus,
): string {
  switch (status) {
    case "dry-run":
      return "apply_patch dry-run preview";
    case "blocked":
      return "apply_patch blocked before write";
    case "permission-pending":
      return "apply_patch waiting for permission";
  }
}

function displaySummaryLines(input: {
  readonly displayStatus: SingleFileApplyPatchSessionRuntimeSeamDisplayStatus;
  readonly stopReason: string;
  readonly wouldChangeFiles: readonly string[];
  readonly nextAction: string;
}): readonly string[] {
  return [
    statusLine(input.displayStatus),
    "Changed: none",
    `Would change: ${input.wouldChangeFiles.length > 0 ? input.wouldChangeFiles.join(", ") : "none"}`,
    `Reason: ${input.stopReason}`,
    `Next: ${input.nextAction}`,
  ];
}

function statusLine(
  status: SingleFileApplyPatchSessionRuntimeSeamDisplayStatus,
): string {
  switch (status) {
    case "dry-run":
      return "Preview only; no file was modified.";
    case "blocked":
      return "Blocked before any write; no file was modified.";
    case "permission-pending":
      return "Waiting for explicit edit permission; no file was modified.";
  }
}
