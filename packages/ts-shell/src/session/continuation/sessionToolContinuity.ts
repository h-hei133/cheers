import type { CodingResultSummary } from "../../orchestration/types.js";
import type { SessionContinuitySnapshot } from "../sessionContinuityTypes.js";

export function projectSessionToolContinuity(
  lastCodingResult: CodingResultSummary | undefined,
): Partial<SessionContinuitySnapshot> {
  const toolExecutionProvenanceItems =
    lastCodingResult?.provenance?.toolExecutions ?? [];
  const lastToolExecutionProvenance =
    toolExecutionProvenanceItems[toolExecutionProvenanceItems.length - 1];
  return lastToolExecutionProvenance
    ? {
        lastToolExecutionProvenanceKind: lastToolExecutionProvenance.kind,
        lastToolExecutionProvenanceSource: lastToolExecutionProvenance.source,
        lastToolExecutionProvenanceToolName:
          lastToolExecutionProvenance.toolName,
        lastToolExecutionProvenanceTaskId:
          lastToolExecutionProvenance.taskId,
        ...(lastToolExecutionProvenance.failureBoundary
          ? {
              lastToolExecutionFailureBoundary:
                lastToolExecutionProvenance.failureBoundary,
            }
          : {}),
      }
    : {};
}
