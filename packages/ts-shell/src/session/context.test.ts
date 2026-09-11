import { describe, expect, it } from "vitest";
import { CHARS_PER_TOKEN, DEFAULT_RESERVE_TOKENS, estimateTokens } from "./context.js";
import type { AgentMessage } from "../core/agent/state.js";

function userMessage(content: string): AgentMessage {
  return { role: "user", content };
}

describe("estimateTokens", () => {
  it("returns zero for an empty transcript", () => {
    expect(estimateTokens([])).toBe(0);
  });

  it("uses the shared chars-per-token ratio over content", () => {
    expect(CHARS_PER_TOKEN).toBe(3.5);
    expect(estimateTokens([userMessage("a".repeat(35))])).toBe(10);
    expect(estimateTokens([userMessage("a".repeat(36))])).toBe(11);
  });

  it("counts tool call arguments alongside prose", () => {
    const plain = estimateTokens([userMessage("hello")]);
    const withCall = estimateTokens([
      {
        role: "assistant",
        content: "hello",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "read", arguments: JSON.stringify({ path: "some/file.txt" }) },
          },
        ],
      },
    ]);
    expect(withCall).toBeGreaterThan(plain);
  });

  it("counts tool result linkage alongside content", () => {
    const plain = estimateTokens([{ role: "tool", content: "ok" }]);
    const linked = estimateTokens([{ role: "tool", tool_call_id: "call-1", content: "ok" }]);
    expect(linked).toBeGreaterThan(plain);
  });

  it("treats missing content as empty", () => {
    expect(estimateTokens([{ role: "assistant", content: "" }])).toBe(0);
  });
});

describe("defaults", () => {
  it("reserves headroom for the next response", () => {
    expect(DEFAULT_RESERVE_TOKENS).toBeGreaterThan(0);
  });
});
