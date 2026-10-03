import type { QueryEvent } from "../core/query/runtime/events.js";
import type { QueryRuntimeHarnessState } from "../core/query/runtime/harness.js";
import type {
  CompactContinuityApprovalAudit,
  CompactContinuityResult,
} from "./continuation/compactSummary.js";
import type { CompactRetentionPlanInput } from "./continuation/retentionPlanner.js";

export interface SessionCompactProjectionInput {
  readonly workingMemory: unknown;
  readonly event: QueryEvent;
  readonly turnThreshold: number;
  readonly now: string;
  readonly approvalAudit?: CompactContinuityApprovalAudit;
  readonly approvalAuditHistory: readonly CompactContinuityApprovalAudit[];
  readonly result?: CompactContinuityResult;
  readonly harness?: QueryRuntimeHarnessState;
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
    ...(input.result ? { result: input.result } : {}),
    ...(input.harness ? { harness: input.harness } : {}),
  };
}
