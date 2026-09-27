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
