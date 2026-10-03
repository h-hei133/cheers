import type { QueryEvent } from "../../core/query/runtime/events.js";
import {
  buildCompactContinuitySummary,
  type CompactContinuityApprovalAudit,
  type CompactContinuityResult,
} from "./compactSummary.js";

export interface CompactRetentionPlanInput {
  readonly workingMemory: unknown;
  readonly event: QueryEvent;
  readonly turnThreshold: number;
  readonly now: string;
  readonly approvalAudit?: CompactContinuityApprovalAudit;
  readonly approvalAuditHistory: readonly CompactContinuityApprovalAudit[];
  readonly result?: CompactContinuityResult;
}

export function applyCompactRetentionPlan(
  input: CompactRetentionPlanInput,
): unknown {
  if (input.workingMemory !== undefined && (
    input.workingMemory === null ||
    typeof input.workingMemory !== "object" ||
    Array.isArray(input.workingMemory)
  )) {
    return input.workingMemory;
  }

  const root = { ...((input.workingMemory ?? {}) as Record<string, unknown>) };
  const previousEventCount = normalizeCount(root.sourceEventCount);
  const previousTurnCount = normalizeCount(root.sourceTurnCount);
  const turnCompleted = input.event.type === "query.completed";
  const nextEventCount = previousEventCount + 1;
  const nextTurnCount = previousTurnCount + (turnCompleted ? 1 : 0);
  root.sourceEventCount = nextEventCount;
  root.sourceTurnCount = nextTurnCount;
  root.updatedAt = input.now;

  if (
    !turnCompleted ||
    nextTurnCount < input.turnThreshold
  ) {
    return root;
  }

  const compactSummary = buildCompactContinuitySummary({
    summary: root.summary,
    continuity: root.continuity,
    ...(input.approvalAudit ? { approvalAudit: input.approvalAudit } : {}),
    approvalAuditHistory: input.approvalAuditHistory,
    result: input.result,
  });
  if (compactSummary.approvalAuditHistory) {
    root.approvalAuditHistory = compactSummary.approvalAuditHistory;
  }

  root.continuity = compactSummary.continuity;
  root.summary = compactSummary.summary;
  root.compacted = true;
  root.compactReason = "auto-threshold";
  root.compactedAt = input.now;
  return root;
}

function normalizeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}
