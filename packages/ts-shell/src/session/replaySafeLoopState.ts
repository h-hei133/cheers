import type { LoopContextRebuildInput } from "../context/rebuildInput.js";
import type { SessionContextRebuildProjection } from "../context/sessionContextRebuildProjection.js";
import type { RuntimeEvidenceSavePoint } from "../evidence/runtimeSavePoint.js";
import type { RepairApplyObservation, RepairProposalObservation, RepairRequiredHandoff } from "../repair/loopBoundary.js";
import type { NextTurnBundleProjection } from "../turn/nextTurnBundle.js";
import type { ToolResultMessageBatch } from "../turn/toolResultMessage.js";
import type { VerificationLoopIntent, VerificationResultObservation } from "../verification/loopBoundary.js";
import type { ContinuationReadinessProjection } from "./continuationReadiness.js";
import type { SessionTreeProjection } from "./sessionTreeProjection.js";

export interface ReplaySafeLoopStateSummary {
  readonly summaryId: string;
  readonly sourceSessionId: string;
  readonly activePathId: string;
  readonly latestSavePointId?: string;
  readonly nextTurnBundleId?: string;
  readonly steeringMessageIds: readonly string[];
  readonly followUpMessageIds: readonly string[];
  readonly toolResultMessageIds: readonly string[];
  readonly verificationHandoffIds: readonly string[];
  readonly repairHandoffIds: readonly string[];
  readonly contextRebuildInputId?: string;
  readonly contextRebuildProjectionId: string;
  readonly continuationReadinessId: string;
  readonly terminalResultFacts: {
    readonly status?: string;
    readonly terminalClassification?: string;
    readonly terminalReason?: string;
    readonly terminalSuccessClaim: false;
  };
  readonly notProvenClaims: readonly string[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly terminalSuccessClaim: false;
}

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider.env",
  "auth-headers",
  "raw-provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "transcript-dumps",
  "unsafe-file-contents",
] as const;

export function summarizeReplaySafeLoopState(input: {
  readonly sessionProjection: SessionTreeProjection;
  readonly contextRebuildProjection: SessionContextRebuildProjection;
  readonly continuationReadiness: ContinuationReadinessProjection;
  readonly rebuildInput?: LoopContextRebuildInput;
  readonly savePoint?: RuntimeEvidenceSavePoint;
  readonly nextTurnBundle?: NextTurnBundleProjection;
  readonly toolResultMessages?: ToolResultMessageBatch;
  readonly verificationIntents?: readonly VerificationLoopIntent[];
  readonly verificationResults?: readonly VerificationResultObservation[];
  readonly repairRequiredHandoffs?: readonly RepairRequiredHandoff[];
  readonly repairProposals?: readonly RepairProposalObservation[];
  readonly repairApplyObservations?: readonly RepairApplyObservation[];
  readonly terminalResultFacts?: {
    readonly status?: string;
    readonly terminalClassification?: string;
    readonly terminalReason?: string;
  };
}): ReplaySafeLoopStateSummary {
  const verificationHandoffIds = [
    ...(input.verificationIntents ?? []).map((item) => item.intentId),
    ...(input.verificationResults ?? []).map((item) => item.verificationId),
  ];
  const repairHandoffIds = [
    ...(input.repairRequiredHandoffs ?? []).map((item) => item.handoffId),
    ...(input.repairProposals ?? []).map((item) => item.proposalId),
    ...(input.repairApplyObservations ?? []).map((item) => item.repairApplyId),
  ];
  return deepFreeze({
    summaryId: `replay-safe-loop-state:${input.sessionProjection.sessionIdentity}:${input.sessionProjection.activeLeafId}`,
    sourceSessionId: input.sessionProjection.sessionIdentity,
    activePathId: `${input.sessionProjection.sessionIdentity}:active-path:${input.sessionProjection.activeLeafId}`,
    ...(input.savePoint ? { latestSavePointId: input.savePoint.id } : {}),
    ...(input.nextTurnBundle ? { nextTurnBundleId: input.nextTurnBundle.bundleId } : {}),
    steeringMessageIds: input.nextTurnBundle?.steeringMessageIds ?? [],
    followUpMessageIds: input.nextTurnBundle?.followUpMessageIds ?? [],
    toolResultMessageIds: input.toolResultMessages?.messages.map((message) => message.messageId) ?? [],
    verificationHandoffIds,
    repairHandoffIds,
    ...(input.rebuildInput ? { contextRebuildInputId: input.rebuildInput.rebuildInputId } : {}),
    contextRebuildProjectionId: `${input.contextRebuildProjection.rebuildSource.sessionIdentity}:context-rebuild:${input.contextRebuildProjection.rebuildSource.activeLeafId}`,
    continuationReadinessId: input.continuationReadiness.readinessId,
    terminalResultFacts: {
      ...input.terminalResultFacts,
      terminalSuccessClaim: false,
    },
    notProvenClaims: [
      "terminal-success",
      "task-success",
      "verification-success",
      "repair-success",
      "replay-safe-summary-is-not-success",
      "context-completeness",
      ...input.sessionProjection.terminal.notProvenClaims,
      ...input.contextRebuildProjection.notProvenClaims,
      ...input.continuationReadiness.notProvenClaims,
    ],
    redaction: {
      status:
        input.contextRebuildProjection.redaction.status === "redacted" ||
          input.continuationReadiness.redaction.status === "redacted" ||
          input.rebuildInput?.redaction.status === "redacted"
          ? "redacted"
          : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    terminalSuccessClaim: false,
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
