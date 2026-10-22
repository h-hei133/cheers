import { describe, expect, it } from "vitest";
import { CHARS_PER_TOKEN, DEFAULT_RESERVE_TOKENS, IMAGE_ESTIMATE_TOKENS, estimateRequestTokens, estimateTokens } from "./context.js";
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

  it("counts multimodal text blocks and gives each image a bounded allowance", () => {
    const text = "a".repeat(70_000);
    const textOnly = estimateTokens([{ role: "user", content: [{ type: "text", text }] }]);
    const withImage = estimateTokens([{ role: "user", content: [
      { type: "text", text },
      { type: "image", data: "c3ludGhldGlj", mimeType: "image/png" },
    ] }]);
    expect(textOnly).toBe(Math.ceil(text.length / CHARS_PER_TOKEN));
    expect(withImage).toBe(textOnly + IMAGE_ESTIMATE_TOKENS);
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

describe("estimateRequestTokens", () => {
  const conversation = [userMessage("a".repeat(350))];

  it("adds the instruction and the tool declarations to the conversation", () => {
    // These travel as their own request parameters, so an estimate built from
    // messages alone cannot see them. On a cold start they are most of what the
    // request holds — thirteen tool declarations run to thousands of characters
    // — and the number decides whether to compact.
    const withOverhead = estimateRequestTokens(conversation, {
      systemPrompt: "a".repeat(350),
      tools: [{ name: "read", parameters: { type: "object" } }],
    });

    expect(estimateTokens(conversation)).toBe(100);
    expect(withOverhead).toBeGreaterThan(100);
  });

  it("counts the tool declarations as they are sent", () => {
    const tools = [{ name: "read", description: "read a file" }];
    const expected = 100 + Math.ceil(JSON.stringify(tools).length / CHARS_PER_TOKEN);

    expect(estimateRequestTokens(conversation, { tools })).toBe(expected);
  });

  it("counts nothing extra when there is no overhead", () => {
    expect(estimateRequestTokens(conversation, undefined)).toBe(estimateTokens(conversation));
    expect(estimateRequestTokens(conversation, {})).toBe(estimateTokens(conversation));
    expect(estimateRequestTokens(conversation, { tools: [] })).toBe(estimateTokens(conversation));
  });

  it("rounds once over the whole request rather than per part", () => {
    // Rounding each part and adding would lose up to a token per part, and the
    // total is what the threshold is compared against.
    const messages = [userMessage("a".repeat(7))];
    const overhead = { systemPrompt: "a".repeat(7) };
    const chars = 14;

    expect(estimateRequestTokens(messages, overhead)).toBe(Math.ceil(chars / CHARS_PER_TOKEN));
  });
});
