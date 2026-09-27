import { describe, expect, it } from "vitest";
import { endpointShape } from "./index.js";

describe("github copilot request headers", () => {
  it("adds gateway identity and initiator headers for a Copilot turn", () => {
    const shape = endpointShape("openai-compatible");
    const headers = shape.requestHeaders?.({
      model: "gpt-4.1",
      provider: "github-copilot",
      systemPrompt: "system",
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      allowTools: true,
      vision: false,
      temperature: 0.7,
      systemRole: "system",
      reasoningEffort: false,
      maxTokensField: "max_tokens",
      assistantAfterToolResult: false,
    });

    expect(headers).toMatchObject({
      "Editor-Version": expect.any(String),
      "Copilot-Integration-Id": "vscode-chat",
      "User-Agent": expect.stringContaining("GitHubCopilotChat"),
      "X-Initiator": "user",
      "Openai-Intent": "conversation-edits",
    });
  });

  it("marks image turns for the Copilot vision gateway", () => {
    const shape = endpointShape("openai-compatible");
    const headers = shape.requestHeaders?.({
      model: "gpt-4.1",
      provider: "github-copilot",
      systemPrompt: "system",
      messages: [{ role: "user", content: [{ type: "image", data: "abc", mimeType: "image/png" }] }],
      tools: [],
      allowTools: true,
      vision: true,
      temperature: 0.7,
      systemRole: "system",
      reasoningEffort: false,
      maxTokensField: "max_tokens",
      assistantAfterToolResult: false,
    });

    expect(headers?.["Copilot-Vision-Request"]).toBe("true");
  });
});

describe("github copilot headers on the anthropic endpoint", () => {
  // Copilot serves Claude models through the Anthropic Messages API, and the
  // gateway asks the same questions of those turns: who is asking, whether this
  // is an edit, whether images are attached. A request without them is not a
  // request the gateway can answer.
  const turn = {
    model: "claude-sonnet-4.5",
    provider: "github-copilot",
    systemPrompt: "system",
    messages: [{ role: "user", content: "hello" }],
    tools: [],
    allowTools: true,
    vision: true,
    temperature: 0.7,
    systemRole: "system",
    reasoningEffort: false,
    maxTokensField: "max_tokens",
    assistantAfterToolResult: false,
  };

  it("adds the gateway identity and initiator headers", () => {
    const headers = endpointShape("anthropic-messages").requestHeaders?.(turn);
    expect(headers).toMatchObject({
      "Editor-Version": "vscode/1.107.0",
      "Editor-Plugin-Version": "copilot-chat/0.35.0",
      "Copilot-Integration-Id": "vscode-chat",
      "User-Agent": "GitHubCopilotChat/0.35.0",
      "X-Initiator": "user",
      "Openai-Intent": "conversation-edits",
    });
  });

  it("marks image turns for the vision gateway", () => {
    const headers = endpointShape("anthropic-messages").requestHeaders?.({
      ...turn,
      messages: [{ role: "user", content: [{ type: "image", data: "abc", mimeType: "image/png" }] }],
    });
    expect(headers?.["Copilot-Vision-Request"]).toBe("true");
  });

  it("answers agent when the turn ends on a tool result", () => {
    const headers = endpointShape("anthropic-messages").requestHeaders?.({
      ...turn,
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: null },
        { role: "tool", tool_call_id: "c1", content: "done" },
      ],
    });
    expect(headers?.["X-Initiator"]).toBe("agent");
  });

  it("adds nothing for a provider that is not Copilot", () => {
    const headers = endpointShape("anthropic-messages").requestHeaders?.({
      ...turn,
      provider: "anthropic",
    });
    expect(headers).toEqual({});
  });
});
