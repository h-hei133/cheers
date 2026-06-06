import type { QueryEvent } from "../core/query/runtime/events.js";
import type { QueryRuntimeTaskState } from "../core/query/runtime/taskState.js";
import type { SeedInfluenceDiagnostic } from "./sessionContinuityTypes.js";
import type {
  CompactContinuityApprovalAudit,
  CompactContinuityWriteState,
} from "./continuation/compactSummary.js";
import type { CompactRetentionPlanInput } from "./continuation/retentionPlanner.js";

export interface SessionCompactProjectionInput {
  readonly workingMemory: unknown;
  readonly event: QueryEvent;
  readonly turnThreshold: number;
  readonly now: string;
  readonly approvalAudit?: CompactContinuityApprovalAudit;
  readonly approvalAuditHistory: readonly CompactContinuityApprovalAudit[];
  readonly actionHandoffSummary?: string;
  readonly writeContinuity?: CompactContinuityWriteState;
  readonly seedInfluence?: SeedInfluenceDiagnostic;
  readonly seedInfluenceHandoffSummary?: string;
  readonly failureHandoffDiagnostic?: string;
  readonly successHandoffDiagnostic?: string;
  readonly taskState?: QueryRuntimeTaskState;
}

export function projectCompactRetentionPlanInput(
  input: SessionCompactProjectionInput,
): CompactRetentionPlanInput {
  return {
    workingMemory: input.workingMemory,
    event: input.event,
    turnThreshold: input.turnThreshold,
    now: input.now,
    ...(input.approvalAudit ? { approvalAudit: input.approvalAudit } : {}),
    approvalAuditHistory: input.approvalAuditHistory,
    ...(input.actionHandoffSummary
      ? { actionHandoffSummary: input.actionHandoffSummary }
      : {}),
    ...(input.writeContinuity
      ? { writeContinuity: input.writeContinuity }
      : {}),
    ...(input.seedInfluence ? { seedInfluence: input.seedInfluence } : {}),
    ...(input.seedInfluenceHandoffSummary
      ? { seedInfluenceHandoffSummary: input.seedInfluenceHandoffSummary }
      : {}),
    ...(input.failureHandoffDiagnostic
      ? { failureHandoffDiagnostic: input.failureHandoffDiagnostic }
      : {}),
    ...(input.successHandoffDiagnostic
      ? { successHandoffDiagnostic: input.successHandoffDiagnostic }
      : {}),
    ...(input.taskState ? { taskState: input.taskState } : {}),
  };
}
