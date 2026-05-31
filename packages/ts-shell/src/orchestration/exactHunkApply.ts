import {
  runWorkspaceWriteRoute,
  type WorkspaceWriteRoute,
} from "./patchResult/workspaceWriteRoute.js";
import type { SingleFileApplyPatchRequestedUserDecision } from "./patchResult/singleFileApplyPatchPermissionUxContract.js";
import type { WorkspaceWriteTargetAuthority } from "../edit/authority/workspace.js";
import type { RecoveryAuthorityStoreConfig } from "./patchRecovery/recoveryAuthorityStore.js";
import {
  buildEditSnapshotStoreConfig,
  projectEditSnapshotReceiptForWorkspaceRoute,
  type EditSnapshotReceipt,
  type EditSnapshotStorageOptions,
} from "./editSnapshot.js";
import type { FencedEditMapping } from "./fencedEditPlanner.js";
import { splitExactHunkLines } from "./exactHunkSet.js";

export type ExactHunkApplyStatus = "written" | "blocked";

export type ExactHunkApplyRoute =
  | {
      readonly source: "exact-hunk-apply-route";
      readonly status: "written";
      readonly targetPath: string;
      readonly hunkIds: readonly string[];
      readonly hunkCount: number;
      readonly rawPatchText: string;
      readonly workspaceRoute: Extract<WorkspaceWriteRoute, { status: "written" }>;
      readonly snapshotReceipt: EditSnapshotReceipt;
      readonly changedFiles: readonly [string];
      readonly postWriteVerification: "passed";
      readonly recoveryReadiness: "rollback-ready";
      readonly evidence: readonly string[];
    }
  | {
      readonly source: "exact-hunk-apply-route";
      readonly status: "blocked";
      readonly targetPath: string;
      readonly hunkIds: readonly string[];
      readonly hunkCount: number;
      readonly rawPatchText: string;
      readonly workspaceRoute: Extract<WorkspaceWriteRoute, { status: "blocked" }>;
      readonly snapshotReceipt: EditSnapshotReceipt;
      readonly changedFiles: readonly [];
      readonly postWriteVerification: "not-run" | "blocked" | "failed";
      readonly recoveryReadiness: "rollback-ready" | "rollback-not-run";
      readonly reason: string;
      readonly evidence: readonly string[];
    };

export interface ExactHunkApplyOptions {
  readonly workspaceRoot: string;
  readonly targetPath: string;
  readonly hunks: readonly {
    readonly hunkId: string;
    readonly mapping: FencedEditMapping;
  }[];
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
}

export async function runExactHunkApplyRoute(
  options: ExactHunkApplyOptions,
): Promise<ExactHunkApplyRoute> {
  const rawPatchText = buildMultiHunkApplyPatch({
    targetPath: options.targetPath,
    hunks: options.hunks,
  });
  const workspaceRoute = await runWorkspaceWriteRoute({
    workspaceRoot: options.workspaceRoot,
    rawPatchText,
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
    recoveryAuthority:
      options.recoveryAuthority ??
      buildEditSnapshotStoreConfig({
        workspaceRoot: options.workspaceRoot,
        targetPath: options.targetPath,
        storage: options.snapshotStorage,
      }),
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
  });
  const snapshotReceipt = projectEditSnapshotReceiptForWorkspaceRoute({
    workspaceRoot: options.workspaceRoot,
    targetPath: options.targetPath,
    workspaceRoute,
  });
  const hunkIds = options.hunks.map((hunk) => hunk.hunkId);

  if (workspaceRoute.status === "written") {
    return {
      source: "exact-hunk-apply-route",
      status: "written",
      targetPath: options.targetPath,
      hunkIds,
      hunkCount: hunkIds.length,
      rawPatchText,
      workspaceRoute,
      snapshotReceipt,
      changedFiles: workspaceRoute.changedFiles,
      postWriteVerification: "passed",
      recoveryReadiness: "rollback-ready",
      evidence: [
        `exact-hunk-apply:file:${options.targetPath}:written`,
        `exact-hunk-apply:hunk-count:${hunkIds.length}`,
        "exact-hunk-apply:single-file-one-write",
        "exact-hunk-apply:one-pre-write-snapshot",
        "exact-hunk-apply:final-stale-read-preserved",
        "exact-hunk-apply:post-write-verification-passed",
        "exact-hunk-apply:raw-content-excluded",
        ...hunkIds.map((hunkId) => `exact-hunk-apply:hunk:${hunkId}:written`),
        ...workspaceRoute.evidence,
      ],
    };
  }

  return {
    source: "exact-hunk-apply-route",
    status: "blocked",
    targetPath: options.targetPath,
    hunkIds,
    hunkCount: hunkIds.length,
    rawPatchText,
    workspaceRoute,
    snapshotReceipt,
    changedFiles: [],
    postWriteVerification: workspaceRoute.postWriteVerification,
    recoveryReadiness:
      snapshotReceipt.status === "snapshot-created"
        ? "rollback-ready"
        : "rollback-not-run",
    reason: workspaceRoute.nextAction,
    evidence: [
      `exact-hunk-apply:file:${options.targetPath}:blocked`,
      `exact-hunk-apply:hunk-count:${hunkIds.length}`,
      "exact-hunk-apply:no-success-claim",
      "exact-hunk-apply:raw-content-excluded",
      ...hunkIds.map((hunkId) => `exact-hunk-apply:hunk:${hunkId}:blocked`),
      ...workspaceRoute.evidence,
    ],
  };
}

export function buildMultiHunkApplyPatch(input: {
  readonly targetPath: string;
  readonly hunks: readonly {
    readonly mapping: FencedEditMapping;
  }[];
}): string {
  return [
    "*** Begin Patch",
    `*** Update File: ${input.targetPath}`,
    ...input.hunks.flatMap((hunk) => [
      "@@",
      ...splitExactHunkLines(hunk.mapping.oldText).map((line) => `-${line}`),
      ...splitExactHunkLines(hunk.mapping.newText).map((line) => `+${line}`),
    ]),
    "*** End Patch",
  ].join("\n");
}
