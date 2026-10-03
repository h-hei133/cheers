import type { TranscriptEvent } from "../sessionEventCodec.js";
import { compactContinuityText } from "../sessionContinuityModule.js";
import { buildStoppedSessionWriteContinuity } from "./stoppedSessionContinuity.js";

/** Scan branch-admitted history; these observations never replace the current result or claim settlement. */
export function projectHistoricalWriteInspection(events: readonly TranscriptEvent[]): readonly string[] {
  let count = 0;
  const recent: string[] = [];
  for (let index = events.length - 1; index >= 0; index--) {
    const entry = events[index]!;
    if (entry.type !== "query-event" || entry.event.type !== "query.completed") continue;
    const write = buildStoppedSessionWriteContinuity(entry.event.result.codingResult);
    if (!write?.writerStarted || (write.writeEffect !== "unknown" && write.writeEffect !== "unverified")) continue;
    count++;
    if (recent.length === 3) continue;
    const source = entry.id ?? entry.sourceEntryId ?? entry.timestamp;
    recent.push(`historical-write: ${write.writeEffect}; source=${compactContinuityText(source, 60)}; target=${compactContinuityText(write.target ?? "unavailable", 100)}`);
  }
  return count === 0 ? [] : [
    `Recorded uncertain writes: ${count}; inspect before retrying. Latest ${recent.length} shown; full records remain in the session transcript.`,
    ...recent,
  ];
}
