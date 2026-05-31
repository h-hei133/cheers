import type { QueryEvent } from "../core/query/runtime/events.js";
import type { CodingResultSummary } from "../orchestration/types.js";

export interface ContextRuntimeStageResult {
  readonly events: QueryEvent[];
  readonly notes: string[];
  readonly codingResult: CodingResultSummary;
  readonly userFacingOutput: string;
}
