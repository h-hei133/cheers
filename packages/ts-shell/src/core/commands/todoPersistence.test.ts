import { describe, expect, it } from "vitest";
import { createToolResultMessage } from "../agent/tools.js";
import {
  createMessageTranscriptEvent,
  transcriptEventToSessionMessage,
} from "../../session/sessionEventCodec.js";
import { createTodoToolDefinition } from "../tools/todoTool.js";
import {
  getSessionTodos,
  replayTodosFromMessages,
  runTodoCommand,
  setSessionTodos,
} from "./todoCommandRuntime.js";

/**
 * The checklist is part of what a session carries, so the tests are about the
 * chain that makes it survive: the tool records its state beside its prose, the
 * prose and the state both reach the transcript and come back, and replaying
 * the turns restores the list — including on a branch that saw fewer turns.
 *
 * The single process-wide list is gone, so two sessions holding different
 * checklists is the first thing checked: it was the defect that made the map
 * necessary.
 */

const context = (sessionId: string) =>
  ({ workspaceRoot: "/workspace", sessionId, taskId: "task-1" }) as never;

describe("the todo checklist per session", () => {
  it("keeps two sessions' lists apart", async () => {
    await runTodoCommand(["add", "mine"], context("s-one"), "s-one");
    await runTodoCommand(["add", "yours"], context("s-two"), "s-two");

    expect(getSessionTodos("s-one").map((item) => item.text)).toEqual(["mine"]);
    expect(getSessionTodos("s-two").map((item) => item.text)).toEqual(["yours"]);
  });

  it("reads as empty when no session is active rather than throwing", () => {
    // The status band asks on every frame, and a reader with no session yet
    // has nothing to show and no error worth raising.
    expect(getSessionTodos()).toEqual([]);
    expect(getSessionTodos("never-seen")).toEqual([]);
  });

  it("carries the list beside the prose so the record can restore it", async () => {
    const tool = createTodoToolDefinition();
    const result = await tool.execute({ action: "add", task: "recorded" }, context("s-record"));

    expect(result.success).toBe(true);
    const recorded = (result.metadata?.todo as readonly { text: string }[] | undefined) ?? [];
    expect(recorded.map((item) => item.text)).toEqual(["recorded"]);
  });

  it("survives the message -> transcript event -> message round trip", () => {
    const message = createToolResultMessage("call_1", "Task added", {
      todo: [{ id: 1, text: "recorded", status: "pending" }],
    });
    const event = createMessageTranscriptEvent({ ...message, timestamp: "2026-01-01T00:00:00Z" });
    const back = transcriptEventToSessionMessage(event);

    // Losing it here would mean a resumed session replayed nothing, which is
    // indistinguishable from a session that never had a checklist.
    expect((event as { metadata?: unknown }).metadata).toMatchObject({
      todo: [{ id: 1, text: "recorded", status: "pending" }],
    });
    expect((back as { metadata?: unknown }).metadata).toMatchObject({
      todo: [{ id: 1, text: "recorded", status: "pending" }],
    });
  });

  it("replays the turns that changed the list, so a rewind sees the branch's own state", async () => {
    await runTodoCommand(["add", "first"], context("s-branch"), "s-branch");
    await runTodoCommand(["add", "second"], context("s-branch"), "s-branch");
    await runTodoCommand(["done", "1"], context("s-branch"), "s-branch");
    expect(getSessionTodos("s-branch").map((item) => [item.text, item.status])).toEqual([
      ["first", "done"],
      ["second", "pending"],
    ]);

    // Rewinding drops the later turns; the list the branch sees is the list as
    // of the turn it rewound to. This is the assertion a snapshot cannot pass:
    // a snapshot answers with the newest state anywhere.
    replayTodosFromMessages("s-branch", [
      {
        role: "tool",
        content: "Task added",
        metadata: { todo: [{ id: 1, text: "first", status: "pending" }] },
      },
    ] as never);
    expect(getSessionTodos("s-branch").map((item) => [item.text, item.status])).toEqual([
      ["first", "pending"],
    ]);
  });

  it("restores an empty list when the turns record one was cleared", () => {
    setSessionTodos("s-clear", [{ id: 1, text: "stale", status: "pending" }]);

    replayTodosFromMessages("s-clear", [
      { role: "tool", content: "Todo checklist cleared.", metadata: { todo: [] } },
    ] as never);

    expect(getSessionTodos("s-clear")).toEqual([]);
  });

  it("leaves the list alone when the turns say nothing about it", () => {
    setSessionTodos("s-untouched", [{ id: 1, text: "keeps", status: "pending" }]);

    replayTodosFromMessages("s-untouched", [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ] as never);

    expect(getSessionTodos("s-untouched").map((item) => item.text)).toEqual(["keeps"]);
  });

  it("ignores a malformed record rather than adopting it", () => {
    setSessionTodos("s-malformed", [{ id: 1, text: "real", status: "pending" }]);

    replayTodosFromMessages("s-malformed", [
      {
        role: "tool",
        content: "task",
        // A hand-edited transcript can carry anything; adopting a shape the
        // type does not recognize would put junk in the band.
        metadata: { todo: [{ id: "one", text: 2, status: "maybe" }] },
      },
    ] as never);

    expect(getSessionTodos("s-malformed").map((item) => item.text)).toEqual(["real"]);
  });
});
