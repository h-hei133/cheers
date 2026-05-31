import type { QueryEvent } from "../../core/query/runtime/events.js";
import {
  applyLifecycleEventToIndex,
  createEmptyLifecycleIndex,
  type DurableLifecycleIndex,
} from "../../core/tools/toolResultLifecycle.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";

export function deriveLifecycleIndexFromTranscript(
  events: readonly TranscriptEvent[],
): DurableLifecycleIndex {
  return events.reduce<DurableLifecycleIndex>((index, event) => {
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

  return input.events.some((existing) => {
    if (existing.type !== "query-event") {
      return false;
    }

    return JSON.stringify(existing.event) === JSON.stringify(input.event);
  });
}

export function findCompensatedLifecycleEvent(
  events: readonly TranscriptEvent[],
  input:
    | { readonly type: "approval.resolved"; readonly taskId: string; readonly toolName: string }
    | { readonly type: "tool.result"; readonly taskId: string; readonly toolName: string },
):
  | Extract<QueryEvent, { type: "approval.resolved" | "tool.result" }>
  | undefined {
  return events.find(
    (
      event,
    ): event is Extract<TranscriptEvent, { type: "query-event" }> & {
      event: Extract<QueryEvent, { type: "approval.resolved" | "tool.result" }>;
    } => {
      if (event.type !== "query-event") {
        return false;
      }

      if (event.event.type !== input.type) {
        return false;
      }

      if (
        event.event.taskId !== input.taskId ||
        event.event.toolName !== input.toolName
      ) {
        return false;
      }

      return true;
    },
  )?.event;
}
