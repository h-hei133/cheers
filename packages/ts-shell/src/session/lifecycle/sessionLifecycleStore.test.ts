import { describe, expect, it } from "vitest";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshotOverrides } from "../schema/sessionStateSnapshot.js";
import {
  markSessionRecoveryReentry,
  markSessionRunStarted,
  saveSessionInterrupted,
} from "./sessionLifecycleStore.js";

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess_lifecycle",
    projectRoot: "/repo",
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
    status: "completed",
    turns: [],
    ...overrides,
  };
}

describe("sessionLifecycleStore", () => {
  it("marks a run started without preserving terminal success state", () => {
    const session = createSession({ lastError: "old", pendingPrompt: "old" });
    const transcript: TranscriptEvent[] = [];
    const states: SessionStateSnapshotOverrides[] = [];

    markSessionRunStarted(
      {
        loadSession: () => session,
        appendTranscriptEvent: (_sessionId, event) => transcript.push(event),
        writeSessionMetadata: () => undefined,
        writeSessionState: (_nextSession, overrides) => states.push(overrides ?? {}),
        now: () => "2026-05-28T00:00:01.000Z",
      },
      session.id,
      "fix it",
    );

    expect(session).toEqual(
      expect.objectContaining({
        status: "active",
        pendingPrompt: "fix it",
        updatedAt: "2026-05-28T00:00:01.000Z",
      }),
    );
    expect(session.lastError).toBeUndefined();
    expect(transcript).toEqual([
      expect.objectContaining({
        type: "lifecycle",
        event: "run-started",
        detail: "fix it",
      }),
    ]);
    expect(states[0]).toEqual(
      expect.objectContaining({
        terminalReason: undefined,
        terminalClassification: undefined,
        lastContinuationReason: undefined,
        pendingLifecycle: expect.objectContaining({
          pendingApprovals: {},
          pendingTools: {},
        }),
      }),
    );
  });

  it("preserves recovery boundary distinction when marking reentry", () => {
    const session = createSession({ lastError: "old" });
    const states: SessionStateSnapshotOverrides[] = [];

    markSessionRecoveryReentry(
      {
        loadSession: () => session,
        appendTranscriptEvent: () => undefined,
        writeSessionMetadata: () => undefined,
        writeSessionState: (_nextSession, overrides) => states.push(overrides ?? {}),
        now: () => "2026-05-28T00:00:02.000Z",
      },
      session.id,
      "mid-turn-reentry",
    );

    expect(session.status).toBe("active");
    expect(session.lastError).toBeUndefined();
    expect(states[0]).toEqual(
      expect.objectContaining({
        runPhase: "turn-active",
        interruptedKind: "turn",
      }),
    );
  });

  it("saves interrupted state without adding success-like terminal fields", () => {
    const session = createSession({ pendingPrompt: "continue" });
    const states: SessionStateSnapshotOverrides[] = [];

    saveSessionInterrupted(
      {
        loadSession: () => session,
        appendTranscriptEvent: () => undefined,
        writeSessionMetadata: () => undefined,
        writeSessionState: (_nextSession, overrides) => states.push(overrides ?? {}),
        now: () => "2026-05-28T00:00:03.000Z",
      },
      session.id,
      "prompt",
    );

    expect(session.status).toBe("interrupted");
    expect(states[0]).toEqual(
      expect.objectContaining({
        interruptedKind: "prompt",
        terminalReason: undefined,
        terminalClassification: undefined,
      }),
    );
  });
});
