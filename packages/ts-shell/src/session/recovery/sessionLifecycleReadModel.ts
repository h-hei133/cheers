import type { QueryEvent } from "../../core/query/runtime/events.js";
import {
  applyLifecycleEventToIndex,
  createEmptyLifecycleIndex,
  type DurableLifecycleIndex,
} from "../../core/tools/toolResultLifecycle.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import { latestTranscriptRunStart, startsTranscriptScope } from "../transcript/scope.js";

export function deriveLifecycleIndexFromTranscript(
  events: readonly TranscriptEvent[],
): DurableLifecycleIndex {
  return events.slice(latestTranscriptRunStart(events)).reduce<DurableLifecycleIndex>((index, event) => {
    if (startsTranscriptScope(event)) return createEmptyLifecycleIndex();
    if (event.type !== "query-event") {
      return index;
    }

    return applyLifecycleEventToIndex(index, event.event);
  }, createEmptyLifecycleIndex());
}

export function isDuplicateDurableResolutionEvent(input: {
  readonly events: readonly TranscriptEvent[];
  readonly event: QueryEvent;
}): boolean {
  if (
    input.event.type !== "approval.resolved" &&
    input.event.type !== "tool.result"
  ) {
    return false;
  }

  const existing = findCompensatedLifecycleEvent(input.events, input.event);
  return existing !== undefined && JSON.stringify(existing) === JSON.stringify(input.event);
}

export function findCompensatedLifecycleEvent(
  events: readonly TranscriptEvent[],
  input:
    | { readonly type: "approval.resolved"; readonly taskId: string; readonly toolName: string }
    | { readonly type: "tool.result"; readonly taskId: string; readonly toolName: string },
):
  | Extract<QueryEvent, { type: "approval.resolved" | "tool.result" }>
  | undefined {
  const startType = input.type === "tool.result" ? "tool.started" : "approval.requested";
  const scopeStart = latestTranscriptRunStart(events);
  for (let index = events.length - 1; index >= scopeStart; index -= 1) {
    const event = events[index]!;
    if (startsTranscriptScope(event)) return undefined;
    if (event.type !== "query-event") continue;
    const candidate = event.event;
    if (candidate.type === startType && candidate.taskId === input.taskId) return undefined;
    if (candidate.type === input.type && candidate.taskId === input.taskId && candidate.toolName === input.toolName) return candidate;
  }
  return undefined;
}
