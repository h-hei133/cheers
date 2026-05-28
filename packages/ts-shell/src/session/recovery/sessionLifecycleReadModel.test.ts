import { describe, expect, it } from "vitest";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import {
  deriveLifecycleIndexFromTranscript,
  findCompensatedLifecycleEvent,
  isDuplicateDurableResolutionEvent,
} from "./sessionLifecycleReadModel.js";

describe("session lifecycle read model", () => {
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
