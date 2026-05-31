import path from "node:path";
import {
  buildSingleFileUpdatePatchApprovalContract,
  type SingleFileUpdatePatchApprovalContract,
} from "../../authority/approval/production.js";
import type { SingleFileUpdatePatchReadinessContract } from "../status/readiness.js";
import { buildSingleFileApplyPatchDryRun } from "./dryRun.js";
import type { SingleFileApplyPatchPermissionUxDecision } from "../../authority/approval/permission.js";
import { buildSingleFileApplyPatchPermissionUxContract } from "../../authority/approval/permission.js";
import { buildSingleFileApplyPatchResultMapperConsumerContract } from "../../../result/projection/patch/mapper.js";
import { buildSingleFileApplyPatchResultMapperSeamContract } from "../../../result/projection/patch/bridge.js";
import { buildSingleFileApplyPatchRuntimeBridge } from "../../../result/projection/patch/runtime.js";
import { buildSingleFileApplyPatchSessionRuntimeSeamContract } from "../../../result/projection/terminal/session.js";
import { buildSingleFileApplyPatchStaleReadContract } from "./staleRead.js";
import { buildSingleFileApplyPatchTerminalSurface } from "../../../result/projection/patch/terminal.js";

export interface SingleFileApplyPatchOptInDryRunRouteInput {
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly dryRun: true;
  readonly explicitOptIn?: boolean;
  readonly requestedUserDecision?: SingleFileApplyPatchPermissionUxDecision | "approved";
}

