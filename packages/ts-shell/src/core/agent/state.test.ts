import { describe, expect, it } from "vitest";
import { createAgentState } from "./state.js";

describe("createAgentState", () => {
  it("starts idle with an empty transcript", () => {
    const state = createAgentState();
    expect(state.systemPrompt).toBe("");
    expect(state.messages).toEqual([]);
    expect(state.isStreaming).toBe(false);
    expect(state.streamingMessage).toBeUndefined();
    expect(state.pendingToolCalls.size).toBe(0);
    expect(state.errorMessage).toBeUndefined();
  });

  it("seeds the system prompt and transcript from the initial state", () => {
    const state = createAgentState({
      systemPrompt: "Be concise.",
      messages: [{ role: "user", content: "hello" }],
    });
    expect(state.systemPrompt).toBe("Be concise.");
    expect(state.messages).toEqual([{ role: "user", content: "hello" }]);
  });

  it("copies the seed transcript so later caller mutation cannot leak in", () => {
    const seed = [{ role: "user" as const, content: "hello" }];
    const state = createAgentState({ messages: seed });
    seed.push({ role: "user", content: "forged" });
    expect(state.messages).toHaveLength(1);
  });
});
