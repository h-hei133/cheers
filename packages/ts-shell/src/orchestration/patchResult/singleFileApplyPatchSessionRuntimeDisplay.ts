import type { OrchestrationResult } from "../../orchestration/types.js";
import type { SingleFileApplyPatchResultMapperConsumerContract } from "./singleFileApplyPatchResultMapperConsumer.js";

export type SingleFileApplyPatchSessionRuntimeDisplayStatus =
  | "preview-dry-run"
  | "blocked"
  | "pending-approval";

export interface SingleFileApplyPatchSessionRuntimeDisplayContract {
  readonly source: "single-file-apply-patch-resultmapper-consumer";
  readonly sessionRuntimeDisplaySafe: true;
  readonly consumesMapperSafeProjection: true;
  readonly consumesRawPermissionMetadata: false;
  readonly status: SingleFileApplyPatchSessionRuntimeDisplayStatus;
  readonly terminalResultVisible: true;
  readonly terminalStatus: OrchestrationResult["status"];
  readonly terminalClassification: OrchestrationResult["terminalClassification"];
  readonly terminalReason: OrchestrationResult["terminalReason"];
  readonly displayTitle: string;
  readonly summaryLines: readonly string[];
  readonly changedFiles: readonly [];
  readonly changedFilesLabel: "none";
  readonly wouldChangeFiles: readonly string[];
  readonly previewChangedFiles: readonly string[];
  readonly approval: {
    readonly decision: "pending" | "blocked" | "denied";
    readonly writeIntent: {
      readonly authorized: false;
      readonly count: 0;
    };
  };
  readonly blocker?: {
    readonly kind: string;
    readonly reason: string;
    readonly nextAction: string;
    readonly doNext: string;
  };
  readonly noWriteProof: {
    readonly willWrite: false;
    readonly changedFiles: readonly [];
    readonly writeIntents: readonly [];
    readonly noWriterInvoked: true;
    readonly doesNotClaimWriteSuccess: true;
    readonly doesNotClaimMutationSuccess: true;
    readonly doesNotDisplayAppliedPatch: true;
  };
  readonly displaySafetyProof: {
    readonly noBaseContentLeaked: true;
    readonly noChangedFilesLeaked: true;
    readonly noWriteSuccessMarker: true;
    readonly noMutationSuccessMarker: true;
    readonly noAppliedPatchMarker: true;
    readonly noProductionReadyClaim: true;
    readonly noPermissionGrantClaim: true;
    readonly previewFilesOnlyInWouldChangeFiles: true;
  };
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export function buildSingleFileApplyPatchSessionRuntimeDisplayContract(input: {
  readonly mapperConsumer: SingleFileApplyPatchResultMapperConsumerContract;
  readonly orchestrationResult: OrchestrationResult;
}): SingleFileApplyPatchSessionRuntimeDisplayContract {
  const status = displayStatus(input.mapperConsumer.status);
  const reason =
    input.orchestrationResult.stopReason ??
    input.mapperConsumer.codingResult.verification.reason ??
    input.mapperConsumer.nextAction;
  const blocker =
    status === "blocked" || status === "pending-approval"
      ? {
          kind: input.mapperConsumer.blockerKind,
          reason,
          nextAction: input.mapperConsumer.nextAction,
          doNext: input.mapperConsumer.doNext,
        }
      : undefined;

  return {
    source: "single-file-apply-patch-resultmapper-consumer",
    sessionRuntimeDisplaySafe: true,
    consumesMapperSafeProjection: true,
    consumesRawPermissionMetadata: false,
    status,
    terminalResultVisible: true,
    terminalStatus: input.orchestrationResult.status,
    terminalClassification: input.orchestrationResult.terminalClassification,
    terminalReason: input.orchestrationResult.terminalReason,
    displayTitle: displayTitle(status),
    summaryLines: displaySummaryLines({
      status,
      reason,
      wouldChangeFiles: input.mapperConsumer.wouldChangeFiles,
      nextAction: input.mapperConsumer.nextAction,
    }),
    changedFiles: [],
    changedFilesLabel: "none",
    wouldChangeFiles: input.mapperConsumer.wouldChangeFiles,
    previewChangedFiles: input.mapperConsumer.previewChangedFiles,
    approval: {
      decision: displayApprovalDecision(input.mapperConsumer.status),
      writeIntent: {
        authorized: false,
        count: 0,
      },
    },
    ...(blocker ? { blocker } : {}),
    noWriteProof: {
      willWrite: false,
      changedFiles: [],
      writeIntents: [],
      noWriterInvoked: true,
      doesNotClaimWriteSuccess: true,
      doesNotClaimMutationSuccess: true,
      doesNotDisplayAppliedPatch: true,
    },
    displaySafetyProof: {
      noBaseContentLeaked: true,
      noChangedFilesLeaked: true,
      noWriteSuccessMarker: true,
      noMutationSuccessMarker: true,
      noAppliedPatchMarker: true,
      noProductionReadyClaim: true,
      noPermissionGrantClaim: true,
      previewFilesOnlyInWouldChangeFiles: true,
    },
    nextAction: input.mapperConsumer.nextAction,
    doNext: input.mapperConsumer.doNext,
    evidence: [
      ...displaySafeEvidence(input.mapperConsumer.codingResult.evidence),
      "single-file-apply-patch-sessionruntime-display:mapper-safe-input",
      `single-file-apply-patch-sessionruntime-display:status:${status}`,
      "single-file-apply-patch-sessionruntime-display:changed-files-none",
      "single-file-apply-patch-sessionruntime-display:no-write-success",
      "single-file-apply-patch-sessionruntime-display:no-mutation-success",
      "single-file-apply-patch-sessionruntime-display:no-applied-patch",
      "single-file-apply-patch-sessionruntime-display:no-production-ready-claim",
      "single-file-apply-patch-sessionruntime-display:no-base-content",
    ],
  };
}

function displayStatus(
  status: SingleFileApplyPatchResultMapperConsumerContract["status"],
): SingleFileApplyPatchSessionRuntimeDisplayStatus {
  switch (status) {
    case "dry-run-ready":
      return "preview-dry-run";
    case "permission-pending":
      return "pending-approval";
    case "blocked":
      return "blocked";
  }
}

function displayTitle(
  status: SingleFileApplyPatchSessionRuntimeDisplayStatus,
): string {
  switch (status) {
    case "preview-dry-run":
      return "apply_patch preview only";
    case "pending-approval":
      return "apply_patch waiting for permission";
    case "blocked":
      return "apply_patch blocked";
  }
}

function displaySummaryLines(input: {
  readonly status: SingleFileApplyPatchSessionRuntimeDisplayStatus;
  readonly reason: string;
  readonly wouldChangeFiles: readonly string[];
  readonly nextAction: string;
}): readonly string[] {
  return [
    statusLine(input.status),
    "Changed files: none",
    `Would change: ${input.wouldChangeFiles.length > 0 ? input.wouldChangeFiles.join(", ") : "none"}`,
    `Reason: ${input.reason}`,
    `Next action: ${input.nextAction}`,
  ];
}

function statusLine(
  status: SingleFileApplyPatchSessionRuntimeDisplayStatus,
): string {
  switch (status) {
    case "preview-dry-run":
      return "Preview only; no file was modified.";
    case "pending-approval":
      return "Waiting for explicit edit permission; no file was modified.";
    case "blocked":
      return "Blocked before any write; no file was modified.";
  }
}

function displayApprovalDecision(
  status: SingleFileApplyPatchResultMapperConsumerContract["status"],
): "pending" | "blocked" | "denied" {
  return status === "blocked" ? "blocked" : "pending";
}

function displaySafeEvidence(evidence: readonly string[]): readonly string[] {
  return evidence.filter(
    (entry) => !entry.toLowerCase().includes("production-write-ready"),
  );
}