export interface SingleFileApplyPatchOptInDryRunRouteRejected {
  readonly source: "single-file-apply-patch-opt-in-dry-run-route";
  readonly status: "rejected";
  readonly explicitOptIn: false;
  readonly reason: string;
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly noWriterInvoked: true;
  readonly noAppliedPatchRecord: true;
  readonly doesNotClaimMutationSuccess: true;
  readonly doesNotChangeDefaultProductionRejection: true;
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export interface SingleFileApplyPatchOptInDryRunRouteAccepted {
  readonly source: "single-file-apply-patch-opt-in-dry-run-route";
  readonly status: "dry-run-ready" | "blocked" | "permission-pending";
  readonly explicitOptIn: true;
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly noWriterInvoked: true;
  readonly noAppliedPatchRecord: true;
  readonly doesNotClaimMutationSuccess: true;
  readonly doesNotClaimWriteSuccess: true;
  readonly dryRun: ReturnType<typeof buildSingleFileApplyPatchDryRun>;
  readonly staleRead?: ReturnType<typeof buildSingleFileApplyPatchStaleReadContract>;
  readonly permissionUx: ReturnType<
    typeof buildSingleFileApplyPatchPermissionUxContract
  >;
  readonly terminalSurface: ReturnType<
    typeof buildSingleFileApplyPatchTerminalSurface
  >;
  readonly runtimeBridge: ReturnType<typeof buildSingleFileApplyPatchRuntimeBridge>;
  readonly resultMapperConsumer: ReturnType<
    typeof buildSingleFileApplyPatchResultMapperConsumerContract
  >;
  readonly resultMapperSeam: ReturnType<
    typeof buildSingleFileApplyPatchResultMapperSeamContract
  >;
  readonly sessionRuntimeSeam: ReturnType<
    typeof buildSingleFileApplyPatchSessionRuntimeSeamContract
  >;
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export type SingleFileApplyPatchOptInDryRunRouteResult =
  | SingleFileApplyPatchOptInDryRunRouteRejected
  | SingleFileApplyPatchOptInDryRunRouteAccepted;

export function buildSingleFileApplyPatchOptInDryRunRoute(
  input: SingleFileApplyPatchOptInDryRunRouteInput,
): SingleFileApplyPatchOptInDryRunRouteResult {
  if (input.explicitOptIn !== true) {
    const nextAction =
      "Keep default production apply_patch and unified diff inputs rejected; rerun with explicit opt-in dry-run only when a preview route is approved.";
    return {
      source: "single-file-apply-patch-opt-in-dry-run-route",
      status: "rejected",
      explicitOptIn: false,
      reason: "single-file apply_patch dry-run route requires explicit opt-in",
      willWrite: false,
      changedFiles: [],
      writeIntents: [],
      noWriterInvoked: true,
      noAppliedPatchRecord: true,
      doesNotClaimMutationSuccess: true,
      doesNotChangeDefaultProductionRejection: true,
      nextAction,
      doNext: nextAction,
      evidence: [
        "single-file-apply-patch-opt-in-dry-run-route:rejected",
        "single-file-apply-patch-opt-in-dry-run-route:explicit-opt-in-missing",
        "single-file-apply-patch-opt-in-dry-run-route:default-production-rejection-unchanged",
        "single-file-apply-patch-opt-in-dry-run-route:will-write-false",
        "single-file-apply-patch-opt-in-dry-run-route:no-writer-invoked",
      ],
    };
  }

  const dryRun = buildSingleFileApplyPatchDryRun({
    workspaceRoot: input.workspaceRoot,
    rawPatchText: input.rawPatchText,
    readFile: input.readFile,
    dryRun: true,
  });
  const staleRead = dryRun.baseEvidence
    ? buildSingleFileApplyPatchStaleReadContract({
        baseEvidence: dryRun.baseEvidence,
        currentContent: input.readFile(
          path.resolve(input.workspaceRoot, dryRun.baseEvidence.targetPath),
        ),
        phase: "write-decision-dry-run",
        dryRun: true,
      })
    : undefined;
  const approval =
    dryRun.approval.decision === "pending" && staleRead
      ? buildSingleFileUpdatePatchApprovalContract(
          buildReadinessFromDryRunApproval(dryRun.approval),
          {
            staleRead,
            decision:
              input.requestedUserDecision === "denied"
                ? "denied"
                : input.requestedUserDecision === "approved"
                  ? "approved"
                  : "pending",
          },
        )
      : undefined;
  const terminalSurface = buildSingleFileApplyPatchTerminalSurface({
    dryRun,
    ...(staleRead ? { staleRead } : {}),
    ...(approval ? { approval } : {}),
  });
  const permissionUx = buildSingleFileApplyPatchPermissionUxContract({
    dryRunResult: dryRun,
    terminalSurface,
    ...(approval ? { approval } : {}),
    ...(staleRead ? { staleReadPrecondition: terminalSurface.staleReadPrecondition } : {}),
    ...(input.requestedUserDecision
      ? { requestedUserDecision: input.requestedUserDecision }
      : {}),
  });
  const runtimeBridge = buildSingleFileApplyPatchRuntimeBridge({
    terminalSurface,
  });
  const resultMapperConsumer = buildSingleFileApplyPatchResultMapperConsumerContract({
    runtimeBridge,
  });
  const resultMapperSeam = buildSingleFileApplyPatchResultMapperSeamContract({
    mapperConsumer: resultMapperConsumer,
  });
  const sessionRuntimeSeam = buildSingleFileApplyPatchSessionRuntimeSeamContract({
    resultMapperSeam,
  });

  return {
    source: "single-file-apply-patch-opt-in-dry-run-route",
    status: terminalSurface.status,
    explicitOptIn: true,
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    noWriterInvoked: true,
    noAppliedPatchRecord: true,
    doesNotClaimMutationSuccess: true,
    doesNotClaimWriteSuccess: true,
    dryRun,
    ...(staleRead ? { staleRead } : {}),
    permissionUx,
    terminalSurface,
    runtimeBridge,
    resultMapperConsumer,
    resultMapperSeam,
    sessionRuntimeSeam,
    nextAction: sessionRuntimeSeam.nextAction,
    doNext: sessionRuntimeSeam.doNext,
    evidence: [
      "single-file-apply-patch-opt-in-dry-run-route:explicit-opt-in",
      `single-file-apply-patch-opt-in-dry-run-route:status:${terminalSurface.status}`,
      "single-file-apply-patch-opt-in-dry-run-route:will-write-false",
      "single-file-apply-patch-opt-in-dry-run-route:changed-files-empty",
      "single-file-apply-patch-opt-in-dry-run-route:write-intents-empty",
      "single-file-apply-patch-opt-in-dry-run-route:no-writer-invoked",
      "single-file-apply-patch-opt-in-dry-run-route:no-applied-patch-record",
      "single-file-apply-patch-opt-in-dry-run-route:no-mutation-success",
      "single-file-apply-patch-opt-in-dry-run-route:result-session-safe",
    ],
  };
}

function buildReadinessFromDryRunApproval(
  approval: SingleFileUpdatePatchApprovalContract,
): SingleFileUpdatePatchReadinessContract {
  return {
    ready: true,
    permissionMetadata: {
      capability: "single-file-update-apply-patch-readiness",
      operationKind: "update",
      targetPath: approval.targetPath,
      previewSummary: approval.metadata.previewSummary,
      additions: approval.metadata.additions,
      deletions: approval.metadata.deletions,
      singleFileOnly: true,
      unsupportedOperations: ["multi-file", "add", "delete", "move"],
      willWrite: false,
    },
    result: {
      status: "ready",
      changedFiles: approval.targetPath ? [approval.targetPath] : [],
      failedFiles: [],
      patches: approval.metadata.files.map((file) => ({
        path: file.path,
        operation: "update" as const,
        status: "previewed" as const,
        additions: file.additions,
        deletions: file.deletions,
      })),
      evidence: ["single-file-apply-patch-opt-in-dry-run-route:readiness"],
      nextAction: "Keep this opt-in dry-run route no-write.",
    },
    noPartial: {
      atomicity: "verify-all-before-write",
      writeIntents: 1,
      blockedWrites: false,
    },
  };
}
