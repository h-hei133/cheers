import { describe, expect, it } from "vitest";
import { createEmptyLifecycleIndex } from "../../core/tools/toolResultLifecycle.js";
import {
  buildReplayPlan,
  normalizeSessionReplayTranscript,
  repairSessionReplayTranscript,
} from "./sessionReplayFacade.js";

describe("session replay facade", () => {
  it("keeps replay normalization and repair idempotency behind the facade", () => {
    const normalized = normalizeSessionReplayTranscript([
      {
        type: "message",
        role: "assistant",
        content: "",
        timestamp: "2026-05-28T00:00:00.000Z",
      },
      {
        type: "message",
        role: "user",
        content: "continue",
        timestamp: "2026-05-28T00:00:01.000Z",
      },
    ]);

    expect(normalized).toHaveLength(1);
    expect(
      repairSessionReplayTranscript(normalized, {
        sessionId: "sess_replay",
        state: { status: "completed", runPhase: "idle" },
        updatedAt: "2026-05-28T00:00:02.000Z",
      }),
    ).toEqual(normalized);
  });

  it("builds replay plan from recovery snapshot without changing sentinel behavior", () => {
    const plan = buildReplayPlan({
      interruptedKind: "turn",
      pendingLifecycle: createEmptyLifecycleIndex(),
      repairSummary: {
        insertedPromptMessage: false,
        insertedQueryStarted: false,
        strippedInterruptedTerminalEvents: 0,
        insertedRunInterrupted: false,
        ignoredDuplicateTurnStarts: 0,
        ignoredUnpairedTurnCompletions: 0,
        ignoredRoleMismatchedTurnCompletions: 0,
      },
      transcriptEvents: [
        {
          type: "message",
          role: "user",
          content: "continue",
          timestamp: "2026-05-28T00:00:00.000Z",
        },
      ],
    });

    expect(plan.continuationPrompt).toBe("Continue from where you left off.");
    expect(plan.requiresAssistantSentinel).toBe(true);
  });
});
