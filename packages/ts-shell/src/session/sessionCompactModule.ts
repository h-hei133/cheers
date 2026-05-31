import type { QueryEvent } from "../core/query/runtime/events.js";
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

export function applySessionCompactRetention(input: {
  readonly workingMemory: unknown;
  readonly event: QueryEvent;
  readonly turnThreshold: number;
  readonly historyLimit: number;
  readonly now: string;
  readonly seedInfluence?: SeedInfluenceDiagnostic;
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
  return applyCompactRetentionPlan(
    projectCompactRetentionPlanInput({
      workingMemory: input.workingMemory,
      event: input.event,
      turnThreshold: input.turnThreshold,
      now: input.now,
      ...(approvalAudit ? { approvalAudit } : {}),
      approvalAuditHistory,
      ...(actionHandoffSummary ? { actionHandoffSummary } : {}),
      ...(stoppedSessionContinuity?.writeContinuity
        ? { writeContinuity: stoppedSessionContinuity.writeContinuity }
        : {}),
      ...(input.seedInfluence ? { seedInfluence: input.seedInfluence } : {}),
      ...(seedInfluenceHandoffSummary ? { seedInfluenceHandoffSummary } : {}),
      ...(stoppedSessionContinuity?.failureHandoffDiagnostic
        ? {
            failureHandoffDiagnostic:
              stoppedSessionContinuity.failureHandoffDiagnostic,
          }
        : {}),
      ...(successHandoffDiagnostic ? { successHandoffDiagnostic } : {}),
    }),
  );
}
