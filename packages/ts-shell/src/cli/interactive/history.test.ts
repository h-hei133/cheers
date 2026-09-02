import { describe, expect, it } from "vitest";
import { restoreConversation } from "./history.js";
import { rewindPoints } from "./picker/rewind.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";

function turn(role: SessionMessage["role"], content: string): SessionMessage {
  return { role, content, timestamp: "2026-09-02T00:00:00.000Z" } as SessionMessage;
}

const CONVERSATION = [
  turn("system", "you are an agent"),
  turn("user", "first question"),
  turn("assistant", "first answer"),
  turn("tool", "some tool output"),
  turn("user", "second question"),
  turn("assistant", "second answer"),
];

describe("restoring a conversation", () => {
  it("rebuilds what was said, in order", () => {
    const { blocks } = restoreConversation(CONVERSATION);

    expect(blocks.map((block) => block.kind)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(blocks.map((block) => block.text)).toEqual([
      "first question",
      "first answer",
      "second question",
      "second answer",
    ]);
  });

  it("leaves out system and tool turns, which are not the conversation", () => {
    expect(restoreConversation(CONVERSATION).blocks).toHaveLength(4);
  });

  it("restores nothing from a session where nothing was said", () => {
    expect(restoreConversation([turn("system", "prompt")]).blocks).toEqual([]);
  });

  it("bounds a long history and says how much it left out", () => {
    const long = Array.from({ length: 200 }, (_, index) => turn("user", `q${index}`));
    const restored = restoreConversation(long);

    expect(restored.blocks).toHaveLength(60);
    expect(restored.omitted).toBe(140);
    expect(restored.blocks.at(-1)?.text).toBe("q199");
  });

  it("marks restored blocks as finished, so they can retire", () => {
    for (const block of restoreConversation(CONVERSATION).blocks) {
      expect(block.finalized).toBe(true);
    }
  });
});

describe("points to go back to", () => {
  it("offers the questions, newest first", () => {
    expect(rewindPoints(CONVERSATION).map((point) => point.prompt)).toEqual([
      "second question",
      "first question",
    ]);
  });

  it("says how many turns going back would drop", () => {
    const [newest, older] = rewindPoints(CONVERSATION);

    expect(newest?.dropped).toBe(2);
    expect(older?.dropped).toBe(5);
  });

  it("has nothing to offer before a question is asked", () => {
    expect(rewindPoints([turn("system", "prompt")])).toEqual([]);
  });

  it("keeps the index that says where to cut", () => {
    const [newest] = rewindPoints(CONVERSATION);

    expect(CONVERSATION[newest!.turnIndex]?.content).toBe("second question");
  });
});
