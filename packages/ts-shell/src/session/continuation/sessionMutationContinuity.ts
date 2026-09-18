import type { CodingResultSummary } from "../../result/types.js";
import { buildMutationContinuityState } from "../mutationContinuityState.js";

export function projectSessionMutationContinuity(input: {
  readonly lastCodingResult?: CodingResultSummary;
  readonly recentCodingResults: readonly CodingResultSummary[];
  readonly lastUserIntent?: string;
}): ReturnType<typeof buildMutationContinuityState> {
  return buildMutationContinuityState(input);
}
