import { describe, expect, it } from "vitest";
import { buildSessionRecoverySnapshot } from "./sessionRecoverySnapshot.js";

describe("session recovery snapshot", () => {
  it("prioritizes repaired transcript truth for lifecycle and last messages", () => {
    const snapshot = buildSessionRecoverySnapshot({
      sessionId: "sess_recovery",
      session: {
        id: "sess_recovery",
        status: "interrupted",
        turns: [],
        createdAt: "2026-05-28T00:00:00.000Z",
        updatedAt: "2026-05-28T00:00:10.000Z",
        projectRoot: "/repo",
        pendingPrompt: "finish task",
      },
      state: {
        status: "interrupted",
        runPhase: "turn-active",
        pendingLifecycle: {
          pendingApprovals: {},
          pendingTools: {},
          taskStates: {},
        },
      },
      transcriptEvents: [
        {
          type: "query-event",
          event: { type: "tool.started", toolName: "bash", taskId: "tool-1" },
          timestamp: "2026-05-28T00:00:01.000Z",
        },
      ],
    });

    expect(snapshot.pendingLifecycle.pendingTools).toHaveProperty("tool-1");
    expect(snapshot.lastUserMessage?.content).toBe("finish task");
    expect(snapshot.repairSummary.insertedPromptMessage).toBe(true);
    expect(snapshot.lastLifecycleEvent?.event).toBe("run-interrupted");
  });
});
