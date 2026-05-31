import * as path from "node:path";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import type { ApprovalAuditMemoryState } from "../sessionContinuityTypes.js";
import {
  projectApprovalAuditContinuity,
  projectApprovalSummaryFallback,
} from "./auditProjection.js";
import { decodeApprovalMemoryHistory } from "./memoryCodec.js";

export const SESSION_APPROVAL_AUDIT_HISTORY_LIMIT = 16;

export function projectApprovalMemoryPersistence(input: {
  readonly currentWorkingMemory: unknown;
  readonly sessionProjectRoot: string;
  readonly decision: Omit<ApprovalAuditMemoryState, "recordedAt"> & {
    readonly recordedAt?: string;
  };
  readonly recordedAt: string;
  readonly historyLimit: number;
}): {
  readonly workingMemory: Record<string, unknown>;
  readonly approvalAudit: ApprovalAuditMemoryState;
  readonly approvalAuditHistory: readonly ApprovalAuditMemoryState[];
} {
  const currentWorkingMemory =
    input.currentWorkingMemory &&
    typeof input.currentWorkingMemory === "object" &&
    !Array.isArray(input.currentWorkingMemory)
      ? { ...(input.currentWorkingMemory as Record<string, unknown>) }
      : {};
  const normalizedProjectRoot = path.resolve(
    input.decision.projectRoot?.trim() || input.sessionProjectRoot,
  );
  const approvalAudit: ApprovalAuditMemoryState = {
    decision: input.decision.decision,
    decisionSource: input.decision.decisionSource,
    persistent: input.decision.persistent,
    cacheEffect: input.decision.cacheEffect,
    projectRoot: normalizedProjectRoot,
    cacheKey: input.decision.cacheKey,
    scopeLabel: input.decision.scopeLabel,
    ...(input.decision.lineage ? { lineage: input.decision.lineage } : {}),
    ...(input.decision.stopReason
      ? { stopReason: input.decision.stopReason }
      : {}),
    ...(input.decision.channel ? { channel: input.decision.channel } : {}),
    ...(input.decision.inputKey ? { inputKey: input.decision.inputKey } : {}),
    recordedAt: input.recordedAt,
  };
  const approvalAuditHistory = decodeApprovalMemoryHistory(
    currentWorkingMemory,
    { historyLimit: input.historyLimit },
  );
  const nextApprovalAuditHistory = [
    ...approvalAuditHistory,
    approvalAudit,
  ].slice(-input.historyLimit);
  const currentContinuity =
    currentWorkingMemory.continuity &&
    typeof currentWorkingMemory.continuity === "object" &&
    !Array.isArray(currentWorkingMemory.continuity)
      ? { ...(currentWorkingMemory.continuity as Record<string, unknown>) }
      : {};
  const nextContinuity: Record<string, unknown> = {
    ...currentContinuity,
    ...projectApprovalAuditContinuity({
      approvalAudit,
      approvalAuditHistory: nextApprovalAuditHistory,
    }),
  };
  const currentSummaryEntries = Array.isArray(currentWorkingMemory.summary)
    ? currentWorkingMemory.summary.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : [];
  const nextSummary = projectApprovalSummaryFallback({
    currentSummaryEntries,
    approvalAudit,
  });

  return {
    approvalAudit,
    approvalAuditHistory: nextApprovalAuditHistory,
    workingMemory: {
      ...currentWorkingMemory,
      approvalAudit,
      approvalAuditHistory: nextApprovalAuditHistory,
      continuity: nextContinuity,
      summary: nextSummary,
    },
  };
}

export function recordSessionApprovalAuditDecision(input: {
  readonly session: Session;
  readonly decision: Omit<ApprovalAuditMemoryState, "recordedAt"> & {
    readonly recordedAt?: string;
  };
  readonly recordedAt: string;
  readonly historyLimit: number;
  readonly withStateLock: (sessionId: string, update: () => void) => void;
  readonly readCurrentSnapshot: () => SessionStateSnapshot | undefined;
  readonly buildSnapshot: (
    current: SessionStateSnapshot | undefined,
  ) => SessionStateSnapshot;
  readonly writeSnapshot: (snapshot: SessionStateSnapshot) => void;
}): void {
  input.withStateLock(input.session.id, () => {
    const current = input.readCurrentSnapshot();
    const approvalMemory = projectApprovalMemoryPersistence({
      currentWorkingMemory: current?.workingMemory,
      sessionProjectRoot: input.session.projectRoot,
      decision: input.decision,
      recordedAt: input.recordedAt,
      historyLimit: input.historyLimit,
    });
    const snapshot = input.buildSnapshot(current);
    input.writeSnapshot({
      ...snapshot,
      workingMemory: approvalMemory.workingMemory,
    });
  });
}
