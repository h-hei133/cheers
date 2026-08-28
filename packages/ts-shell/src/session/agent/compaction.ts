import type { QueryEvent } from "../../core/query/runtime/events.js";
import { extractSeedInfluenceFromQueryResult } from "../continuation/sessionSeedInfluence.js";
import { applySessionCompactRetention } from "../sessionCompactModule.js";

export const AUTO_COMPACT_TURN_THRESHOLD = 12;
export const DEFAULT_APPROVAL_AUDIT_HISTORY_LIMIT = 50;

export function applyAutoCompactRetention(
  workingMemory: unknown,
  event: QueryEvent,
  options?: {
    readonly turnThreshold?: number;
    readonly historyLimit?: number;
    readonly now?: string;
  },
): unknown {
  return applySessionCompactRetention({
    workingMemory,
    event,
    turnThreshold: options?.turnThreshold ?? AUTO_COMPACT_TURN_THRESHOLD,
    historyLimit: options?.historyLimit ?? DEFAULT_APPROVAL_AUDIT_HISTORY_LIMIT,
    now: options?.now ?? new Date().toISOString(),
    seedInfluence: extractSeedInfluenceFromQueryResult(
      event.type === "query.completed" ? event.result : undefined,
    ),
  });
}
