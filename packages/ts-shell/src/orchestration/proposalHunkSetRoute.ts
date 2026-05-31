import type { SingleFileApplyPatchRequestedUserDecision } from "../edit/authority/approval/permission.js";
import type { WorkspaceWriteTargetAuthority } from "../edit/authority/workspace.js";
import type { RecoveryAuthorityStoreConfig } from "./patchRecovery/recoveryAuthorityStore.js";
import type { EditSnapshotStorageOptions } from "./editSnapshot.js";
import {
  runFencedEditReplacementRoute,
  type FencedEditReplacementRoute,
} from "./fencedEditRoute.js";
import {
  runExactHunkApplyRoute,
  type ExactHunkApplyRoute,
} from "./exactHunkApply.js";
import type { FencedEditMapping } from "./fencedEditPlanner.js";
import {
  buildProposalHunkSetPlan,
  type ProposalHunkSetPlan,
} from "./proposalHunkSetPlan.js";
import type { ProposalHunkSetManifest } from "./proposalHunkSet.js";
import {
  buildTargetSetEditExecutionJournalEntry,
  projectTargetSetEditJournalEvidence,
  type TargetSetEditJournalEntry,
} from "./targetSetEditJournal.js";
import {
  buildTargetSetEditTransaction,
  buildTargetSetEditTransactionId,
  type TargetSetEditTransaction,
} from "./targetSetEditTransaction.js";
import {
  aggregateTargetSetEditVerification,
  type TargetSetEditVerificationAggregate,
} from "./targetSetEditVerification.js";
import {
  buildTargetSetEditRecoveryWorkflow,
  type TargetSetEditRecoveryWorkflow,
} from "./targetSetEditRecoveryWorkflow.js";
import type { TargetSetEditPreflightPolicy } from "./targetSetEditPolicy.js";

export type ProposalHunkSetRouteStatus =
  | "written"
  | "preflight-stopped"
  | "partial-failure"
  | "failed";

export interface ProposalHunkSetFileResult {
  readonly targetPath: string;
  readonly hunkId: string;
  readonly hunkIds: readonly string[];
  readonly hunkCount: number;
  readonly status: "written" | "stopped" | "failed" | "not-run";
  readonly route?: FencedEditReplacementRoute;
  readonly exactRoute?: ExactHunkApplyRoute;
  readonly changedFiles: readonly string[];
  readonly recoveryReadiness: "rollback-ready" | "rollback-not-run";
  readonly reason?: string;
  readonly evidence: readonly string[];
}

export interface ProposalHunkSetRoute {
  readonly source: "proposal-hunk-set-route";
  readonly status: ProposalHunkSetRouteStatus;
  readonly proposalId: string;
  readonly hunkSetId: string;
  readonly transactionId: string;
  readonly manifest: ProposalHunkSetManifest;
  readonly plan: ProposalHunkSetPlan;
  readonly targetCount: number;
  readonly hunkCount: number;
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly { path: string; hunkId: string; hunkIds?: readonly string[]; reason: string }[];
  readonly unattemptedFiles: readonly { path: string; hunkId: string; hunkIds?: readonly string[]; reason: string }[];
  readonly fileResults: readonly ProposalHunkSetFileResult[];
  readonly journal: readonly TargetSetEditJournalEntry[];
  readonly transaction: TargetSetEditTransaction;
  readonly verificationAggregate: TargetSetEditVerificationAggregate;
  readonly recoveryWorkflow: TargetSetEditRecoveryWorkflow;
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly postWriteVerification: "passed" | "not-run" | "blocked" | "failed";
  readonly nextAction: string;
  readonly evidence: readonly string[];
  readonly transcriptSummary: string;
}

