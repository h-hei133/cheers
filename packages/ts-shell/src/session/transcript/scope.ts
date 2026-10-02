import type { TranscriptEvent } from "../sessionEventCodec.js";

/** A new query or branch cannot inherit execution state from its predecessor. */
export function startsTranscriptScope(event: TranscriptEvent): boolean {
  return event.type === "branch_summary" ||
    (event.type === "lifecycle" && event.event === "run-started") ||
    (event.type === "query-event" && event.event.type === "query.started");
}

/** Include the current prompt, which is written before query.started. */
export function latestTranscriptRunStart(events: readonly TranscriptEvent[]): number {
  let start = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (!startsTranscriptScope(event)) continue;
    start = index;
    if (event.type === "query-event") {
      while (start > 0 && events[start - 1]?.type === "message") start -= 1;
      const preceding = events[start - 1];
      if (preceding?.type === "lifecycle" && preceding.event === "run-started") start -= 1;
    }
    break;
  }
  // A legacy/incomplete new run may lack both start markers. A new prompt or
  // turn after a terminal boundary is still not part of that completed query.
  let hasNewWork = false;
  for (let index = events.length - 1; index >= start; index -= 1) {
    const event = events[index]!;
    if ((event.type === "message" && event.role === "user") ||
      (event.type === "query-event" && event.event.type === "turn.started")) hasNewWork = true;
    if ((event.type === "query-event" && (event.event.type === "query.completed" || event.event.type === "query.failed")) ||
      (event.type === "lifecycle" && (event.event === "run-completed" || event.event === "run-error" || event.event === "run-terminated"))) {
      if (hasNewWork) return index + 1;
    }
  }
  return start;
}
