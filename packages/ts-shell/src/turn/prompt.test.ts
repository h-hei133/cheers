import { describe, expect, it } from "vitest";
import { toChatMessages } from "./prompt.js";

describe("toChatMessages", () => {
  it("synthesizes cancelled tool messages when assistant tool calls were interrupted", () => {
    const converted = toChatMessages([
      { role: "user", content: "run it" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "call_1", type: "function", function: { name: "bash", arguments: "{}" } }],
      },
      { role: "user", content: "never mind" },
    ]);
    expect(converted.map((message) => message.role)).toEqual(["user", "assistant", "tool", "user"]);
    expect(converted[2]).toMatchObject({ tool_call_id: "call_1", content: "(Operation cancelled or interrupted)" });
  });

  it("drops orphaned tool messages that have no preceding assistant tool call", () => {
    const converted = toChatMessages([
      { role: "tool", tool_call_id: "ghost", content: "??" },
      { role: "user", content: "hello" },
    ]);
    expect(converted).toEqual([{ role: "user", content: "hello" }]);
  });

  it("gives an assistant message with no calls a string body rather than null", () => {
    const converted = toChatMessages([{ role: "assistant", content: "" }]);
    expect(converted[0].content).toBe("");
  });

  it("closes calls left open at the end of the history", () => {
    const converted = toChatMessages([
      { role: "assistant", content: "", tool_calls: [{ id: "c", type: "function", function: { name: "read", arguments: "{}" } }] },
    ]);
    expect(converted.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c" });
  });
});