export interface ProposalHunkSetRouteOptions {
  readonly workspaceRoot: string;
  readonly manifest: ProposalHunkSetManifest;
  readonly mappingByHunkId: ReadonlyMap<string, FencedEditMapping>;
  readonly confirmed: boolean;
  readonly maxFiles?: number;
  readonly maxHunks?: number;
  readonly maxHunksPerFile?: number;
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

export async function runProposalHunkSetRoute(
  options: ProposalHunkSetRouteOptions,
): Promise<ProposalHunkSetRoute> {
  const transactionId = buildTargetSetEditTransactionId({
    manifestId: options.manifest.hunkSetId,
    confirmedTargetSet: options.manifest.selectedTargetPaths,
  });
  const plan = buildProposalHunkSetPlan({
    manifest: options.manifest,
    confirmed: options.confirmed,
    workspaceRoot: options.workspaceRoot,
    ...(options.maxFiles ? { maxFiles: options.maxFiles } : {}),
    ...(options.maxHunks ? { maxHunks: options.maxHunks } : {}),
    ...(options.maxHunksPerFile ? { maxHunksPerFile: options.maxHunksPerFile } : {}),
    readFile: options.readFile,
    validateWriteTarget: options.validateWriteTarget,
    mappingByHunkId: options.mappingByHunkId,
  });
  const preflightJournal = buildProposalHunkSetPreflightJournal({
    transactionId,
    plan,
  });
  const preflightPolicy = buildProposalHunkSetPreflightPolicy(plan);

  if (plan.status === "blocked") {
    const fileResults: ProposalHunkSetFileResult[] = [];
    const verificationAggregate = aggregateTargetSetEditVerification({
      fileResults,
      changedFiles: [],
    });
    const recoveryWorkflow = buildTargetSetEditRecoveryWorkflow({
      transactionId,
      manifestId: plan.hunkSetId,
      status: "preflight-stopped",
      fileResults,
    });
    const transaction = buildTargetSetEditTransaction({
      transactionId,
      manifestId: plan.hunkSetId,
      confirmedTargetSet: options.manifest.selectedTargetPaths,
      policy: preflightPolicy,
      changedFileCount: 0,
      failedFileCount: plan.targetPath ? 1 : 0,
      verification: verificationAggregate,
      recovery: recoveryWorkflow,
      journal: preflightJournal,
    });
    return buildRoute({
      status: "preflight-stopped",
      proposalId: options.manifest.sourceProposalId,
      hunkSetId: options.manifest.hunkSetId,
      transactionId,
      manifest: options.manifest,
      plan,
      targetCount: plan.targetCount,
      hunkCount: plan.hunkCount,
      changedFiles: [],
      failedFiles: plan.targetPath
        ? [{ path: plan.targetPath, hunkId: plan.hunkId ?? "(unknown)", reason: plan.reason }]
        : [],
      unattemptedFiles: [],
      fileResults,
      journal: preflightJournal,
      transaction,
      verificationAggregate,
      recoveryWorkflow,
      terminalClassification: "stopped",
      postWriteVerification: "not-run",
      nextAction: plan.nextAction,
      evidence: [
        ...plan.evidence,
        ...preflightPolicy.evidence,
        ...projectTargetSetEditJournalEvidence(preflightJournal),
        ...verificationAggregate.evidence,
        ...recoveryWorkflow.evidence,
        ...transaction.evidence,
        "proposal-hunk-set-route:status:preflight-stopped",
        "proposal-hunk-set-route:mutation:not-run",
        "proposal-hunk-set-route:no-writer-invoked",
        "proposal-hunk-set-route:no-provider-call",
        "proposal-hunk-set-route:raw-content-excluded",
      ],
    });
  }

  const fileResults: ProposalHunkSetFileResult[] = [];
  const changedFiles: string[] = [];
  const failedFiles: Array<{ path: string; hunkId: string; hunkIds?: readonly string[]; reason: string }> = [];
  const unattemptedFiles: Array<{ path: string; hunkId: string; hunkIds?: readonly string[]; reason: string }> = [];
  const journal: TargetSetEditJournalEntry[] = [...preflightJournal];

  for (const target of plan.targets) {
    journal.push(
      buildTargetSetEditExecutionJournalEntry({
        transactionId,
        targetPath: target.targetPath,
        step: "stale-read-checked",
        status: "projected",
        evidence: target.hunkIds.map((hunkId) => `proposal-hunk-set-journal:hunk:${hunkId}:stale-read-checked`),
      }),
      buildTargetSetEditExecutionJournalEntry({
        transactionId,
        targetPath: target.targetPath,
        step: "snapshot-captured",
        status: "projected",
        evidence: target.hunkIds.map((hunkId) => `proposal-hunk-set-journal:hunk:${hunkId}:snapshot-captured`),
      }),
      buildTargetSetEditExecutionJournalEntry({
        transactionId,
        targetPath: target.targetPath,
        step: "write-attempted",
        status: "projected",
        evidence: target.hunkIds.map((hunkId) => `proposal-hunk-set-journal:hunk:${hunkId}:write-attempted`),
      }),
    );
    const route =
      target.hunkMappings.length === 1
        ? await runFencedEditReplacementRoute({
            workspaceRoot: options.workspaceRoot,
            targetPath: target.targetPath,
            mapping: target.mapping,
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
          })
        : await runExactHunkApplyRoute({
            workspaceRoot: options.workspaceRoot,
            targetPath: target.targetPath,
            hunks: target.hunkMappings,
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
      journal.push(
        buildTargetSetEditExecutionJournalEntry({
          transactionId,
          targetPath: target.targetPath,
          step: "write-succeeded",
          status: "passed",
          evidence: target.hunkIds.map((hunkId) => `proposal-hunk-set-journal:hunk:${hunkId}:write-succeeded`),
        }),
        buildTargetSetEditExecutionJournalEntry({
          transactionId,
          targetPath: target.targetPath,
          step: "verification-projected",
          status: "passed",
          evidence: target.hunkIds.map((hunkId) => `proposal-hunk-set-journal:hunk:${hunkId}:verification-projected`),
        }),
        buildTargetSetEditExecutionJournalEntry({
          transactionId,
          targetPath: target.targetPath,
          step: "recovery-readiness-projected",
          status: "passed",
          evidence: target.hunkIds.map((hunkId) => `proposal-hunk-set-journal:hunk:${hunkId}:recovery-readiness-projected`),
        }),
      );
      fileResults.push({
        targetPath: target.targetPath,
        hunkId: target.hunkId,
        hunkIds: target.hunkIds,
        hunkCount: target.hunkCount,
        status: "written",
        ...(target.hunkMappings.length === 1
          ? { route: route as FencedEditReplacementRoute }
          : { exactRoute: route as ExactHunkApplyRoute }),
        changedFiles: route.changedFiles,
        recoveryReadiness: "rollback-ready",
        evidence: [
          `proposal-hunk-set-route:file:${target.targetPath}:written`,
          `proposal-hunk-set-route:file:${target.targetPath}:hunk-count:${target.hunkCount}`,
          ...target.hunkIds.map((hunkId) => `proposal-hunk-set-route:hunk:${hunkId}:written`),
          "proposal-hunk-set-route:rollback-ready",
          ...route.evidence,
        ],
      });
      continue;
    }

    const status =
      "terminalClassification" in route && route.terminalClassification === "error"
        ? "failed"
        : "stopped";
    const reason = "nextAction" in route ? route.nextAction : route.reason;
    journal.push(
      buildTargetSetEditExecutionJournalEntry({
        transactionId,
        targetPath: target.targetPath,
        step: "write-failed",
        status: "failed",
        reason,
        evidence: target.hunkIds.map((hunkId) => `proposal-hunk-set-journal:hunk:${hunkId}:write-failed`),
      }),
      buildTargetSetEditExecutionJournalEntry({
        transactionId,
        targetPath: target.targetPath,
        step: "verification-projected",
        status: "failed",
        reason,
        evidence: target.hunkIds.map((hunkId) => `proposal-hunk-set-journal:hunk:${hunkId}:verification-projected`),
      }),
      buildTargetSetEditExecutionJournalEntry({
        transactionId,
        targetPath: target.targetPath,
        step: "recovery-readiness-projected",
        status:
          route.snapshotReceipt?.status === "snapshot-created"
            ? "passed"
            : "not-run",
        reason,
        evidence: target.hunkIds.map((hunkId) => `proposal-hunk-set-journal:hunk:${hunkId}:recovery-readiness-projected`),
      }),
    );
    failedFiles.push({ path: target.targetPath, hunkId: target.hunkId, hunkIds: target.hunkIds, reason });
    fileResults.push({
      targetPath: target.targetPath,
      hunkId: target.hunkId,
      hunkIds: target.hunkIds,
      hunkCount: target.hunkCount,
      status,
      ...(target.hunkMappings.length === 1
        ? { route: route as FencedEditReplacementRoute }
        : { exactRoute: route as ExactHunkApplyRoute }),
      changedFiles: [],
      recoveryReadiness:
        route.snapshotReceipt?.status === "snapshot-created"
          ? "rollback-ready"
          : "rollback-not-run",
      reason,
      evidence: [
        `proposal-hunk-set-route:file:${target.targetPath}:${status}`,
        `proposal-hunk-set-route:file:${target.targetPath}:hunk-count:${target.hunkCount}`,
        ...target.hunkIds.map((hunkId) => `proposal-hunk-set-route:hunk:${hunkId}:${status}`),
        route.snapshotReceipt?.status === "snapshot-created"
          ? "proposal-hunk-set-route:rollback-ready"
          : "proposal-hunk-set-route:rollback-not-run",
        ...route.evidence,
      ],
    });
    break;
  }

  for (const target of plan.targets.slice(fileResults.length)) {
    const reason = "Not run after earlier proposal hunk-set failure.";
    unattemptedFiles.push({ path: target.targetPath, hunkId: target.hunkId, hunkIds: target.hunkIds, reason });
    fileResults.push({
      targetPath: target.targetPath,
      hunkId: target.hunkId,
      hunkIds: target.hunkIds,
      hunkCount: target.hunkCount,
      status: "not-run",
      changedFiles: [],
      recoveryReadiness: "rollback-not-run",
      reason,
      evidence: [
        `proposal-hunk-set-route:file:${target.targetPath}:not-run`,
        `proposal-hunk-set-route:file:${target.targetPath}:hunk-count:${target.hunkCount}`,
        ...target.hunkIds.map((hunkId) => `proposal-hunk-set-route:hunk:${hunkId}:not-run`),
        "proposal-hunk-set-route:rollback-not-run",
      ],
    });
  }

  const status = classifyRouteStatus({ changedFiles, failedFiles });
  const verificationAggregate = aggregateTargetSetEditVerification({
    fileResults,
    changedFiles,
  });
  const recoveryWorkflow = buildTargetSetEditRecoveryWorkflow({
    transactionId,
    manifestId: plan.hunkSetId,
    status,
    fileResults,
  });
  const transaction = buildTargetSetEditTransaction({
    transactionId,
    manifestId: plan.hunkSetId,
    confirmedTargetSet: options.manifest.selectedTargetPaths,
    policy: preflightPolicy,
    changedFileCount: changedFiles.length,
    failedFileCount: failedFiles.length,
    verification: verificationAggregate,
    recovery: recoveryWorkflow,
    journal,
  });
  return buildRoute({
    status,
    proposalId: options.manifest.sourceProposalId,
    hunkSetId: options.manifest.hunkSetId,
    transactionId,
    manifest: options.manifest,
    plan,
    targetCount: plan.targetCount,
    hunkCount: plan.hunkCount,
    changedFiles,
    failedFiles,
    unattemptedFiles,
    fileResults,
    journal,
    transaction,
    verificationAggregate,
    recoveryWorkflow,
    terminalClassification: status === "written" ? "success" : "error",
    postWriteVerification:
      verificationAggregate.overallStatus === "passed"
        ? "passed"
        : verificationAggregate.overallStatus === "not-run"
          ? "not-run"
          : "failed",
    nextAction:
      status === "written"
        ? "Proposal hunk-set exact replacements completed through exact hunk-set apply."
        : recoveryWorkflow.doNext,
    evidence: [
      ...options.manifest.evidence,
      ...plan.evidence,
      ...preflightPolicy.evidence,
      ...projectTargetSetEditJournalEvidence(journal),
      ...verificationAggregate.evidence,
      ...recoveryWorkflow.evidence,
      ...transaction.evidence,
      ...fileResults.flatMap((result) => result.evidence),
      `proposal-hunk-set-route:status:${status}`,
      "proposal-hunk-set-route:reuse-existing-fenced-lane",
      "proposal-hunk-set-route:multi-hunk-exact-apply",
      "proposal-hunk-set-route:transaction-route",
      "proposal-hunk-set-route:no-new-writer",
      "proposal-hunk-set-route:no-provider-call",
      "proposal-hunk-set-route:raw-content-excluded",
    ],
  });
}

function buildProposalHunkSetPreflightJournal(input: {
  readonly transactionId: string;
  readonly plan: ProposalHunkSetPlan;
}): readonly TargetSetEditJournalEntry[] {
  const entries: TargetSetEditJournalEntry[] = [
    {
      transactionId: input.transactionId,
      step: "preflight-started",
      status: "projected",
      evidence: [
        "proposal-hunk-set-journal:preflight-started",
        "target-set-edit-journal:preflight-started",
        "proposal-hunk-set-journal:raw-content-excluded",
      ],
    },
  ];
  if (input.plan.status === "blocked") {
    entries.push({
      transactionId: input.transactionId,
      step: "preflight-failed",
      ...(input.plan.targetPath ? { targetPath: input.plan.targetPath } : {}),
      status: "failed",
      reason: input.plan.reason,
      evidence: [
        `proposal-hunk-set-journal:preflight-failed:${input.plan.blocker}`,
        `target-set-edit-journal:preflight-failed:${input.plan.blocker}`,
        "proposal-hunk-set-journal:mutation:not-run",
        "proposal-hunk-set-journal:raw-content-excluded",
      ],
    });
    return entries;
  }
  for (const target of input.plan.targets) {
    entries.push(
      {
        transactionId: input.transactionId,
        step: "authority-checked",
        targetPath: target.targetPath,
        status: "passed",
        evidence: [
          `proposal-hunk-set-journal:authority-checked:${target.targetPath}`,
          `target-set-edit-journal:authority-checked:${target.targetPath}`,
          `proposal-hunk-set-journal:hunk-count:${target.hunkCount}`,
          ...target.hunkIds.map((hunkId) => `proposal-hunk-set-journal:hunk:${hunkId}:authority-checked`),
        ],
      },
      {
        transactionId: input.transactionId,
        step: "match-count-checked",
        targetPath: target.targetPath,
        status: "passed",
        evidence: [
          `proposal-hunk-set-journal:match-count-checked:${target.targetPath}`,
          `target-set-edit-journal:match-count-checked:${target.targetPath}`,
          ...target.hunkIds.map((hunkId) => `proposal-hunk-set-journal:hunk:${hunkId}:match-count-checked`),
        ],
      },
    );
  }
  entries.push({
    transactionId: input.transactionId,
    step: "preflight-passed",
    status: "passed",
    evidence: [
      "proposal-hunk-set-journal:preflight-passed",
      "proposal-hunk-set-journal:all-hunks-before-first-write",
      "target-set-edit-journal:preflight-passed",
      "target-set-edit-journal:all-targets-before-first-write",
      "proposal-hunk-set-journal:raw-content-excluded",
    ],
  });
  return entries;
}

function buildProposalHunkSetPreflightPolicy(
  plan: ProposalHunkSetPlan,
): TargetSetEditPreflightPolicy {
  const baseEvidence = [
    "proposal-hunk-set-policy:all-hunks-preflight-before-first-mutation",
    "target-set-edit-policy:all-target-preflight-before-first-mutation",
    "target-set-edit-policy:no-write-atomicity-claim",
    "target-set-edit-policy:no-automatic-rollback",
    "proposal-hunk-set-policy:exact-per-target-mapping-only",
    "proposal-hunk-set-policy:multi-hunk-per-file-exact",
    "proposal-hunk-set-policy:raw-content-excluded",
  ];
  if (plan.status === "blocked") {
    return {
      status: "stopped",
      mutationAllowed: false,
      reason: plan.reason,
      blocker: plan.blocker,
      maxFileGuard: plan.blocker === "over-max-files" ? "over-limit" : "not-evaluated",
      atomicity: "all-target-preflight-before-first-mutation",
      writeAtomicityClaim: false,
      evidence: [
        ...baseEvidence,
        `proposal-hunk-set-policy:blocker:${plan.blocker}`,
        "target-set-edit-policy:mutation:not-run",
        "proposal-hunk-set-policy:mutation:not-run",
      ],
    };
  }
  return {
    status: "passed",
    mutationAllowed: true,
    maxFileGuard: "within-limit",
    atomicity: "all-target-preflight-before-first-mutation",
    writeAtomicityClaim: false,
    evidence: [
      ...baseEvidence,
      `proposal-hunk-set-policy:target-count:${plan.targetCount}`,
      `proposal-hunk-set-policy:hunk-count:${plan.hunkCount}`,
      `proposal-hunk-set-policy:max-hunks-per-file:${plan.maxHunksPerFile}`,
      "target-set-edit-policy:preflight-passed",
      "proposal-hunk-set-policy:preflight-passed",
    ],
  };
}

function classifyRouteStatus(input: {
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly unknown[];
}): ProposalHunkSetRouteStatus {
  if (input.failedFiles.length === 0) {
    return "written";
  }
  return input.changedFiles.length > 0 ? "partial-failure" : "failed";
}

function buildRoute(input: Omit<ProposalHunkSetRoute, "source" | "transcriptSummary">): ProposalHunkSetRoute {
  return {
    source: "proposal-hunk-set-route",
    ...input,
    transcriptSummary: [
      `proposal-hunk-set-apply proposal=${input.proposalId}`,
      `hunkSet=${input.hunkSetId}`,
      `status=${input.status}`,
      `targets=${input.manifest.selectedTargetPaths.join(", ") || "(none)"}`,
      `hunks=${input.manifest.selectedHunks.map((hunk) => hunk.hunkId).join(", ") || "(none)"}`,
      `hunkCount=${input.hunkCount}`,
      `changed=${input.changedFiles.join(", ") || "none"}`,
      `failed=${input.failedFiles.map((file) => file.path).join(", ") || "none"}`,
      `unattempted=${input.unattemptedFiles.map((file) => file.path).join(", ") || "none"}`,
      `verification=${input.verificationAggregate.overallStatus}`,
      `recovery=${input.recoveryWorkflow.status}`,
      "raw-content-excluded",
    ].join("; "),
  };
}
