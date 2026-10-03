import { isRecord } from "../../core/values/record.js";
import type { SessionThreadSnapshot } from "../schema/sessionThread.js";
import { sessionThreadPath } from "../schema/sessionThread.js";
import { isSessionContextMessage } from "../schema/sessionMessage.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import { RESULT_FIELDS } from "./source.js";
import { hasResultSummary } from "./summaryFormatter.js";

export interface ContinuitySource {
  readonly eventId: string;
  readonly entryId: string;
}

/** Legacy facts have no branch attribution. Keep them only in linear histories. */
export function continuityBranchScope(thread: SessionThreadSnapshot | undefined, events: readonly TranscriptEvent[]) {
  const selected = thread ? sessionThreadPath(thread) : undefined;
  const entries = new Set(selected?.path.map(entry => entry.id));
  const admitsEntry = (entryId: unknown): boolean => typeof entryId === "string" && entryId.length > 0 &&
    selected?.resolved === true && entries.has(entryId);
  const allowLegacy = !events.some(event => event.type === "branch_summary") &&
    (!thread || (selected?.resolved === true && thread.branches.length === 0 &&
      thread.entries.every(entry => entries.has(entry.id)) && events.every(event =>
        event.type !== "message" || isSessionContextMessage(event) || (event.id !== undefined && entries.has(event.id)))));
  return {
    allowLegacy,
    allowGlobalFallback: allowLegacy && events.every(event => event.type !== "query-event" ||
      event.sourceEntryId === undefined || admitsEntry(event.sourceEntryId)),
    admitsEntry: (entryId: unknown): boolean => entryId === undefined
      ? allowLegacy
      : admitsEntry(entryId),
  };
}

export function readContinuitySource(value: unknown): ContinuitySource | undefined {
  return isRecord(value) && typeof value.eventId === "string" && value.eventId.length > 0 &&
    typeof value.entryId === "string" && value.entryId.length > 0
    ? { eventId: value.eventId, entryId: value.entryId } : undefined;
}

/** Remove an excluded result as one group, including legacy text fallbacks. */
export function selectBranchResultMemory(
  memory: unknown,
  thread: SessionThreadSnapshot | undefined,
  events: readonly TranscriptEvent[],
): unknown {
  if (!isRecord(memory)) return memory;
  const continuity = isRecord(memory.continuity) ? memory.continuity : {};
  const source = readContinuitySource(continuity.resultSource);
  const scope = continuityBranchScope(thread, events);
  const matching = source ? events.find(event => event.id === source.eventId) : undefined;
  const consistent = !matching || (matching.type === "query-event" &&
    matching.event.type === "query.completed" && matching.sourceEntryId === source?.entryId);
  if (consistent && (continuity.resultSource === undefined
    ? scope.allowLegacy : source && scope.admitsEntry(source.entryId))) return memory;
  const retained = { ...continuity };
  for (const key of RESULT_FIELDS) delete retained[key];
  return { ...memory, continuity: retained,
    summary: Array.isArray(memory.summary) ? memory.summary.filter(entry => !hasResultSummary([entry])) : memory.summary };
}

/** A surviving older event cannot replace a newer retained checkpoint. */
export function storedResultIsNewer(
  memory: unknown,
  candidate: Extract<TranscriptEvent, { type: "query-event" }> | undefined,
  thread: SessionThreadSnapshot | undefined,
  events: readonly TranscriptEvent[],
): boolean | undefined {
  if (!isRecord(memory) || !isRecord(memory.continuity) || !candidate) return false;
  const source = readContinuitySource(memory.continuity.resultSource);
  if (!source) return false;
  const checkpointIndex = events.findIndex(event => event.id === source.eventId);
  const candidateIndex = events.indexOf(candidate);
  if (checkpointIndex >= 0 && candidateIndex >= 0) return checkpointIndex > candidateIndex;
  const path = thread ? sessionThreadPath(thread).path : [];
  const checkpointOrder = path.findIndex(entry => entry.id === source.entryId);
  const candidateOrder = path.findIndex(entry => entry.id === candidate.sourceEntryId);
  if (checkpointOrder < 0 || candidateOrder < 0 || checkpointOrder === candidateOrder) return undefined;
  return checkpointOrder > candidateOrder;
}

export function latestContinuityFailure(events: readonly TranscriptEvent[]): {
  readonly entry: Extract<TranscriptEvent, { type: "query-event" }>;
  readonly error: string;
} | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const entry = events[index]!;
    if (entry.type !== "query-event") continue;
    if (entry.event.type === "query.completed") return undefined;
    if (entry.event.type === "query.failed" || entry.event.type === "lifecycle.error") return { entry, error: entry.event.error };
  }
  return undefined;
}
