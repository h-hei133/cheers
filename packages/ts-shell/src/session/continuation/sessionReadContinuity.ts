import {
  extractGroundedDeliverableMode,
  extractLastAnswerDefect,
  extractLastReadDeliveredLines,
  extractLastReadFragment,
  extractLastReadWindow,
  extractStagedRepairProgress,
} from "../sessionContinuityModule.js";
import type { CodingResultSummary } from "../../result/types.js";

export function projectSessionReadContinuity(
  lastCodingResult: CodingResultSummary | undefined,
): {
  readonly lastGroundedDeliverableMode?: "read" | "summary" | "explain";
  readonly lastReadDeliveredLines?: number;
  readonly lastReadWindow: ReturnType<typeof extractLastReadWindow>;
  readonly lastReadFragment: ReturnType<typeof extractLastReadFragment>;
  readonly stagedRepairProgress: ReturnType<typeof extractStagedRepairProgress>;
  readonly lastAnswerDefect?: string;
} {
  const evidence = lastCodingResult?.continuation.evidence;
  return {
    lastGroundedDeliverableMode: extractGroundedDeliverableMode(evidence),
    lastReadDeliveredLines: extractLastReadDeliveredLines(evidence),
    lastReadWindow: extractLastReadWindow(evidence),
    lastReadFragment: extractLastReadFragment(evidence),
    stagedRepairProgress: extractStagedRepairProgress(evidence),
    lastAnswerDefect: extractLastAnswerDefect(lastCodingResult) ?? undefined,
  };
}
