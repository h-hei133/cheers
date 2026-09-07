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

  it("restores tool cards with arguments and outputs from assistant tool_calls and tool results", () => {
    const turns: SessionMessage[] = [
      turn("user", "create files and run tests"),
      {
        role: "assistant",
        content: "I will write the file.",
        tool_calls: [
          {
            id: "call_write_1",
            type: "function",
            function: {
              name: "write",
              arguments: JSON.stringify({ path: "src/index.ts", content: "export const x = 1;" }),
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_write_1",
        content: "Success",
      },
      turn("assistant", "File created."),
    ];

    const { blocks } = restoreConversation(turns);
    expect(blocks).toHaveLength(4);
    expect(blocks.map((b) => b.kind)).toEqual(["user", "assistant", "tool", "assistant"]);

    const toolBlock = blocks[2]!;
    expect(toolBlock.kind).toBe("tool");
    expect(toolBlock.title).toBe("write");
    expect(toolBlock.detail).toBe("src/index.ts");
    expect(toolBlock.text).toBe("Success");
    expect(toolBlock.status).toBe("ok");
    expect(toolBlock.collapsed).toBe(true);
    expect(toolBlock.finalized).toBe(true);
  });

  it("restores failed or blocked tool cards with failed status and expanded state", () => {
    const turns: SessionMessage[] = [
      turn("user", "delete root"),
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_bash_1",
            type: "function",
            function: {
              name: "bash",
              arguments: JSON.stringify({ command: "rm -rf /" }),
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_bash_1",
        content: "Blocked: User denied permission for tool 'bash'",
      },
    ];

    const { blocks } = restoreConversation(turns);
    expect(blocks).toHaveLength(2);
    const toolBlock = blocks[1]!;
    expect(toolBlock.kind).toBe("tool");
    expect(toolBlock.status).toBe("failed");
    expect(toolBlock.collapsed).toBe(false);
    expect(toolBlock.text).toContain("Blocked: User denied permission");
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
