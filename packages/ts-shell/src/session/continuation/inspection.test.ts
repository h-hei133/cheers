import { describe, expect, it } from "vitest";
import type { CodingResultSummary } from "../../result/types.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import { projectHistoricalWriteInspection } from "./inspection.js";

function record(id: string, writerStarted = true): TranscriptEvent {
  const codingResult: CodingResultSummary = {
    taskKind: "edit-file", changedFiles: [], failedFiles: [], verifiedFiles: [], unverifiedFiles: [], patches: [],
    verification: { status: "blocked" }, evidence: ["writer-started-no-success", "write-effect:unknown"],
    repair: { status: "not-needed", attempts: 0, recoveredItems: [], failedItems: [], notes: [] },
    continuation: { status: "first-pass-success", attempts: 0, evidence: [] },
    taskSatisfaction: { verdict: "insufficient-evidence", reasons: [] },
    changeSet: { attemptedFiles: [], changedFiles: [] },
    lastActionResultSeed: { actionKind: "edit-file", target: `${id}.ts`, changedFiles: [], verifiedFiles: [],
      writerStarted, writeEffect: "unknown" },
  };
  return { type: "query-event", id, timestamp: "2026-10-03T00:00:00.000Z", sourceEntryId: `entry-${id}`,
    event: { type: "query.completed", result: { status: "stopped_error", terminalClassification: "stopped",
      terminalReason: "stopped_error", transcript: [], finalOutput: "stopped", codingResult,
      sharedContext: { sessionId: "history", initialPrompt: "work", notes: [], handoffs: [] } } } };
}

describe("historical write inspection", () => {
  it("excludes explicit not-started writes despite legacy markers", () => {
    expect(projectHistoricalWriteInspection([record("denied", false)])).toEqual([]);
  });

  it("counts all records while bounding detail and preserving source references", () => {
    const events = Array.from({ length: 9 }, (_, i) => record(`event-${i}`));
    const before = JSON.stringify(events);
    const items = projectHistoricalWriteInspection(events);
    expect(items).toHaveLength(4);
    expect(items[0]).toContain("Recorded uncertain writes: 9");
    expect(items[0]).toContain("Latest 3 shown");
    expect(items.slice(1)).toEqual([8, 7, 6].map(i => `historical-write: unknown; source=event-${i}; target=event-${i}.ts`));
    expect(JSON.stringify(events)).toBe(before);
  });

  it("uses the retained timestamp when legacy records lack IDs", () => {
    const event = record("legacy");
    expect(projectHistoricalWriteInspection([{ ...event, id: undefined, sourceEntryId: undefined } as TranscriptEvent])[1])
      .toContain("source=2026-10-03T00:00:00.000Z");
  });
});
