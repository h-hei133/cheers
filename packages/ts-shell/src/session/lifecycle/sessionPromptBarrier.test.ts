import { describe, expect, it } from "vitest";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshotOverrides } from "../schema/sessionStateSnapshot.js";
import { persistSessionUserPromptBarrier } from "./sessionPromptBarrier.js";

describe("sessionPromptBarrier", () => {
  it("appends run-started before the user prompt and persists prompt phase", () => {
    const session: Session = {
      id: "sess_prompt",
      projectRoot: "/repo",
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z",
      status: "error",
      turns: [],
      lastError: "previous",
    };
    const transcript: TranscriptEvent[] = [];
    const states: SessionStateSnapshotOverrides[] = [];

    persistSessionUserPromptBarrier({
      session,
      prompt: "continue",
      timestamp: "2026-05-28T00:00:04.000Z",
      appendTranscriptEvent: (event) => transcript.push(event),
      writeSessionMetadata: () => undefined,
      writeSessionState: (_nextSession, overrides) => states.push(overrides ?? {}),
    });

    expect(session.status).toBe("active");
    expect(session.pendingPrompt).toBe("continue");
    expect(session.lastError).toBeUndefined();
    expect(session.turns).toEqual([
      expect.objectContaining({ role: "user", content: "continue" }),
    ]);
    expect(transcript.map((event) => event.type)).toEqual([
      "lifecycle",
      "message",
    ]);
    expect(transcript[0]).toMatchObject({ sourceEntryId: session.turns[0]!.id });
    expect(states[0]?.pendingPromptEntryId).toBe(session.turns[0]!.id);
    expect(states[0]).toEqual(
      expect.objectContaining({
        runPhase: "prompt-persisted",
        terminalReason: undefined,
        terminalClassification: undefined,
      }),
    );
  });
});
