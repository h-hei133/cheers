import type { SingleFileApplyPatchRequestedUserDecision } from "./patchResult/singleFileApplyPatchPermissionUxContract.js";
import type { WorkspaceWriteTargetAuthority } from "./patchResult/workspaceAuthority.js";
import {
  runFencedEditReplacementRoute,
  type FencedEditReplacementRoute,
} from "./fencedEditRoute.js";
import type { FencedEditMapping } from "./fencedEditPlanner.js";
import type { RecoveryAuthorityStoreConfig } from "./patchRecovery/recoveryAuthorityStore.js";
import type { EditSnapshotStorageOptions } from "./editSnapshot.js";
import {
  buildTargetSetEditPlan,
  type TargetSetEditPlan,
} from "./targetSetEditPlan.js";
import type { DiscoveryEditManifest } from "./discoveryEditManifest.js";

export type TargetSetEditRouteStatus =
  | "written"
  | "preflight-stopped"
  | "partial-failure"
  | "failed";

export interface TargetSetEditFileResult {
  readonly targetPath: string;
  readonly status: "written" | "stopped" | "failed" | "not-run";
  readonly route?: FencedEditReplacementRoute;
  readonly changedFiles: readonly string[];
  readonly recoveryReadiness: "rollback-ready" | "rollback-not-run";
  readonly reason?: string;
  readonly evidence: readonly string[];
}

