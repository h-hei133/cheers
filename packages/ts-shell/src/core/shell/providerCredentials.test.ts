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
  it.each(['api-key', 'account-auth'] as const)('fences a pending %s connection before CLI, env and legacy credential fallback', authType => {
    const result = resolveProviderCredential({
      runtimeConfig: {
        ...createRuntimeConfig(), activeProviderConnectionId: 'imported',
        providerConnections: [{ id: 'imported', provider: 'openai', authType, status: 'pending',
          apiKey: 'must-not-use-stale-key', baseUrl: 'https://pending.invalid/v1', model: 'pending-model',
          createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
      },
      cliApiKey: 'must-not-use-cli-key', env: { OPENAI_API_KEY: 'must-not-use-env-key' },
    });
    expect(result).toMatchObject({ blocked: 'connection-pending', provider: 'openai', baseUrl: 'https://pending.invalid/v1', model: 'pending-model' });
    expect(result.credential).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('must-not-use');
  });

  it.each([
    { active: "other", selected: "openai" as const, key: "recent-key", base: "recent" },
    { active: "older", selected: "openai" as const, key: "older-key", base: "older" },
    { active: "missing", selected: "openai" as const, key: "recent-key", base: "recent" },
    { active: "other", selected: undefined, key: "other-key", base: "other" },
  ])("binds credentials and endpoint to the selected provider ($active / $selected)", ({ active, selected, key, base }) => {
    const result = resolveProviderCredential({
      runtimeConfig: {
        ...createRuntimeConfig(),
        activeProviderConnectionId: active,
        providerConnections: [
          { id: "other", provider: "anthropic", apiKey: "other-key", baseUrl: "https://other.invalid/v1", model: "other-model", authType: "api-key", status: "connected", createdAt: "2026-01-01", updatedAt: "2026-01-03" },
          { id: "older", provider: "openai", apiKey: "older-key", baseUrl: "https://older.invalid/v1", model: "older-model", authType: "api-key", status: "connected", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
          { id: "recent", provider: "openai", apiKey: "recent-key", baseUrl: "https://recent.invalid/v1", model: "recent-model", authType: "api-key", status: "connected", createdAt: "2026-01-01", updatedAt: "2026-01-02" },
        ],
      },
      cliProvider: selected,
      env: {},
    });
    expect(result).toMatchObject({
      provider: selected ?? "anthropic", baseUrl: `https://${base}.invalid/v1`, model: `${base}-model`,
      credential: { source: "connection", connectionId: base, apiKey: key, baseUrl: `https://${base}.invalid/v1`, model: `${base}-model` },
    });
    expect(result.selection).toEqual(selected ? { provider: selected } : {});
  });

  it.each([undefined, "cli-key"])("keeps a matching fallback endpoint with an explicit key (%s)", cliApiKey => {
    const result = resolveProviderCredential({
      runtimeConfig: {
        ...createRuntimeConfig(), activeProviderConnectionId: "other",
        providerConnections: [
          { id: "other", provider: "anthropic", apiKey: "other-key", baseUrl: "https://other.invalid/v1", authType: "api-key", status: "connected", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
          { id: "selected", provider: "openai", apiKey: "stored-key", baseUrl: "https://selected.invalid/v1", model: "selected-model", authType: "api-key", status: "connected", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        ],
      },
      cliProvider: "openai", cliApiKey, env: { OPENAI_API_KEY: "env-key" },
    });
    expect(result.credential).toMatchObject({
      apiKey: cliApiKey ?? "env-key", source: cliApiKey ? "cli" : "env",
      baseUrl: "https://selected.invalid/v1", model: "selected-model",
    });
  });

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

  it("uses matching account auth when the active connection belongs to another provider", () => {
    const accountAuth = {
      type: "openai-chatgpt-account" as const, accessToken: "test-access", refreshToken: "test-refresh",
      expiresAt: Date.now() + 3600_000, accountId: "test-account",
    };
    const result = resolveProviderCredential({
      runtimeConfig: {
        ...createRuntimeConfig(), activeProviderConnectionId: "other",
        providerConnections: [
          { id: "other", provider: "anthropic", apiKey: "other-key", authType: "api-key", status: "connected", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
          { id: "selected", provider: "openai", accountAuth: { openai: accountAuth }, authType: "account-auth", status: "connected", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        ],
      },
      cliProvider: "openai", env: { OPENAI_API_KEY: "env-key" },
    });
    expect(result.credential).toMatchObject({ source: "connection", connectionId: "selected", authMode: "account-auth", accountAuth });
    expect(result.credential?.apiKey).toBeUndefined();
  });

  it("keeps a missing provider credential missing instead of borrowing another connection", () => {
    const result = resolveProviderCredential({
      runtimeConfig: {
        ...createRuntimeConfig(), providerCredentials: {}, activeProviderConnectionId: "other",
        providerConnections: [
          { id: "other", provider: "anthropic", apiKey: "other-key", baseUrl: "https://other.invalid/v1", model: "other-model", authType: "api-key", status: "connected", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        ],
      },
      cliProvider: "openai", env: {},
    });
    expect(result).toEqual({ provider: "openai", selection: { provider: "openai" }, expectedEnvVarName: "OPENAI_API_KEY", baseUrl: undefined, model: undefined });
  });

  it('retains explicit endpoint selection separately from the resolved endpoint and credential', () => {
    const result = resolveProviderCredential({ runtimeConfig: createRuntimeConfig(), cliProvider: 'openai',
      cliBaseUrl: 'https://explicit.invalid/v1/', cliApiKey: 'private-key', env: {} });
    expect(result.selection).toEqual({ provider: 'openai', baseUrl: 'https://explicit.invalid/v1/' });
    expect(result.baseUrl).toBe('https://explicit.invalid/v1');
    expect(JSON.stringify(result.selection)).not.toContain('private-key');
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
