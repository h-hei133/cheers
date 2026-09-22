import { describe, it, expect } from "vitest";
import { reconcileDanglingToolCalls } from "./sessionReconciler.js";
import type { SessionMessage } from "../schema/sessionMessage.js";

describe("reconcileDanglingToolCalls", () => {
  it("returns empty array for empty input", () => {
    expect(reconcileDanglingToolCalls([])).toEqual([]);
  });

  it("leaves clean conversations untouched", () => {
    const messages: SessionMessage[] = [
      { role: "user", content: "Hello" },
      {
        role: "assistant",
        content: "Running tool",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "read", arguments: '{"path":"file.ts"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "file content" },
      { role: "assistant", content: "Done" },
    ];

    const reconciled = reconcileDanglingToolCalls(messages);
    expect(reconciled.length).toBe(4);
    expect(reconciled).toEqual(messages);
  });

  it("reconciles dangling tool calls caused by crash or SIGINT", () => {
    const messages: SessionMessage[] = [
      { role: "user", content: "Run long bash task" },
      {
        role: "assistant",
        content: "Executing command",
        tool_calls: [
          {
            id: "call_bash_1",
            type: "function",
            function: { name: "bash", arguments: '{"command":"sleep 100"}' },
          },
        ],
      },
      // Process crashed or user sent SIGINT before tool returned result
    ];

    const reconciled = reconcileDanglingToolCalls(messages);
    expect(reconciled.length).toBe(3);
    expect(reconciled[2].role).toBe("tool");
    expect(reconciled[2].tool_call_id).toBe("call_bash_1");
    expect(reconciled[2].content).toContain("interrupted by process termination");
  });
});
