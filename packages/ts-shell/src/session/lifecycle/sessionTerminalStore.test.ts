import { describe, expect, it } from "vitest";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshotOverrides } from "../schema/sessionStateSnapshot.js";
import { saveSessionCompleted, saveSessionError } from "./sessionTerminalStore.js";

function createSession(): Session {
  return {
    id: "sess_terminal",
    projectRoot: "/repo",
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
    status: "active",
    turns: [],
    pendingPrompt: "prompt",
    lastError: "old",
  };
}

describe("sessionTerminalStore", () => {
  it("defaults completed terminal persistence to success only for completed saves", () => {
    const session = createSession();
    const states: SessionStateSnapshotOverrides[] = [];

    saveSessionCompleted(
      {
        loadSession: () => session,
        appendTranscriptEvent: () => undefined,
        writeSessionMetadata: () => undefined,
        writeSessionState: (_nextSession, overrides) => states.push(overrides ?? {}),
        now: () => "2026-05-28T00:00:05.000Z",
      },
      session.id,
    );

    expect(session.status).toBe("completed");
    expect(session.pendingPrompt).toBeUndefined();
    expect(session.lastError).toBeUndefined();
    expect(states[0]).toEqual(
      expect.objectContaining({
        runPhase: "idle",
        terminalReason: "completed",
        terminalClassification: "success",
      }),
    );
  });

  it("does not preserve lastError for stopped terminal classification", () => {
    const session = createSession();
    const states: SessionStateSnapshotOverrides[] = [];

    saveSessionError(
      {
        loadSession: () => session,
        appendTranscriptEvent: () => undefined,
        writeSessionMetadata: () => undefined,
        writeSessionState: (_nextSession, overrides) => states.push(overrides ?? {}),
        now: () => "2026-05-28T00:00:06.000Z",
      },
      session.id,
      "user stopped",
      { terminalClassification: "stopped", terminalReason: "stopped_error" },
    );

    expect(session.status).toBe("error");
    expect(session.lastError).toBeUndefined();
    expect(states[0]).toEqual(
      expect.objectContaining({
        terminalReason: "stopped_error",
        terminalClassification: "stopped",
      }),
    );
  });
});
