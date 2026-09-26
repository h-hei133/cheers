import { describe, expect, it } from "vitest";
import type { RuntimeConfig } from "../../config/runtimeConfig.js";
import {
  getProviderApiKeyEnvVarName,
  maskApiKey,
  resolveProviderCredential,
} from "./providerCredentials.js";

function createRuntimeConfig(): RuntimeConfig {
  return {
    provider: "openai",
    maxTurns: 6,
    disabledTools: [],
    hiddenToolPrefixes: [],
    enableMcpTools: true,
    activeProviderConnectionId: undefined,
    providerConnections: [],
    providerCredentials: {
      openai: { apiKey: "cfg-openai" },
      anthropic: { apiKey: "cfg-anthropic" },
      "openai-compatible": {
        apiKey: "cfg-compatible",
        baseUrl: "https://api.siliconflow.cn/v1/",
        model: "deepseek-ai/DeepSeek-V3",
      },
    },
    configSources: [],
  };
}

describe("provider credential resolution", () => {
  it("uses cli explicit credential first", () => {
    const result = resolveProviderCredential({
      runtimeConfig: createRuntimeConfig(),
      cliProvider: "openai",
      cliApiKey: "cli-openai",
      env: { OPENAI_API_KEY: "env-openai" },
    });

    expect(result.provider).toBe("openai");
    expect(result.credential?.source).toBe("cli");
    expect(result.credential?.authMode).toBe("api-key");
    expect(result.credential?.apiKey).toBe("cli-openai");
  });

  it("uses env credential when cli credential is absent", () => {
    const result = resolveProviderCredential({
      runtimeConfig: createRuntimeConfig(),
      cliProvider: "openai",
      env: { OPENAI_API_KEY: "env-openai" },
    });

    expect(result.credential?.source).toBe("env");
    expect(result.credential?.authMode).toBe("api-key");
    expect(result.credential?.apiKey).toBe("env-openai");
  });

  it("uses config credential when cli/env are absent", () => {
    const result = resolveProviderCredential({
      runtimeConfig: createRuntimeConfig(),
      cliProvider: "anthropic",
      env: {},
    });

    expect(result.provider).toBe("anthropic");
    expect(result.credential?.source).toBe("config");
    expect(result.credential?.authMode).toBe("api-key");
    expect(result.credential?.apiKey).toBe("cfg-anthropic");
  });

  it("resolves openai-compatible config profile with endpoint and model", () => {
    const result = resolveProviderCredential({
      runtimeConfig: createRuntimeConfig(),
      cliProvider: "openai-compatible",
      env: { OPENAI_COMPATIBLE_API_KEY: "env-compatible" },
    });

    expect(result.provider).toBe("openai-compatible");
    expect(result.expectedEnvVarName).toBe("OPENAI_COMPATIBLE_API_KEY");
    expect(result.baseUrl).toBe("https://api.siliconflow.cn/v1");
    expect(result.model).toBe("deepseek-ai/DeepSeek-V3");
    expect(result.credential?.source).toBe("env");
    expect(result.credential?.authMode).toBe("api-key");
    expect(result.credential?.apiKey).toBe("env-compatible");
    expect(result.credential?.baseUrl).toBe("https://api.siliconflow.cn/v1");
    expect(result.credential?.model).toBe("deepseek-ai/DeepSeek-V3");
  });

  it("uses active connection credential and provider as runtime default before legacy config", () => {
    const result = resolveProviderCredential({
      runtimeConfig: {
        ...createRuntimeConfig(),
        provider: "openai",
        activeProviderConnectionId: "conn-siliconflow",
        providerConnections: [
          {
            id: "conn-siliconflow",
            provider: "openai-compatible",
            authType: "api-key",
            apiKey: "conn-compatible",
            baseUrl: "https://api.siliconflow.cn/v1/",
            model: "deepseek-ai/DeepSeek-V3",
            status: "connected",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      env: {},
    });

    expect(result.provider).toBe("openai-compatible");
    expect(result.credential?.source).toBe("connection");
    expect(result.credential?.authMode).toBe("api-key");
    expect(result.credential?.apiKey).toBe("conn-compatible");
    expect(result.baseUrl).toBe("https://api.siliconflow.cn/v1");
    expect(result.model).toBe("deepseek-ai/DeepSeek-V3");
  });

  it("resolves openai account-auth from active connection without API key", () => {
    const result = resolveProviderCredential({
      runtimeConfig: {
        ...createRuntimeConfig(),
        provider: "openai",
        providerCredentials: {},
        activeProviderConnectionId: "conn-openai-account",
        providerConnections: [
          {
            id: "conn-openai-account",
            provider: "openai",
            authType: "account-auth",
            accountAuth: {
              openai: {
                type: "openai-chatgpt-account",
                accessToken: "acct-access",
                refreshToken: "acct-refresh",
                expiresAt: Date.now() + 3600_000,
                accountId: "acct_001",
              },
            },
            status: "connected",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      env: {},
    });

    expect(result.provider).toBe("openai");
    expect(result.credential?.source).toBe("connection");
    expect(result.credential?.authMode).toBe("account-auth");
    expect(result.credential?.accountAuth?.type).toBe("openai-chatgpt-account");
    expect(result.credential?.apiKey).toBeUndefined();
  });

  it("returns missing credential with provider-specific env var hint", () => {
    const config = createRuntimeConfig();
    const result = resolveProviderCredential({
      runtimeConfig: {
        ...config,
        providerCredentials: {},
      },
      cliProvider: "anthropic",
      env: {},
    });

    expect(result.provider).toBe("anthropic");
    expect(result.credential).toBeUndefined();
    expect(result.expectedEnvVarName).toBe("ANTHROPIC_API_KEY");
  });

  it("exposes env var mapping and key masking helpers", () => {
    expect(getProviderApiKeyEnvVarName("openai")).toBe("OPENAI_API_KEY");
    expect(getProviderApiKeyEnvVarName("anthropic")).toBe("ANTHROPIC_API_KEY");
    expect(getProviderApiKeyEnvVarName("openai-compatible")).toBe(
      "OPENAI_COMPATIBLE_API_KEY",
    );
    expect(maskApiKey("sk-test-123456")).toBe("sk-t...3456");
  });
});
