import { describe, expect, it } from "vitest";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshotOverrides } from "../schema/sessionStateSnapshot.js";
import { persistSessionUserPromptBarrier } from "./sessionPromptBarrier.js";

describe("sessionPromptBarrier", () => {
  it.each([false, true])("preserves image prompt content at the durable barrier (empty text=%s)", empty => {
    const prompt = empty ? "" : "  public image question\n";
    const image = { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" };
    const session: Session = { id: "sess_image", projectRoot: "/repo", createdAt: "2026-10-30T00:00:00.000Z",
      updatedAt: "2026-10-30T00:00:00.000Z", status: "error", turns: [] };
    const transcript: TranscriptEvent[] = [], states: SessionStateSnapshotOverrides[] = [];
    persistSessionUserPromptBarrier({ session, prompt, images: [image], metadata: { originalInput: "public input" },
      timestamp: "2026-10-30T00:00:04.000Z", appendTranscriptEvent: event => transcript.push(event),
      writeSessionMetadata: () => undefined, writeSessionState: (_session, state) => states.push(state ?? {}) });
    const content = [{ type: "text", text: prompt }, image];
    expect(session.turns[0]).toMatchObject({ role: "user", content, metadata: { originalInput: "public input" } });
    expect(transcript[1]).toMatchObject({ type: "message", content, id: session.turns[0]!.id });
    expect(states[0]?.pendingPromptEntryId).toBe(session.turns[0]!.id);
    expect(session.pendingPrompt).toBe(prompt);
    image.data = "later-mutated";
    expect(session.turns[0]!.content).toEqual([{ type: "text", text: prompt }, { type: "image", data: "aGVsbG8=", mimeType: "image/png" }]);
  });

  it("keeps an empty image collection as the original string content", () => {
    const session: Session = { id: "sess_plain", projectRoot: "/repo", createdAt: "2026-10-30T00:00:00.000Z",
      updatedAt: "2026-10-30T00:00:00.000Z", status: "completed", turns: [] };
    persistSessionUserPromptBarrier({ session, prompt: "  plain\n", images: [], timestamp: "2026-10-30T00:00:04.000Z",
      appendTranscriptEvent: () => undefined, writeSessionMetadata: () => undefined, writeSessionState: () => undefined });
    expect(session.turns[0]!.content).toBe("  plain\n");
  });

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
