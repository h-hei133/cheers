import type { QueryEvent } from "../core/query/runtime/events.js";
import {
  continuationSafetyForRuntimeState,
  projectQueryRuntimeTaskStateFromResult,
} from "../core/query/runtime/taskState.js";
import { applyCompactRetentionPlan } from "./continuation/retentionPlanner.js";
import { decodeApprovalMemory, decodeApprovalMemoryHistory } from "./approval/memoryCodec.js";
import { deriveStoppedSessionContinuitySurface } from "./continuation/stoppedSessionContinuity.js";
import {
  buildActionHandoffSummary,
  buildSeedInfluenceHandoffSummary,
  buildSuccessHandoffDiagnostic,
} from "./recovery/resumeContextBuilder.js";
import { projectCompactRetentionPlanInput } from "./sessionCompactProjection.js";
import type { SeedInfluenceDiagnostic } from "./sessionContinuityTypes.js";
import type { ContinuitySource } from "./continuation/branch.js";

export function applySessionCompactRetention(input: {
  readonly workingMemory: unknown;
  readonly event: QueryEvent;
  readonly turnThreshold: number;
  readonly historyLimit: number;
  readonly now: string;
  readonly seedInfluence?: SeedInfluenceDiagnostic;
  readonly source?: ContinuitySource;
}): unknown {
  const queryCompleted =
    input.event.type === "query.completed" ? input.event : undefined;
  const approvalAudit = decodeApprovalMemory(input.workingMemory);
  const approvalAuditHistory = decodeApprovalMemoryHistory(
    input.workingMemory,
    { historyLimit: input.historyLimit },
  );
  const actionHandoffSummary = buildActionHandoffSummary(
    queryCompleted?.result.codingResult?.lastActionResultSeed,
  );
  const stoppedSessionContinuity = deriveStoppedSessionContinuitySurface(
    queryCompleted?.result.codingResult,
  );
  const seedInfluenceHandoffSummary = buildSeedInfluenceHandoffSummary(
    queryCompleted?.result.codingResult?.lastActionResultSeed,
    input.seedInfluence,
  );
  const successHandoffDiagnostic = buildSuccessHandoffDiagnostic(
    queryCompleted?.result.codingResult,
  );
  const taskState = queryCompleted?.result.codingResult
    ? projectQueryRuntimeTaskStateFromResult({
        source: "compact",
        result: queryCompleted.result.codingResult,
        continuationSafety: continuationSafetyForRuntimeState({
          source: "compact",
          safe: true,
          reasons: ["compact quality checks passed"],
        }),
      })
    : undefined;
  return applyCompactRetentionPlan(
    projectCompactRetentionPlanInput({
      workingMemory: input.workingMemory,
      event: input.event,
      turnThreshold: input.turnThreshold,
      now: input.now,
      ...(approvalAudit ? { approvalAudit } : {}),
      approvalAuditHistory,
      ...(queryCompleted?.result.codingResult ? {
        result: {
          source: input.source,
          taskKind: queryCompleted.result.codingResult.taskKind,
          terminal: {
            terminalClassification: queryCompleted.result.terminalClassification,
            terminalReason: queryCompleted.result.terminalReason,
            stopReason: queryCompleted.result.stopReason,
          },
          actionHandoffSummary,
          writeContinuity: stoppedSessionContinuity?.writeContinuity,
          seedInfluence: input.seedInfluence,
          seedInfluenceHandoffSummary,
          failureHandoffDiagnostic: stoppedSessionContinuity?.failureHandoffDiagnostic,
          successHandoffDiagnostic,
          taskState,
        },
      } : {}),
    }),
  );
}
