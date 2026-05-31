import { mapTerminalToOrchestrationResult } from "../core/query/mapping/mapper.js";
import type { QueryRuntimeState } from "../core/query/runtime/state.js";
import type { QueryTerminal } from "../core/query/runtime/transitions.js";
import { createEmptyLifecycleIndex } from "../core/tools/toolResultLifecycle.js";
import type {
  CodingResultSummary,
  OrchestrationResult,
} from "./types.js";
import type { ProposalHunkSetRoute } from "./proposalHunkSetRoute.js";
import { projectExactHunkResultSummary } from "../edit/patch/result/hunk.js";

export function buildProposalHunkSetRouteResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: ProposalHunkSetRoute;
}): OrchestrationResult {
  const codingResult = buildCodingResult(input.route);
  return mapTerminalToOrchestrationResult(
    buildRuntimeState({ ...input, codingResult }),
    buildTerminalInput(input.route),
  );
}

function buildCodingResult(route: ProposalHunkSetRoute): CodingResultSummary {
  const success = route.status === "written";
  const partial = route.status === "partial-failure";
  const hunkSummary = projectExactHunkResultSummary(route);
  const failedFiles = route.failedFiles.map((file) => ({
    path: file.path,
    reason: file.reason,
  }));
  const unattemptedFiles = route.unattemptedFiles.map((file) => ({
    path: file.path,
    reason: file.reason,
  }));
  const evidence = [
    route.manifest.transcriptSummary,
    route.transcriptSummary,
    `proposal-hunk-set-result:state:${route.status}`,
    `proposal-hunk-set-result:transaction:${route.transactionId}`,
    ...hunkSummary.evidence,
    `proposal-hunk-set-result:hunk-count:${hunkSummary.hunkCount}`,
    `proposal-hunk-set-result:changed-hunk-count:${hunkSummary.changedHunkCount}`,
    `proposal-hunk-set-result:failed-hunk-count:${hunkSummary.failedHunkCount}`,
    `proposal-hunk-set-result:unattempted-hunk-count:${hunkSummary.unattemptedHunkCount}`,
    `proposal-hunk-set-result:verification:${route.verificationAggregate.overallStatus}`,
    `proposal-hunk-set-result:recovery:${route.recoveryWorkflow.status}`,
    success
      ? "proposal-hunk-set-result:confirmed-applied"
      : partial
        ? "proposal-hunk-set-result:partial-applied"
        : "proposal-hunk-set-result:no-write-or-stopped",
    "proposal-hunk-set-result:raw-content-excluded",
    ...route.evidence,
  ];
  return {
    taskKind: "edit-file",
    changedFiles: [...route.changedFiles],
    failedFiles,
    patches: route.fileResults.map((result) =>
      result.status === "written"
        ? {
            path: result.targetPath,
            operation: "replace",
            status: "applied",
          }
        : {
            path: result.targetPath,
            operation: "replace",
            status: "failed",
            failureCode: "write-failed",
            reason: result.reason ?? route.nextAction,
          },
    ),
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: route.recoveryWorkflow.eligibleRollbackTargets.map(
        (target) => target.targetPath,
      ),
      failedItems: route.recoveryWorkflow.ineligibleRollbackTargets.map(
        (target) => target.targetPath,
      ),
      notes: [
        "proposal hunk-set apply reused existing fenced edit lanes; no proposal writer was introduced.",
        route.recoveryWorkflow.recommendation,
      ],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: [
        route.manifest.transcriptSummary,
        route.transcriptSummary,
        `proposal-hunk-set changed=${route.changedFiles.join(", ") || "none"}`,
        `proposal-hunk-set failed=${failedFiles.map((file) => file.path).join(", ") || "none"}`,
        `proposal-hunk-set unattempted=${unattemptedFiles.map((file) => file.path).join(", ") || "none"}`,
        ...evidence,
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [...route.changedFiles],
      attemptedFiles: route.fileResults.map((result) => result.targetPath),
      changedFiles: [...route.changedFiles],
      unchangedAttemptedFiles: route.fileResults
        .filter((result) => result.status !== "written")
        .map((result) => result.targetPath),
    },
    taskSatisfaction: {
      verdict: success ? "satisfied" : partial ? "completed-with-caveats" : "insufficient-evidence",
      reasons: [route.nextAction],
      requiredEvidence: [
        "explicit proposal hunk-set confirmation",
        "all-hunk preflight before mutation",
        "per-target exact mapping",
        "deterministic hunk order",
        "one snapshot/write per file for multi-hunk targets",
        "workspace authority",
        "final stale-read",
        "snapshot/recovery",
        "verification aggregate",
      ],
      observedEvidence: [...evidence],
    },
    verifiedFiles: success ? [...route.changedFiles] : [],
    unverifiedFiles: success ? [] : failedFiles.length ? failedFiles : [{ path: "(proposal hunk-set)", reason: route.nextAction }],
    verification: success
      ? {
          status: "passed",
          reason: "Proposal hunk-set exact replacements completed and verified.",
          selectionScope: "focused",
          selectionSource: "auto-from-changes",
        }
      : {
          status:
            route.verificationAggregate.overallStatus === "blocked" ||
            route.verificationAggregate.overallStatus === "not-run"
              ? "blocked"
              : "failed",
          reason: route.nextAction,
          blockerKind: "unknown",
          nextAction: route.nextAction,
        },
    evidence,
    lastActionResultSeed: {
      actionKind: "edit-file",
      changedFiles: [...route.changedFiles],
      verifiedFiles: success ? [...route.changedFiles] : [],
      verification: success
        ? {
            status: "passed",
            reason: "Proposal hunk-set exact replacements completed and verified.",
          }
        : {
            status:
              route.verificationAggregate.overallStatus === "not-run"
                ? "blocked"
                : "failed",
            reason: route.nextAction,
            blockerKind: "unknown",
          },
      ...(success
        ? {}
        : {
            reason: route.nextAction,
            blockerKind: "unknown" as const,
            writerStarted: route.changedFiles.length > 0,
            writeEffect: route.changedFiles.length > 0 ? ("unverified" as const) : ("none" as const),
            requiresUserInspection: route.changedFiles.length > 0,
          }),
    },
    ...(success ? {} : { failureBoundary: `proposal-hunk-set-${route.status}` }),
  };
}

function buildRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: ProposalHunkSetRoute;
  readonly codingResult: CodingResultSummary;
}): QueryRuntimeState {
  return {
    config: {
      sessionId: input.sessionId,
      initialPrompt: input.prompt,
      maxTurns: 1,
      startingRole: "coder",
    },
    currentRole: "coder",
    turn: 1,
    pendingLifecycle: createEmptyLifecycleIndex(),
    sharedContext: {
      sessionId: input.sessionId,
      initialPrompt: input.prompt,
      notes: [
        `proposal hunk-set=${input.route.hunkSetId}`,
        `proposal hunk-set status=${input.route.status}`,
      ],
      handoffs: [],
    },
    transcript: [
      {
        role: "coder",
        content: buildOutput(input.route),
        codingResult: input.codingResult,
      },
    ],
    visitedTransitions: new Set<string>(),
  };
}

function buildTerminalInput(route: ProposalHunkSetRoute): QueryTerminal {
  if (route.status === "written") {
    return {
      action: "terminal",
      terminalReason: "completed",
      terminalClassification: "success",
    };
  }
  return {
    action: "terminal",
    terminalReason: "stopped_error",
    terminalClassification: route.terminalClassification,
    stopReason: route.nextAction,
  };
}

function buildOutput(route: ProposalHunkSetRoute): string {
  return [
    "Proposal hunk-set apply",
    `Proposal: ${route.proposalId}`,
    `Hunk set: ${route.hunkSetId}`,
    `Status: ${route.status}`,
    `Hunks: ${route.hunkCount}`,
    `Changed: ${route.changedFiles.join(", ") || "none"}`,
    `Failed: ${route.failedFiles.map((file) => file.path).join(", ") || "none"}`,
    `Unattempted: ${route.unattemptedFiles.map((file) => file.path).join(", ") || "none"}`,
    `Verification: ${route.verificationAggregate.overallStatus}`,
    `Recovery: ${route.recoveryWorkflow.status}; ${route.recoveryWorkflow.recommendation}`,
    "Raw content: excluded",
    `Next: ${route.nextAction}`,
  ].join("\n");
}
