import { mapTerminalToOrchestrationResult } from "../../../core/query/mapping/mapper.js";
import type { QueryRuntimeState } from "../../../core/query/runtime/state.js";
import type { QueryTerminal } from "../../../core/query/runtime/transitions.js";
import { createEmptyLifecycleIndex } from "../../../core/tools/toolResultLifecycle.js";
import type {
  CodingPatchFailureCode,
  CodingResultSummary,
  OrchestrationResult,
} from "../../../orchestration/types.js";
import type { ProductionRoute } from "../../../orchestration/patchResult/productionRoute.js";

export type ProductionRouteRuntimeProjectionStatus =
  | "write-success"
  | "blocked";

export interface ProductionRouteRuntimeProjection {
  readonly source: "single-file-apply-patch-production-route-runtime-projection";
  readonly status: ProductionRouteRuntimeProjectionStatus;
  readonly routeStatus: ProductionRoute["status"];
  readonly terminalStatus: OrchestrationResult["status"];
  readonly terminalClassification: OrchestrationResult["terminalClassification"];
  readonly terminalReason: OrchestrationResult["terminalReason"];
  readonly stopReason?: string;
  readonly changedFiles: readonly string[];
  readonly writeIntents: readonly string[];
  readonly productionWriterInvoked: boolean;
  readonly productionWriterTarget: ProductionRoute["productionWriterTarget"];
  readonly realRepositoryWrite: false;
  readonly appliedPatchRecord: false;
  readonly resultMapperOutput: OrchestrationResult;
  readonly sessionDisplay: {
    readonly displayStatus: ProductionRouteRuntimeProjectionStatus;
    readonly title: string;
    readonly summaryLines: readonly string[];
    readonly changedDisplay: readonly string[];
    readonly writeSuccessDisplayed: boolean;
    readonly mutationSuccessDisplayed: boolean;
    readonly stoppedDisplayed: boolean;
  };
  readonly safetyProof: {
    readonly explicitRouteOptInRequired: true;
    readonly defaultProductionRejectionUnchanged: boolean;
    readonly isolatedWorkspaceOnly: true;
    readonly successAfterVerifiedWrite: boolean;
    readonly blockedHasNoSuccessLeak: boolean;
    readonly realRepositoryWriteFalse: true;
    readonly noAppliedPatchRecord: true;
  };
  readonly evidence: readonly string[];
}

export function buildProductionRouteRuntimeProjection(input: {
  readonly productionRoute: ProductionRoute;
}): ProductionRouteRuntimeProjection {
  const route = input.productionRoute;
  const codingResult = buildCodingResult(route);
  const mapped = mapTerminalToOrchestrationResult(
    buildRuntimeState(route, codingResult),
    buildTerminalInput(route),
  );
  const status: ProductionRouteRuntimeProjectionStatus =
    route.status === "written" ? "write-success" : "blocked";
  const successAfterVerifiedWrite =
    route.status === "written" &&
    route.terminalSuccessAllowed === true &&
    route.writeLane.verificationStatus === "passed" &&
    mapped.terminalClassification === "success";
  const blockedHasNoSuccessLeak =
    route.status === "blocked" &&
    mapped.terminalClassification !== "success" &&
    route.productionWriterInvoked === false &&
    route.changedFiles.length === 0 &&
    route.writeIntents.length === 0;

  if (route.status === "written" && !successAfterVerifiedWrite) {
    throw new Error(
      "production route runtime projection requires success only after verified write",
    );
  }
  if (route.status === "blocked" && !blockedHasNoSuccessLeak) {
    throw new Error(
      "production route runtime projection requires blocked routes to remain non-success",
    );
  }

  return {
    source: "single-file-apply-patch-production-route-runtime-projection",
    status,
    routeStatus: route.status,
    terminalStatus: mapped.status,
    terminalClassification: mapped.terminalClassification,
    terminalReason: mapped.terminalReason,
    ...(mapped.stopReason ? { stopReason: mapped.stopReason } : {}),
    changedFiles: [...route.changedFiles],
    writeIntents: [...route.writeIntents],
    productionWriterInvoked: route.productionWriterInvoked,
    productionWriterTarget: route.productionWriterTarget,
    realRepositoryWrite: false,
    appliedPatchRecord: false,
    resultMapperOutput: mapped,
    sessionDisplay: buildSessionDisplay({
      status,
      route,
      mapped,
    }),
    safetyProof: {
      explicitRouteOptInRequired: true,
      defaultProductionRejectionUnchanged:
        route.routeGate.defaultProductionRejectionUnchanged,
      isolatedWorkspaceOnly: true,
      successAfterVerifiedWrite,
      blockedHasNoSuccessLeak,
      realRepositoryWriteFalse: true,
      noAppliedPatchRecord: true,
    },
    evidence: [
      ...route.evidence,
      "apply-patch-production-route-runtime-projection:resultmapper-consumed",
      `apply-patch-production-route-runtime-projection:status:${status}`,
      "apply-patch-production-route-runtime-projection:session-display-built",
      ...(successAfterVerifiedWrite
        ? [
            "apply-patch-production-route-runtime-projection:success-after-verified-write",
          ]
        : []),
      ...(blockedHasNoSuccessLeak
        ? [
            "apply-patch-production-route-runtime-projection:blocked-no-success-leak",
          ]
        : []),
      "apply-patch-production-route-runtime-projection:real-repository-write-false",
      "apply-patch-production-route-runtime-projection:no-applied-patch-record",
      "apply-patch-production-route-runtime-projection:default-production-rejection-unchanged",
    ],
  };
}

