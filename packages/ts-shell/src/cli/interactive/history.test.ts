import { describe, expect, it } from "vitest";
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { createShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { forgetSessionTodos, getSessionTodos, setSessionTodos } from "../../core/commands/todoCommandRuntime.js";
import { Transcript } from "../../presentation/tui/transcript/container.js";
import { restoreConversation, showConversation, startFreshSession } from "./history.js";
import { rewindPoints, rewindPicker } from "./picker/rewind.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";

let nextTurnId = 0;
/**
 * A recorded turn.
 *
 * Ids are part of what a recorded turn has: the loader always supplies one, so a
 * fixture without them would not be the shape the picker actually sees.
 */
function turn(role: SessionMessage["role"], content: string): SessionMessage {
  nextTurnId += 1;
  return {
    id: `turn_${nextTurnId}`,
    role,
    content,
    timestamp: "2026-09-02T00:00:00.000Z",
  } as SessionMessage;
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

  it("restores hook-blocked and cancelled tools with failed status", () => {
    const turns: SessionMessage[] = [
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_hook_1",
            type: "function",
            function: { name: "write", arguments: "{}" },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_hook_1",
        content: "Blocked by Hook: security verification rejected",
      },
    ];
    const { blocks } = restoreConversation(turns);
    expect(blocks[0]!.status).toBe("failed");
    expect(blocks[0]!.collapsed).toBe(false);
  });

  it("marks tool calls without any tool response as interrupted on resume", () => {
    const turns: SessionMessage[] = [
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_killed_1",
            type: "function",
            function: { name: "bash", arguments: JSON.stringify({ command: "long_job" }) },
          },
        ],
      },
      // No tool response recorded because process was killed
    ];
    const { blocks } = restoreConversation(turns);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.status).toBe("failed");
    expect(blocks[0]!.text).toBe("(Operation interrupted)");
    expect(blocks[0]!.collapsed).toBe(false);
  });
});

describe("showing a session", () => {
  it("restores the checklist of the session being shown", () => {
    // Every path that puts a conversation on screen goes through here — opening
    // a session, `/resume`, the sessions panel, a fork, a rewind — so this is
    // the one place that has to restore the checklist. Doing it per command is
    // how the band came to show one session's checklist while another was on
    // screen: the paths that forgot were the paths nobody listed.
    const turns = [
      { role: "tool", content: "Task added", metadata: { todo: [{ id: 1, text: "switch me", status: "pending" }] } },
    ] as unknown as SessionMessage[];
    const transcript = new Transcript();

    showConversation({
      transcript,
      sessionManager: {
        getSession: () => ({ id: "s-shown", turns } as never),
        createNew: () => ({ id: "new" } as never),
        discardIfEmpty: () => true,
      },
      context: { session: { id: "s-shown" } } as never,
    });

    expect(getSessionTodos("s-shown").map((item) => item.text)).toEqual(["switch me"]);
  });

  it("clears the checklist when a fresh session starts", () => {
    setSessionTodos("s-old", [{ id: 1, text: "from before", status: "pending" }]);
    const transcript = new Transcript();

    startFreshSession({
      transcript,
      sessionManager: {
        getSession: () => undefined,
        createNew: () => ({ id: "s-new", turns: [] } as never),
        discardIfEmpty: () => true,
      },
      context: createShellRuntimeContext({ cwd: '/p', originalCwd: '/p', projectRoot: '/p', targetPathBase: '/p', rootMode: 'direct', gitRoot: null,
        session: { id: 's-old', createdAt: 'now', updatedAt: 'now', status: 'active', turns: [] },
        runtimeConfig: getRuntimeConfig('/p'), gitContext: { insideGit: false, root: null, branch: null, isClean: null } }),
    });

    // Nothing of the discarded session's list is left for the new one to show.
    expect(getSessionTodos("s-new")).toEqual([]);
  });
});

describe("points to go back to", () => {
  it("offers the questions, newest first", () => {
    expect(rewindPoints(CONVERSATION).map((point) => point.prompt)).toEqual([
      "second question",
      "first question",
    ]);
  });

  it("counts what is left behind, not the question that stays", () => {
    // The chosen question goes back in the editor, so it is not part of what the
    // move costs. Counting it overstated every entry by one, which read as the
    // command doing more than it did.
    const [newest, older] = rewindPoints(CONVERSATION);

    // "second question" is followed by one answer; "first question" by four turns.
    expect(newest?.dropped).toBe(1);
    expect(older?.dropped).toBe(4);
  });

  it("has nothing to offer before a question is asked", () => {
    expect(rewindPoints([turn("system", "prompt")])).toEqual([]);
  });

  it("names the entry to make active, so the choice survives the turns moving", () => {
    const [newest] = rewindPoints(CONVERSATION);

    expect(CONVERSATION.find((t) => t.id === newest!.entryId)?.content).toBe("second question");
  });
});

describe("the record a move leaves behind", () => {
  it("describes what choosing an entry does, not what is lost", () => {
    // "Forgets one exchange" described the same thing but read as damage, and on
    // the newest question it read as nothing happening — which is what a user
    // saw when they picked the top of the list and found the screen unchanged.
    const [newest] = rewindPoints(CONVERSATION);
    const picker = rewindPicker({
      turns: CONVERSATION,
      rewind: async () => "note",
    });

    return picker.load().then((options) => {
      expect(options[0]?.detail).not.toMatch(/forget/i);
      expect(newest?.dropped).toBe(1);
      expect(options[0]?.detail).toContain("after this question");
    });
  });
});
