import { describe, expect, it } from "vitest";
import { endpointShape, endpointUrl } from "./index.js";

describe("native Copilot endpoint declarations", () => {
  it("keeps the Messages route under the gateway's version prefix", () => {
    expect(endpointUrl("https://api.individual.githubcopilot.com", "copilot-messages", "claude-sonnet-4.5"))
      .toBe("https://api.individual.githubcopilot.com/v1/messages");
    expect(endpointShape("copilot-messages").path("claude-sonnet-4.5")).toBe("/v1/messages");
  });

  it("keeps the chat-completions route on the model-family codec", () => {
    expect(endpointUrl("https://api.individual.githubcopilot.com", "copilot-chat-completions", "gpt-4.1"))
      .toBe("https://api.individual.githubcopilot.com/chat/completions");
  });
});
