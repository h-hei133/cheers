import { describe, expect, it } from "vitest";
import { isDurableQueryEvent, type QueryEvent } from "./events.js";

/**
 * What belongs in the transcript.
 *
 * The distinction matters twice over: a reader rebuilding history needs the
 * events that describe what happened, and the writer must not pay a full
 * transcript read and a state write for every token the model streams.
 */

const STREAMING: readonly QueryEvent[] = [
  { type: "message.delta", role: "coder", delta: "partial" },
  { type: "reasoning.delta", role: "coder", delta: "thinking" },
  { type: "message.replace", role: "coder", text: "corrected" },
];

describe("durable query events", () => {
  it.each(STREAMING.map(event => [event.type, event] as const))(
    "keeps a streamed increment out of the transcript (%s)", (_name, event) => {
      expect(isDurableQueryEvent(event)).toBe(false);
    });

  it("keeps every event that records what happened", () => {
    const durable: readonly QueryEvent[] = [
      { type: "turn.started", role: "coder", turn: 1 },
      { type: "tool.started", toolName: "read", taskId: "task-1" },
      { type: "tool.result", toolName: "read", taskId: "task-1", success: true },
      { type: "query.retrying", role: "coder", turn: 1, attempt: 2, reason: "rate limited" },
      { type: "lifecycle.cancelled", reason: "interrupted" },
      { type: "lifecycle.error", error: "boom" },
    ];

    for (const event of durable) expect(isDurableQueryEvent(event)).toBe(true);
  });

  it("keeps the terminal events that close a run", () => {
    const completed: QueryEvent = {
      type: "query.completed",
      result: { status: "completed" } as never,
    };
    const failed: QueryEvent = { type: "query.failed", error: "boom" };

    expect(isDurableQueryEvent(completed)).toBe(true);
    expect(isDurableQueryEvent(failed)).toBe(true);
  });
});
