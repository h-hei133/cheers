import { describe, expect, it } from "vitest";
import { captureApiKeyViaBrowser } from "./browserAuthOnboarding.js";

describe("browser auth onboarding flow", () => {
  it("completes authorize -> callback submit -> credential capture", async () => {
    const result = await captureApiKeyViaBrowser({
      provider: "openai-compatible",
      presetLabel: "SiliconFlow",
      defaultBaseUrl: "https://api.siliconflow.cn/v1",
      defaultModel: "deepseek-ai/DeepSeek-V3",
      timeoutMs: 10_000,
      openBrowser: async (url) => {
        const authUrl = new URL(url);
        const state = authUrl.searchParams.get("state");
        if (!state) {
          throw new Error("missing state");
        }

        const form = new URLSearchParams({
          state,
          apiKey: "browser-flow-key",
          baseUrl: "https://api.siliconflow.cn/v1",
          model: "deepseek-ai/DeepSeek-V3",
        });

        await fetch(`${authUrl.origin}/submit`, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
        });
      },
    });

    expect(result.apiKey).toBe("browser-flow-key");
    expect(result.baseUrl).toBe("https://api.siliconflow.cn/v1");
    expect(result.model).toBe("deepseek-ai/DeepSeek-V3");
  });
});