function buildCodingResult(route: ProductionRoute): CodingResultSummary {
  const target = route.changedFiles[0] ?? route.writeIntents[0];
  if (route.status === "written") {
    return {
      taskKind: "edit-file",
      changedFiles: [...route.changedFiles],
      failedFiles: [],
      repair: emptyRepair(),
      continuation: {
        status: "first-pass-success",
        attempts: 0,
        evidence: [
          "apply-patch-production-route-runtime-projection:no-continuation",
        ],
      },
      changeSet: {
        gitAware: false,
        preExistingDirtyFiles: [],
        postRunDirtyFiles: [...route.changedFiles],
        attemptedFiles: [...route.writeIntents],
        changedFiles: [...route.changedFiles],
        unchangedAttemptedFiles: [],
      },
      taskSatisfaction: {
        verdict: "satisfied",
        reasons: [],
        requiredEvidence: [
          "single-file Update File patch writes exactly one approved target",
          "final stale-read passes immediately before writer",
          "terminal success appears only after verified write",
        ],
        observedEvidence: [...route.evidence],
      },
      verifiedFiles: [...route.changedFiles],
      unverifiedFiles: [],
      verification: {
        status: "passed",
        reason: "Guarded production route verified one isolated workspace write.",
        selectionScope: "focused",
        selectionSource: "auto-from-changes",
      },
      evidence: [
        ...route.evidence,
        "apply-patch-production-route-runtime-projection:coding-result-success",
      ],
      lastActionResultSeed: {
        actionKind: "edit-file",
        ...(target ? { target } : {}),
        changedFiles: [...route.changedFiles],
        verifiedFiles: [...route.changedFiles],
        verification: {
          status: "passed",
          reason:
            "Guarded production route verified one isolated workspace write.",
        },
      },
      provenance: {
        approvalDecisions: [
          {
            kind: "approved",
            source: "tool-result-metadata",
            legacyOutcome: "approved",
            toolName: "apply_patch",
            taskId: "single-file-apply-patch-production-route",
          },
        ],
        toolExecutions: [
          {
            kind: "executed-succeeded",
            source: "tool-runtime",
            legacySuccess: true,
            toolName: "apply_patch",
            taskId: "single-file-apply-patch-production-route",
          },
        ],
      },
    };
  }

  const reason = route.nextAction;
  const attemptedFiles = [...route.writeIntents];
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [
      {
        path: target ?? "(apply_patch)",
        reason,
      },
    ],
    patches: [
      {
        path: target ?? "(apply_patch)",
        operation: "replace",
        status: "failed",
        failureCode: failureCodeForBlockedRoute(route),
        reason,
      },
    ],
    repair: emptyRepair(),
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: [
        "apply-patch-production-route-runtime-projection:no-continuation",
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles,
      changedFiles: [],
      unchangedAttemptedFiles: attemptedFiles,
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: [reason],
      requiredEvidence: [
        "blocked guarded route must not display write success",
        "blocked guarded route must not report changed files",
      ],
      observedEvidence: [...route.evidence],
    },
    verifiedFiles: [],
    unverifiedFiles: attemptedFiles.map((path) => ({
      path,
      reason,
    })),
    verification: {
      status: "blocked",
      reason,
      blockerKind: "unknown",
      nextAction: route.nextAction,
    },
    evidence: [
      ...route.evidence,
      ...actionableBlockerEvidence(route),
      "apply-patch-production-route-runtime-projection:coding-result-blocked",
      "apply-patch-production-route-runtime-projection:changed-files-empty",
      "apply-patch-production-route-runtime-projection:no-write-success",
    ],
    lastActionResultSeed: {
      actionKind: "edit-file",
      ...(target ? { target } : {}),
      changedFiles: [],
      verifiedFiles: [],
      verification: {
        status: "blocked",
        reason,
        blockerKind: "unknown",
      },
      reason,
      blockerKind: "unknown",
    },
    failureBoundary: `single-file-apply-patch-production-route-${route.blocker}`,
  };
}