export interface TargetSetEditRoute {
  readonly source: "target-set-edit-route";
  readonly status: TargetSetEditRouteStatus;
  readonly manifestId: string;
  readonly plan: TargetSetEditPlan;
  readonly targetCount: number;
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly { path: string; reason: string }[];
  readonly fileResults: readonly TargetSetEditFileResult[];
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly postWriteVerification: "passed" | "not-run" | "blocked" | "failed";
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export interface TargetSetEditRouteOptions {
  readonly workspaceRoot: string;
  readonly manifest: DiscoveryEditManifest;
  readonly confirmedTargetSet?: readonly string[];
  readonly mapping?: FencedEditMapping;
  readonly maxFiles?: number;
  readonly explicitRuntimeOptIn: boolean;
  readonly explicitWorkspaceWriteOptIn: boolean;
  readonly requestedUserDecision?: SingleFileApplyPatchRequestedUserDecision;
  readonly defaultProductionRejectionUnchanged: true;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly readVerifiedFile: (relativePath: string) => string | undefined;
  readonly validateWriteTarget: (
    relativePath: string,
  ) => WorkspaceWriteTargetAuthority;
  readonly writeFile: (relativePath: string, content: string) => void | Promise<void>;
  readonly recoveryAuthority?: RecoveryAuthorityStoreConfig;
  readonly snapshotStorage?: EditSnapshotStorageOptions;
  readonly abortSignal?: AbortSignal;
  readonly unsupportedBlocker?: "unsupported-fuzzy" | "unsupported-generated" | "unsupported-broad";
}

export async function runTargetSetEditRoute(
  options: TargetSetEditRouteOptions,
): Promise<TargetSetEditRoute> {
  const plan = buildTargetSetEditPlan({
    manifest: options.manifest,
    confirmedTargetSet: options.confirmedTargetSet,
    mapping: options.mapping,
    workspaceRoot: options.workspaceRoot,
    maxFiles: options.maxFiles,
    readFile: options.readFile,
    validateWriteTarget: options.validateWriteTarget,
    ...(options.unsupportedBlocker
      ? { unsupportedBlocker: options.unsupportedBlocker }
      : {}),
  });

  if (plan.status === "blocked") {
    return {
      source: "target-set-edit-route",
      status: "preflight-stopped",
      manifestId: plan.manifestId,
      plan,
      targetCount: plan.targetCount,
      changedFiles: [],
      failedFiles: plan.targetPath
        ? [{ path: plan.targetPath, reason: plan.reason }]
        : [],
      fileResults: [],
      terminalClassification: "stopped",
      postWriteVerification: "not-run",
      nextAction: plan.nextAction,
      evidence: [
        ...plan.evidence,
        "target-set-edit-outcome:target-set-edit-preflight-stopped",
        "target-set-edit-route:no-writer-invoked",
        "target-set-edit-rollback-not-run",
      ],
    };
  }

  const fileResults: TargetSetEditFileResult[] = [];
  const changedFiles: string[] = [];
  const failedFiles: Array<{ path: string; reason: string }> = [];
  for (const target of plan.targets) {
    const route = await runFencedEditReplacementRoute({
      workspaceRoot: options.workspaceRoot,
      targetPath: target.targetPath,
      mapping: options.mapping,
      explicitRuntimeOptIn: options.explicitRuntimeOptIn,
      explicitWorkspaceWriteOptIn: options.explicitWorkspaceWriteOptIn,
      ...(options.requestedUserDecision
        ? { requestedUserDecision: options.requestedUserDecision }
        : {}),
      defaultProductionRejectionUnchanged:
        options.defaultProductionRejectionUnchanged,
      readFile: options.readFile,
      readVerifiedFile: options.readVerifiedFile,
      validateWriteTarget: options.validateWriteTarget,
      writeFile: options.writeFile,
      ...(options.recoveryAuthority
        ? { recoveryAuthority: options.recoveryAuthority }
        : {}),
      ...(options.snapshotStorage ? { snapshotStorage: options.snapshotStorage } : {}),
      ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
    });

    if (route.status === "written") {
      changedFiles.push(...route.changedFiles);
      fileResults.push({
        targetPath: target.targetPath,
        status: "written",
        route,
        changedFiles: route.changedFiles,
        recoveryReadiness: "rollback-ready",
        evidence: [
          `target-set-edit-route:file:${target.targetPath}:written`,
          "target-set-edit-rollback-ready",
          ...route.evidence,
        ],
      });
      continue;
    }

    const status = route.terminalClassification === "error" ? "failed" : "stopped";
    const reason = route.nextAction;
    failedFiles.push({ path: target.targetPath, reason });
    fileResults.push({
      targetPath: target.targetPath,
      status,
      route,
      changedFiles: [],
      recoveryReadiness:
        route.snapshotReceipt?.status === "snapshot-created"
          ? "rollback-ready"
          : "rollback-not-run",
      reason,
      evidence: [
        `target-set-edit-route:file:${target.targetPath}:${status}`,
        route.snapshotReceipt?.status === "snapshot-created"
          ? "target-set-edit-rollback-ready"
          : "target-set-edit-rollback-not-run",
        ...route.evidence,
      ],
    });
    break;
  }

  const skippedTargets = plan.targets.slice(fileResults.length);
  for (const target of skippedTargets) {
    failedFiles.push({
      path: target.targetPath,
      reason: "Not run after earlier target-set edit failure.",
    });
    fileResults.push({
      targetPath: target.targetPath,
      status: "not-run",
      changedFiles: [],
      recoveryReadiness: "rollback-not-run",
      reason: "Not run after earlier target-set edit failure.",
      evidence: [
        `target-set-edit-route:file:${target.targetPath}:not-run`,
        "target-set-edit-rollback-not-run",
      ],
    });
  }

  const status = classifyStatus({ changedFiles, failedFiles, fileResults });
  const terminalClassification = status === "written" ? "success" : "error";
  return {
    source: "target-set-edit-route",
    status,
    manifestId: plan.manifestId,
    plan,
    targetCount: plan.targetCount,
    changedFiles,
    failedFiles,
    fileResults,
    terminalClassification,
    postWriteVerification: status === "written" ? "passed" : "failed",
    nextAction:
      status === "written"
        ? "Target-set exact fenced replacement completed."
        : "Inspect changed and failed files before retrying; rollback is explicit-only.",
    evidence: [
      ...plan.evidence,
      `target-set-edit-outcome:target-set-edit-${status}`,
      `target-set-edit-route:changed-count:${changedFiles.length}`,
      `target-set-edit-route:failed-count:${failedFiles.length}`,
      "target-set-edit-route:reuse-existing-fenced-lane",
      "target-set-edit-route:no-automatic-rollback",
      "target-set-edit-route:raw-content-excluded",
      ...(status === "partial-failure"
        ? ["actionable-blocker-kind:partial-mutation-failed"]
        : status === "failed"
          ? ["actionable-blocker-kind:verification-failed"]
          : status === "preflight-stopped"
            ? ["actionable-blocker-kind:unsupported-future-edit"]
            : []),
      ...fileResults.flatMap((result) => result.evidence),
    ],
  };
}

function classifyStatus(input: {
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly { path: string; reason: string }[];
  readonly fileResults: readonly TargetSetEditFileResult[];
}): TargetSetEditRouteStatus {
  if (input.failedFiles.length === 0) {
    return "written";
  }
  if (input.changedFiles.length > 0) {
    return "partial-failure";
  }
  return input.fileResults.some((result) => result.status === "failed")
    ? "failed"
    : "preflight-stopped";
}
