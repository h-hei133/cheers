import { describe, expect, it } from "vitest";

import {
  createSyntheticTurnRoleDraftSseBody,
  resolveTurnRequestModel,
  streamTurnRoleDraft,
} from "./roleDraftStage.js";

describe("roleDraftStage", () => {
  it("keeps synthetic draft streaming local and deterministic", async () => {
    await expect(streamTurnRoleDraft({
      role: "coder",
      draft: "Draft response",
      providerMode: "synthetic",
    })).resolves.toBe("Draft response");
  });

  it("preserves request model selection for synthetic and real providers", () => {
    expect(resolveTurnRequestModel({ providerMode: "synthetic" })).toBe(
      "gpt-4.1-mini",
    );
    expect(resolveTurnRequestModel({
      providerMode: "real",
      realProvider: { provider: "openai", model: "custom-model" },
    })).toBe("custom-model");
    expect(resolveTurnRequestModel({
      providerMode: "real",
      realProvider: {
        provider: "openai",
        accountAuth: {
          type: "openai-chatgpt-account",
          accessToken: "token",
          refreshToken: "refresh",
          expiresAt: Date.now() + 60_000,
        },
      },
    })).toBe("gpt-5.4");
  });

  it("emits transcript-safe synthetic SSE chunks without external provider access", async () => {
    const reader = createSyntheticTurnRoleDraftSseBody("abcdef").getReader();
    const decoder = new TextDecoder();
    let body = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();

    expect(body).toContain('"content":"abc"');
    expect(body).toContain('"content":"def"');
    expect(body).toContain("data: [DONE]");
  });
});