function buildRuntimeState(
  route: ProductionRoute,
  codingResult: CodingResultSummary,
): QueryRuntimeState {
  const initialPrompt = "single-file apply_patch production route projection";
  return {
    config: {
      sessionId: "single-file-apply-patch-production-route-projection",
      initialPrompt,
      maxTurns: 1,
      startingRole: "coder",
    },
    currentRole: "coder",
    turn: 1,
    pendingLifecycle: createEmptyLifecycleIndex(),
    sharedContext: {
      sessionId: "single-file-apply-patch-production-route-projection",
      initialPrompt,
      notes: [
        "production route runtime projection consumes route output, not raw provider auth or base content.",
      ],
      handoffs: [],
    },
    transcript: [
      {
        role: "coder",
        content: route.status === "written" ? route.nextAction : route.doNext,
        codingResult,
      },
    ],
    visitedTransitions: new Set<string>(),
  };
}

function buildTerminalInput(route: ProductionRoute): QueryTerminal {
  if (route.status === "written") {
    return {
      action: "terminal",
      terminalReason: "completed",
      terminalClassification: "success",
    };
  }
  return {
    action: "terminal",
    terminalReason: "completed",
    terminalClassification: "success",
  };
}

function buildSessionDisplay(input: {
  readonly status: ProductionRouteRuntimeProjectionStatus;
  readonly route: ProductionRoute;
  readonly mapped: OrchestrationResult;
}): ProductionRouteRuntimeProjection["sessionDisplay"] {
  if (input.status === "write-success") {
    return {
      displayStatus: "write-success",
      title: "apply_patch write succeeded",
      summaryLines: [
        "Write verified after final stale-read.",
        `Changed: ${input.route.changedFiles.join(", ")}`,
        `Writer: ${input.route.productionWriterTarget}`,
        "Repository write: false",
      ],
      changedDisplay: [...input.route.changedFiles],
      writeSuccessDisplayed: true,
      mutationSuccessDisplayed: true,
      stoppedDisplayed: false,
    };
  }

  return {
    displayStatus: "blocked",
    title: "apply_patch blocked before write",
    summaryLines: [
      "Blocked before any write.",
      "Changed: none",
      `Reason: ${input.mapped.stopReason ?? input.route.nextAction}`,
      `Next: ${input.route.nextAction}`,
    ],
    changedDisplay: [],
    writeSuccessDisplayed: false,
    mutationSuccessDisplayed: false,
    stoppedDisplayed: true,
  };
}

function emptyRepair(): CodingResultSummary["repair"] {
  return {
    status: "not-needed",
    attempts: 0,
    recoveredItems: [],
    failedItems: [],
    notes: [
      "production route projection only; no repair was attempted in this lane.",
    ],
  };
}

function failureCodeForBlockedRoute(route: Extract<ProductionRoute, { status: "blocked" }>): CodingPatchFailureCode {
  if (route.writeLane?.blocker === "final-stale-read") {
    return "stale-read";
  }
  return "patch-generation-failed";
}

function actionableBlockerEvidence(
  route: Extract<ProductionRoute, { status: "blocked" }>,
): readonly string[] {
  if (route.writeLane?.blocker === "final-stale-read") {
    return ["actionable-blocker-kind:stale-read"];
  }
  if (
    route.routeGate.blocker === "unsupported-operation" ||
    route.routeGate.blocker === "explicit-route-opt-in-missing"
  ) {
    return ["actionable-blocker-kind:patch-generation-failed"];
  }
  return [];
}
