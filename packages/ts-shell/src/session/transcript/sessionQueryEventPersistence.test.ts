import { describe, expect, it } from "vitest";
import type { QueryEvent } from "../../core/query/events.js";
import {
  appendSessionQueryEvent,
  applySessionQueryEventToState,
} from "./sessionQueryEventPersistence.js";

describe("session query event persistence", () => {
  it("does not append identical direct resolution events twice", () => {
    const event: QueryEvent = {
      type: "tool.result",
      toolName: "bash",
      taskId: "tool-1",
      success: false,
    };
    const appended: unknown[] = [];

    appendSessionQueryEvent({
      event,
      timestamp: "2026-05-28T00:00:00.000Z",
      transcriptEvents: [
        {
          type: "query-event",
          event,
          timestamp: "2026-05-28T00:00:00.000Z",
        },
      ],
      appendTranscriptEvent: (transcriptEvent) => appended.push(transcriptEvent),
      applyQueryEventToState: () => appended.push("state"),
    });

    expect(appended).toEqual([]);
  });

  it("updates state lifecycle and preserves compacted working memory", () => {
    const snapshots: unknown[] = [];

    applySessionQueryEventToState({
      session: {
        id: "sess_query",
        status: "active",
        turns: [],
        createdAt: "2026-05-28T00:00:00.000Z",
        updatedAt: "2026-05-28T00:00:01.000Z",
      },
      event: { type: "tool.started", toolName: "bash", taskId: "tool-1" },
      withSessionStateLock: (write) => write(),
      readCurrentState: () => ({ status: "active", workingMemory: { old: true } }),
      buildSessionStateSnapshot: (_session, current, overrides) => ({
        status: "active",
        workingMemory: current?.workingMemory,
        pendingLifecycle: overrides?.pendingLifecycle,
      }),
      applyAutoCompactRetention: () => ({ compacted: true }),
      writeSnapshot: (snapshot) => snapshots.push(snapshot),
    });

    expect(snapshots).toEqual([
      expect.objectContaining({
        workingMemory: { compacted: true },
        pendingLifecycle: expect.objectContaining({
          pendingTools: {
            "tool-1": { taskId: "tool-1", toolName: "bash" },
          },
        }),
      }),
    ]);
  });
});
