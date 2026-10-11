import { describe, expect, it, vi } from "vitest";
import { getSessionTodos, replayTodosFromMessages, runTodoCommand, setSessionTodos } from "../todoCommandRuntime.js";
import { TODO_LIMITS, parseTodoDocument, serializeTodos } from "./model.js";
import type { CommandContext } from "../types.js";

describe("todo mutations and transfer", () => {
  it("journals edits, abandonment and removal while checking done grants no goal authority", async () => {
    const context = { cwd: "/workspace", sessionId: "todo-operations" };
    const results = [];
    results.push(await runTodoCommand(["append", "review", "source"], context));
    results.push(await runTodoCommand(["edit", "1", "review", "current", "source"], context));
    results.push(await runTodoCommand(["start", "1"], context));
    const done = await runTodoCommand(["done", "1"], context);
    expect(done.state).toEqual({ todo: [{ id: 1, text: "review current source", status: "done" }] });
    expect(done.output).toContain("separate acceptance evidence");
    results.push(done);
    results.push(await runTodoCommand(["drop", "1"], context));
    expect(getSessionTodos(context.sessionId)[0]!.status).toBe("dropped");
    const messages = results.map((result) => ({ role: "user", content: result.output, metadata: result.state }));
    setSessionTodos(context.sessionId, []);
    replayTodosFromMessages(context.sessionId, messages as never);
    expect(getSessionTodos(context.sessionId)).toEqual([{ id: 1, text: "review current source", status: "dropped" }]);
    const removed = await runTodoCommand(["rm", "1"], context);
    expect(removed.state).toEqual({ todo: [] });
  });

  it("exports exact schema through the effect port and preserves denied outcomes", async () => {
    const write = vi.fn().mockResolvedValue({ outcome: "denied", reason: "File approval denied." });
    const context: CommandContext = { cwd: "/workspace", sessionId: "todo-export", dataTransfer: { read: vi.fn(), write } };
    setSessionTodos(context.sessionId!, [{ id: 4, text: "compare source", status: "pending" }]);
    const result = await runTodoCommand(["export", "TODO.json"], context);
    expect(write).toHaveBeenCalledWith({ path: "TODO.json", content: serializeTodos(getSessionTodos(context.sessionId)) });
    expect(result.output).toContain("outcome: denied");
    expect(result.state).toBeUndefined();
    expect(await runTodoCommand(["copy"], context)).toMatchObject({ output: expect.stringContaining("Clipboard unavailable") });
  });

  it("validates the complete import before replacing the list and rejects races", async () => {
    const old = [{ id: 1, text: "keep", status: "pending" as const }];
    const imported = serializeTodos([{ id: 9, text: "imported", status: "in_progress" }]);
    const read = vi.fn().mockResolvedValue({ outcome: "read", content: imported });
    const context: CommandContext = { cwd: "/workspace", sessionId: "todo-import", dataTransfer: { read, write: vi.fn() } };
    setSessionTodos(context.sessionId!, old);
    const result = await runTodoCommand(["import", "TODO.json"], context);
    expect(read).toHaveBeenCalledWith({ path: "TODO.json", maxBytes: TODO_LIMITS.bytes });
    expect(result.state).toEqual({ todo: [{ id: 9, text: "imported", status: "in_progress" }] });
    read.mockResolvedValueOnce({ outcome: "read", content: '{"kind":"session-todo","version":1,"items":[{"id":2,"text":"bad","status":"finished"}]}' });
    expect((await runTodoCommand(["import", "TODO.json"], context)).output).toContain("blocked");
    expect(getSessionTodos(context.sessionId)[0]!.id).toBe(9);
    read.mockImplementationOnce(async () => {
      await runTodoCommand(["append", "newer"], context);
      return { outcome: "read", content: imported };
    });
    expect((await runTodoCommand(["import", "TODO.json"], context)).output).toContain("changed during import");
    expect(getSessionTodos(context.sessionId).map((item) => item.text)).toEqual(["imported", "newer"]);
  });

  it("rejects unknown versions, duplicate IDs, excess bytes and invalid replay IDs", () => {
    expect(() => parseTodoDocument('{"kind":"session-todo","version":2,"items":[]}')).toThrow();
    expect(() => parseTodoDocument(serializeTodos([{ id: 1, text: "a", status: "pending" }, { id: 1, text: "b", status: "done" }]))).toThrow();
    expect(() => parseTodoDocument(" ".repeat(TODO_LIMITS.bytes + 1))).toThrow();
    setSessionTodos("todo-malformed", [{ id: 1, text: "valid", status: "pending" }]);
    replayTodosFromMessages("todo-malformed", [{ role: "user", content: "broken", metadata: { todo: [{ id: 1.5, text: "bad", status: "done" }] } }] as never);
    expect(getSessionTodos("todo-malformed")[0]!.text).toBe("valid");
  });
});
