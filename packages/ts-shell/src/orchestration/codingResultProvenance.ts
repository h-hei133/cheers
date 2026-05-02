import { deriveApprovalDecisionProvenance } from "../core/tools/approvalProvenance.js";
import { deriveToolExecutionProvenance } from "../core/tools/toolExecutionProvenance.js";
import type { ToolExecutionResult } from "../tools/types.js";
import type {
  CodingApprovalDecisionProvenanceSummary,
  CodingResultProvenanceSummary,
  CodingToolExecutionProvenanceSummary,
} from "./types.js";

export interface CodingResultProvenanceCollector {
  readonly approvalDecisions: CodingApprovalDecisionProvenanceSummary[];
  readonly toolExecutions: CodingToolExecutionProvenanceSummary[];
}

export function createCodingResultProvenanceCollector(): CodingResultProvenanceCollector {
  return {
    approvalDecisions: [],
    toolExecutions: [],
  };
}

export function recordToolLifecycleProvenance(
  collector: CodingResultProvenanceCollector,
  input: {
    readonly toolName: string;
    readonly taskId: string;
    readonly result: ToolExecutionResult;
    readonly requireApprovalEvent: boolean;
  },
): void {
  if (input.requireApprovalEvent) {
    const approval = deriveApprovalDecisionProvenance(input.result);
    collector.approvalDecisions.push({
      kind: approval.kind,
      source: approval.source,
      legacyOutcome: approval.legacyOutcome,
      toolName: input.toolName,
      taskId: input.taskId,
      ...(approval.wasEscalated === undefined
        ? {}
        : { wasEscalated: approval.wasEscalated }),
    });
  }

  const toolExecution = deriveToolExecutionProvenance(input.result);
  collector.toolExecutions.push({
    kind: toolExecution.kind,
    source: toolExecution.source,
    legacySuccess: toolExecution.legacySuccess,
    toolName: input.toolName,
    taskId: input.taskId,
    ...(toolExecution.failureBoundary
      ? { failureBoundary: toolExecution.failureBoundary }
      : {}),
  });
}

export function summarizeCodingResultProvenance(
  collector: CodingResultProvenanceCollector,
): CodingResultProvenanceSummary | undefined {
  if (
    collector.approvalDecisions.length === 0 &&
    collector.toolExecutions.length === 0
  ) {
    return undefined;
  }

  return {
    ...(collector.approvalDecisions.length > 0
      ? { approvalDecisions: [...collector.approvalDecisions] }
      : {}),
    ...(collector.toolExecutions.length > 0
      ? { toolExecutions: [...collector.toolExecutions] }
      : {}),
  };
}
