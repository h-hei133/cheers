import { describe, expect, it } from "vitest";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import {
  deriveLifecycleIndexFromTranscript,
  findCompensatedLifecycleEvent,
  isDuplicateDurableResolutionEvent,
} from "./sessionLifecycleReadModel.js";

describe("session lifecycle read model", () => {
  it.each(["tool.result", "approval.resolved"] as const)("does not reuse %s from a previous attempt", (type) => {
    const resolved = type === "tool.result"
      ? { type, toolName: "bash", taskId: "call_0", success: true } as const
      : { type, toolName: "bash", taskId: "call_0", outcome: "approved" } as const;
    const started = { type: type === "tool.result" ? "tool.started" : "approval.requested", toolName: "bash", taskId: "call_0" } as const;
    const events = [queryEvent(started), queryEvent(resolved), queryEvent(started)];
    expect(findCompensatedLifecycleEvent(events, resolved)).toBeUndefined();
    expect(isDuplicateDurableResolutionEvent({ events, event: resolved })).toBe(false);
    const current = { ...resolved, compensated: true };
    expect(findCompensatedLifecycleEvent([...events, queryEvent(current)], resolved)).toEqual(current);
  });

  it("does not carry lifecycle evidence into a new run", () => {
    const resolved = { type: "tool.result", toolName: "bash", taskId: "call_0", success: true } as const;
    const events: TranscriptEvent[] = [
      queryEvent(resolved),
      queryEvent({ type: "tool.started", toolName: "bash", taskId: "old" }),
      { type: "lifecycle", event: "run-started", timestamp: "2026-05-28T00:00:01.000Z" },
    ];
    expect(findCompensatedLifecycleEvent(events, resolved)).toBeUndefined();
    expect(isDuplicateDurableResolutionEvent({ events, event: resolved })).toBe(false);
    expect(deriveLifecycleIndexFromTranscript(events).pendingTools).toEqual({});
  });

  it("does not carry lifecycle evidence into a markerless new prompt", () => {
    const resolved = { type: "tool.result", toolName: "bash", taskId: "call_0", success: true } as const;
    const events: TranscriptEvent[] = [
      queryEvent(resolved),
      queryEvent({ type: "tool.started", toolName: "bash", taskId: "old" }),
      queryEvent({ type: "query.failed", error: "failed" }),
      { type: "message", role: "user", content: "new", timestamp: "2026-05-28T00:00:01.000Z" },
    ];
    expect(findCompensatedLifecycleEvent(events, resolved)).toBeUndefined();
    expect(deriveLifecycleIndexFromTranscript(events).pendingTools).toEqual({});
  });

  it("derives pending lifecycle from transcript query events", () => {
    const index = deriveLifecycleIndexFromTranscript([
      queryEvent({
        type: "approval.requested",
        toolName: "bash",
        taskId: "approval-1",
      }),
      queryEvent({ type: "tool.started", toolName: "bash", taskId: "tool-1" }),
    ]);

    expect(index.pendingApprovals).toHaveProperty("approval-1");
    expect(index.pendingTools).toHaveProperty("tool-1");
  });

  it("finds direct resolutions and suppresses only identical durable duplicates", () => {
    const resolved = {
      type: "approval.resolved" as const,
      toolName: "bash",
      taskId: "approval-1",
      outcome: "denied" as const,
    };
    const events = [queryEvent(resolved)];

    expect(
      findCompensatedLifecycleEvent(events, {
        type: "approval.resolved",
        toolName: "bash",
        taskId: "approval-1",
      }),
    ).toEqual(resolved);
    expect(
      isDuplicateDurableResolutionEvent({ events, event: resolved }),
    ).toBe(true);
    expect(
      isDuplicateDurableResolutionEvent({
        events,
        event: { ...resolved, compensated: true },
      }),
    ).toBe(false);
  });
});

function queryEvent(
  event: Extract<TranscriptEvent, { type: "query-event" }>["event"],
): TranscriptEvent {
  return {
    type: "query-event",
    event,
    timestamp: "2026-05-28T00:00:00.000Z",
  };
}
