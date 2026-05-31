import type { QueryEvent } from "../../core/query/runtime/events.js";
import { extractSeedInfluenceFromStrings } from "../sessionContinuityModule.js";
import type { SeedInfluenceDiagnostic } from "../sessionContinuityTypes.js";

export function extractSeedInfluenceFromQueryResult(
  result: Extract<QueryEvent, { type: "query.completed" }>["result"] | undefined,
): SeedInfluenceDiagnostic | undefined {
  if (!result) {
    return undefined;
  }
  return extractSeedInfluenceFromStrings([
    ...(result.sharedContext.notes ?? []),
    ...(result.codingResult?.evidence ?? []),
    ...(result.codingResult?.continuation.evidence ?? []),
    ...(result.codingResult?.repair.notes ?? []),
  ]);
}
