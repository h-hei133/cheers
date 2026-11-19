import { describe, expect, it } from "vitest";
import type { Session } from "../schema/sessionRecord.js";
import { prepareSessionUserPromptBarrier } from "./sessionPromptBarrier.js";

describe("sessionPromptBarrier", () => {
  it.each([false, true])("preserves image prompt content at the durable barrier (empty text=%s)", empty => {
    const prompt = empty ? "" : "  public image question\n";
    const image = { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" };
    const session: Session = { id: "sess_image", projectRoot: "/repo", createdAt: "2026-10-30T00:00:00.000Z",
      updatedAt: "2026-10-30T00:00:00.000Z", status: "error", turns: [] };
    const prepared = prepareSessionUserPromptBarrier({ session, prompt, images: [image], metadata: { originalInput: "public input" },
      timestamp: "2026-10-30T00:00:04.000Z" });
    const content = [{ type: "text", text: prompt }, image];
    expect(prepared.session.turns[0]).toMatchObject({ role: "user", content, metadata: { originalInput: "public input" } });
    expect(prepared.events[1]).toMatchObject({ type: "message", content, id: prepared.session.turns[0]!.id });
    expect(prepared.overrides.pendingPromptEntryId).toBe(prepared.session.turns[0]!.id);
    expect(prepared.session.pendingPrompt).toBe(prompt);
    expect(session.turns).toEqual([]);
    image.data = "later-mutated";
    expect(prepared.session.turns[0]!.content).toEqual([{ type: "text", text: prompt }, { type: "image", data: "aGVsbG8=", mimeType: "image/png" }]);
  });

  it("keeps an empty image collection as the original string content", () => {
    const session: Session = { id: "sess_plain", projectRoot: "/repo", createdAt: "2026-10-30T00:00:00.000Z",
      updatedAt: "2026-10-30T00:00:00.000Z", status: "completed", turns: [] };
    const prepared = prepareSessionUserPromptBarrier({ session, prompt: "  plain\n", images: [], timestamp: "2026-10-30T00:00:04.000Z" });
    expect(prepared.session.turns[0]!.content).toBe("  plain\n");
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
    const prepared = prepareSessionUserPromptBarrier({
      session,
      prompt: "continue",
      timestamp: "2026-05-28T00:00:04.000Z",
    });

    expect(prepared.session.status).toBe("active");
    expect(prepared.session.pendingPrompt).toBe("continue");
    expect(prepared.session.lastError).toBeUndefined();
    expect(prepared.session.turns).toEqual([
      expect.objectContaining({ role: "user", content: "continue" }),
    ]);
    expect(prepared.events.map((event) => event.type)).toEqual([
      "lifecycle",
      "message",
    ]);
    expect(prepared.events[0]).toMatchObject({ sourceEntryId: prepared.session.turns[0]!.id });
    expect(prepared.overrides.pendingPromptEntryId).toBe(prepared.session.turns[0]!.id);
    expect(prepared.overrides).toEqual(
      expect.objectContaining({
        runPhase: "prompt-persisted",
        terminalReason: undefined,
        terminalClassification: undefined,
      }),
    );
  });
});
