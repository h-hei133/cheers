import { describe, expect, it } from "vitest";
import { parseSettingsJson } from "./schema.js";
import { mergeAgentSettings, loadCascadingSettings } from "./settingsLoader.js";
import { DEFAULT_AGENT_SETTINGS, type AgentSettings } from "./types.js";

describe("Unified Settings & Cascading Loader", () => {
  it("interpolates environment variables in settings JSON", () => {
    process.env.TEST_API_KEY = "sk-test-secret-1234";
    process.env.TEST_PORT = "8080";

    const raw = JSON.stringify({
      version: 1,
      model: {
        apiKey: "${TEST_API_KEY}",
        baseUrl: "http://localhost:$TEST_PORT/v1",
      },
    });

    const parsed = parseSettingsJson(raw) as { model: { apiKey: string; baseUrl: string } };
    expect(parsed.model.apiKey).toBe("sk-test-secret-1234");
    expect(parsed.model.baseUrl).toBe("http://localhost:8080/v1");
  });

  it("merges partial overrides over base defaults", () => {
    const override: Partial<AgentSettings> = {
      model: {
        provider: "openai-compatible",
        model: "deepseek-ai/DeepSeek-V3",
      },
      permissions: {
        defaultBehavior: "allow",
      },
    };

    const merged = mergeAgentSettings(DEFAULT_AGENT_SETTINGS, override);
    expect(merged.model?.provider).toBe("openai-compatible");
    expect(merged.model?.model).toBe("deepseek-ai/DeepSeek-V3");
    expect(merged.model?.thinkingBudget).toBe("medium"); // Retained from default
    expect(merged.permissions?.defaultBehavior).toBe("allow");
    expect(merged.permissions?.allowReadOnlyTools).toBe(true); // Retained from default
  });

  it("loads cascading settings with CLI overrides taking highest precedence", () => {
    const cliOverrides: Partial<AgentSettings> = {
      model: {
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
      },
    };

    const resolved = loadCascadingSettings(process.cwd(), cliOverrides);
    expect(resolved.model?.provider).toBe("anthropic");
    expect(resolved.model?.model).toBe("claude-3-5-sonnet-20241022");
  });
});
