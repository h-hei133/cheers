import { describe, expect, it } from "vitest";
import { createEmptyLifecycleIndex } from "../core/tools/toolResultLifecycle.js";
import type { AgentExecutionOutput } from "../orchestration/types.js";
import type { RecoverySnapshot, TranscriptEvent } from "./SessionManager.js";
import {
  buildReplayTurnPairingState,
  buildResumeReplayInput,
  buildSessionReplayPlan,
  normalizeReplayTranscriptEvents,
  prepareReplayTranscript,
  projectReplayMessages,
} from "./sessionReplayBuilder.js";

describe("session replay builder", () => {
  it("repairs interrupted replay transcript without changing event order", () => {
    const events: TranscriptEvent[] = [
      {
        type: "lifecycle",
        event: "run-started",
        timestamp: "2026-05-13T00:00:00.000Z",
      },
      {
        type: "query-event",
        event: {
          type: "turn.started",
          role: "planner",
          turn: 1,
        },
        timestamp: "2026-05-13T00:00:02.000Z",
      },
      {
        type: "query-event",
        event: {
          type: "query.completed",
          result: {
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_replay",
              initialPrompt: "update src/a.ts",
              notes: [],
              handoffs: [],
            },
            finalOutput: "done",
          },
        },
        timestamp: "2026-05-13T00:00:03.000Z",
      },
    ];

    const repaired = prepareReplayTranscript(events, {
      sessionId: "sess_replay",
      state: { status: "interrupted", runPhase: "turn-active" },
      pendingPrompt: "update src/a.ts",
      updatedAt: "2026-05-13T00:01:00.000Z",
    });

    expect(repaired.repairSummary).toMatchObject({
      insertedPromptMessage: true,
      insertedQueryStarted: true,
      strippedInterruptedTerminalEvents: 1,
      insertedRunInterrupted: true,
    });
    expect(
      repaired.transcriptEvents.map((event) =>
        event.type === "query-event" ? event.event.type : event.type,
      ),
    ).toEqual(["lifecycle", "message", "query.started", "turn.started", "lifecycle"]);
    expect(projectReplayMessages(repaired.transcriptEvents)).toEqual([
      {
        role: "user",
        content: "update src/a.ts",
        timestamp: "2026-05-13T00:01:00.001Z",
      },
    ]);
  });

  it("builds completed-turn resume input with derived transcript in replay order", () => {
    const plannerOutput = makeOutput("planner", "plan", "coder");
    const coderOutput = makeOutput("coder", "patch ready");
    const snapshot = makeSnapshot([
      turnStarted("planner", 1),
      turnCompleted(plannerOutput),
      turnStarted("coder", 2),
      turnCompleted(coderOutput),
    ]);

    const seed = buildResumeReplayInput({
      sessionId: "sess_replay",
      snapshot,
      options: { maxTurns: 6 },
    });

    expect(seed.config).toMatchObject({
      sessionId: "sess_replay",
      initialPrompt: "update src/a.ts",
      maxTurns: 6,
      startingRole: "planner",
    });
    expect(seed.recoveryBoundary).toBe("completed-turn-reentry");
    expect(seed.currentRole).toBe("planner");
    expect(seed.turn).toBe(3);
    expect(seed.derivedState.transcript).toEqual([plannerOutput, coderOutput]);
    expect(seed.truthBoundary.pairedTurnCount).toBe(2);
  });

  it("downgrades unsafe replay to fresh entry when turn pairing drifts", () => {
    const snapshot = makeSnapshot([
      turnStarted("planner", 1),
      turnStarted("coder", 1),
      turnCompleted(makeOutput("planner", "plan")),
    ]);

    const seed = buildResumeReplayInput({
      sessionId: "sess_replay",
      snapshot,
    });

    expect(seed.recoveryBoundary).toBe("fresh-entry");
    expect(seed.currentRole).toBe("planner");
    expect(seed.turn).toBe(1);
    expect(seed.derivedState.transcript).toEqual([]);
    expect(seed.truthBoundary.repairSummary.ignoredDuplicateTurnStarts).toBe(1);
  });

  it("projects replay plan messages and repair counters from the same pairing logic", () => {
    const snapshot = makeSnapshot([
      {
        type: "message",
        role: "assistant",
        content: "",
        timestamp: "2026-05-13T00:00:00.000Z",
      },
      {
        type: "message",
        role: "user",
        content: "continue",
        timestamp: "2026-05-13T00:00:01.000Z",
      },
      turnCompleted(makeOutput("coder", "orphan")),
    ]);
    const normalized = normalizeReplayTranscriptEvents(snapshot.transcriptEvents);

    const plan = buildSessionReplayPlan({
      ...snapshot,
      transcriptEvents: normalized,
    });
    const pairing = buildReplayTurnPairingState(normalized);

    expect(plan.replayMessages).toEqual([
      {
        role: "user",
        content: "continue",
        timestamp: "2026-05-13T00:00:01.000Z",
      },
    ]);
    expect(plan.requiresAssistantSentinel).toBe(true);
    expect(plan.repairSummary.ignoredUnpairedTurnCompletions).toBe(1);
    expect(pairing.ignoredUnpairedTurnCompletions).toBe(1);
  });
});

function makeSnapshot(
  transcriptEvents: readonly TranscriptEvent[],
): RecoverySnapshot {
  return {
    pendingPrompt: "update src/a.ts",
    runPhase: "turn-active",
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
    lastUserMessage: {
      role: "user",
      content: "update src/a.ts",
      timestamp: "2026-05-13T00:00:00.000Z",
    },
    transcriptEvents: [...transcriptEvents],
  };
}

function turnStarted(
  role: "planner" | "coder" | "reviewer",
  turn: number,
): TranscriptEvent {
  return {
    type: "query-event",
    event: { type: "turn.started", role, turn },
    timestamp: "2026-05-13T00:00:01.000Z",
  };
}

function turnCompleted(output: AgentExecutionOutput): TranscriptEvent {
  return {
    type: "query-event",
    event: { type: "turn.completed", output },
    timestamp: "2026-05-13T00:00:02.000Z",
  };
}

function makeOutput(
  role: "planner" | "coder" | "reviewer",
  content: string,
  handoffTo?: "planner" | "coder" | "reviewer",
): AgentExecutionOutput {
  return {
    role,
    content,
    ...(handoffTo ? { handoffTo, handoffReason: "next" } : {}),
  };
}
