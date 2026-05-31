import type { QueryEvent } from "../../core/query/runtime/events.js";
import type { TranscriptEvent } from "../../session/sessionEventCodec.js";

export type QueryCompletionTranscriptEvent =
  Extract<TranscriptEvent, { type: "query-event" }> & {
    readonly event: Extract<QueryEvent, { type: "query.completed" }>;
  };

export function selectContinuityTerminalSource(input: {
  readonly lastQueryCompletion?: QueryCompletionTranscriptEvent;
  readonly lastCodingCompletion?: QueryCompletionTranscriptEvent;
}): QueryCompletionTranscriptEvent | undefined {
  const lastQueryCompletion = input.lastQueryCompletion;
  const lastCodingCompletion = input.lastCodingCompletion;
  return lastQueryCompletion?.event.result.terminalClassification ===
    "success" &&
    lastCodingCompletion?.event.result.terminalClassification &&
    lastCodingCompletion.event.result.terminalClassification !== "success"
    ? lastCodingCompletion
    : lastQueryCompletion;
}
