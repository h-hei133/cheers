import type { CodingResultSummary } from "../../orchestration/types.js";
import { projectApprovalAudit } from "./auditProjection.js";
import {
  decodeApprovalMemory,
  decodeApprovalMemoryHistory,
} from "./memoryCodec.js";
import type {
  ApprovalAuditMemoryState,
  SessionContinuitySnapshot,
} from "../sessionContinuityTypes.js";

export function projectSessionApprovalContinuity(input: {
  readonly workingMemory: unknown;
  readonly lastCodingResult?: CodingResultSummary;
  readonly historyLimit: number;
}): Partial<SessionContinuitySnapshot> & {
  readonly lastApprovalAudit?: ApprovalAuditMemoryState;
  readonly lastApprovalHistory: readonly ApprovalAuditMemoryState[];
} {
  const lastApprovalAudit = decodeApprovalMemory(input.workingMemory);
  const lastApprovalHistory = decodeApprovalMemoryHistory(input.workingMemory, {
    historyLimit: input.historyLimit,
  });
  const approvalProvenanceItems =
    input.lastCodingResult?.provenance?.approvalDecisions ?? [];
  const lastApprovalProvenance =
    approvalProvenanceItems[approvalProvenanceItems.length - 1];
  return {
    lastApprovalAudit,
    lastApprovalHistory,
    ...projectApprovalAudit(lastApprovalAudit),
    ...(lastApprovalHistory.length > 0 ? { lastApprovalHistory } : {}),
    ...(lastApprovalProvenance
      ? {
          lastApprovalProvenanceKind: lastApprovalProvenance.kind,
          lastApprovalProvenanceSource: lastApprovalProvenance.source,
          lastApprovalProvenanceToolName: lastApprovalProvenance.toolName,
          lastApprovalProvenanceTaskId: lastApprovalProvenance.taskId,
        }
      : {}),
  };
}
