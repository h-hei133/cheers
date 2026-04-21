import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getUserRuntimeConfigPath } from "../../config/runtimeConfig.js";
import {
  __setConnectBrowserFlowRunnerForTest,
  __setOpenAIAccountAuthRunnerForTest,
  runConnectCommand,
} from "./connectCommandRuntime.js";

describe("connect command runtime", () => {
  const originalHome = process.env.USERPROFILE;
  const originalUnixHome = process.env.HOME;
  let fakeHome = "";
  let workspaceRoot = "";

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-connect-home-"),
    );
    workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-connect-root-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;
    __setConnectBrowserFlowRunnerForTest(undefined);
    __setOpenAIAccountAuthRunnerForTest(undefined);
  });

  afterEach(() => {
    process.env.USERPROFILE = originalHome;
    process.env.HOME = originalUnixHome;
    __setConnectBrowserFlowRunnerForTest(undefined);
    __setOpenAIAccountAuthRunnerForTest(undefined);
    fs.rmSync(fakeHome, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("creates a siliconflow connection and sets it as active runtime provider", async () => {
    const result = await runConnectCommand(
      ["login", "siliconflow", "--api-key", "sk-siliconflow-test"],
      {
        cwd: workspaceRoot,
      },
    );

    expect(result.kind).toBe("local");
    expect(result.output).toContain("Connected provider openai-compatible");

    const configPath = getUserRuntimeConfigPath();
    const stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      provider?: string;
      activeProviderConnectionId?: string;
      providerConnections?: Array<{
        id: string;
        provider: string;
        authType: string;
        apiKey?: string;
        baseUrl?: string;
        model?: string;
      }>;
    };

    expect(stored.provider).toBe("openai-compatible");
    expect(stored.activeProviderConnectionId).toBeTruthy();
    expect(stored.providerConnections?.length).toBe(1);
    expect(stored.providerConnections?.[0]?.provider).toBe("openai-compatible");
    expect(stored.providerConnections?.[0]?.authType).toBe("api-key");
    expect(stored.providerConnections?.[0]?.apiKey).toBe("sk-siliconflow-test");
    expect(stored.providerConnections?.[0]?.baseUrl).toBe(
      "https://api.siliconflow.cn/v1",
    );
  });

  it("supports legacy /auth set semantics via /connect set", async () => {
    const result = await runConnectCommand(
      [
        "set",
        "openai-compatible",
        "sk-legacy-openai-compatible",
        "https://api.siliconflow.cn/v1",
        "deepseek-ai/DeepSeek-V3",
      ],
      { cwd: workspaceRoot },
    );

    expect(result.kind).toBe("local");
    expect(result.output).toContain("Connected provider openai-compatible");
    expect(result.output).toContain("legacy compatibility path");

    const configPath = getUserRuntimeConfigPath();
    const stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      provider?: string;
      activeProviderConnectionId?: string;
      providerConnections?: Array<{
        id: string;
        provider: string;
        authType: string;
        apiKey?: string;
        baseUrl?: string;
        model?: string;
      }>;
    };

    expect(stored.provider).toBe("openai-compatible");
    expect(stored.activeProviderConnectionId).toBeTruthy();
    expect(stored.providerConnections?.[0]?.provider).toBe("openai-compatible");
    expect(stored.providerConnections?.[0]?.authType).toBe("api-key");
    expect(stored.providerConnections?.[0]?.apiKey).toBe(
      "sk-legacy-openai-compatible",
    );
  });

  it("switches active connection by provider alias", async () => {
    await runConnectCommand(
      ["login", "openai", "--api-key", "sk-openai-test"],
      {
        cwd: workspaceRoot,
      },
    );
    await runConnectCommand(
      ["login", "anthropic", "--api-key", "sk-anthropic-test"],
      {
        cwd: workspaceRoot,
      },
    );

    const switched = await runConnectCommand(["use", "openai"], {
      cwd: workspaceRoot,
    });
    expect(switched.kind).toBe("local");
    expect(switched.output).toContain("Provider: openai");

    const configPath = getUserRuntimeConfigPath();
    const stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      provider?: string;
      activeProviderConnectionId?: string;
      providerConnections?: Array<{ id: string; provider: string }>;
    };

    const active = stored.providerConnections?.find(
      (connection) => connection.id === stored.activeProviderConnectionId,
    );
    expect(stored.provider).toBe("openai");
    expect(active?.provider).toBe("openai");
  });

  it("completes browser-assisted local capture and activates connection", async () => {
    __setConnectBrowserFlowRunnerForTest(async () => ({
      apiKey: "browser-key-test",
      baseUrl: "https://api.siliconflow.cn/v1/",
      model: "deepseek-ai/DeepSeek-V3",
    }));

    const result = await runConnectCommand(
      ["login", "siliconflow", "--browser"],
      {
        cwd: workspaceRoot,
      },
    );

    expect(result.kind).toBe("local");
    expect(result.output).toContain(
      "Browser-assisted local credential capture completed",
    );
    expect(result.output).toContain("pending -> connected");

    const configPath = getUserRuntimeConfigPath();
    const stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      provider?: string;
      activeProviderConnectionId?: string;
      providerConnections?: Array<{
        id: string;
        authType: string;
        status?: string;
        apiKey?: string;
      }>;
    };

    expect(stored.provider).toBe("openai-compatible");
    expect(stored.activeProviderConnectionId).toBeTruthy();
    expect(stored.providerConnections?.[0]?.authType).toBe(
      "browser-assisted-capture",
    );
    expect(stored.providerConnections?.[0]?.status).toBe("connected");
    expect(stored.providerConnections?.[0]?.apiKey).toBe("browser-key-test");
    expect(stored.providerConnections?.[0]?.id).toBe(
      stored.activeProviderConnectionId,
    );
  });

  it("records browser-assisted local capture failure as pending -> error", async () => {
    __setConnectBrowserFlowRunnerForTest(async () => {
      throw new Error("callback timeout");
    });

    const result = await runConnectCommand(
      ["login", "openai", "--browser"],
      {
        cwd: workspaceRoot,
      },
    );

    expect(result.kind).toBe("local");
    expect(result.output).toContain(
      "Browser-assisted local credential capture failed",
    );
    expect(result.output).toContain("pending -> error");

    const configPath = getUserRuntimeConfigPath();
    const stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      providerConnections?: Array<{ status?: string }>;
    };

    expect(stored.providerConnections?.[0]?.status).toBe("error");
  });

  it("creates openai account-auth connection and marks it active", async () => {
    __setOpenAIAccountAuthRunnerForTest(async () => ({
      accessToken: "acct-access-token",
      refreshToken: "acct-refresh-token",
      expiresAt: Date.now() + 3600_000,
      accountId: "acct_123",
      authorizeUrl: "https://auth.openai.com/oauth/authorize?...",
      callbackUrl: "http://localhost:1455/auth/callback",
    }));

    const result = await runConnectCommand(["login", "openai", "--account"], {
      cwd: workspaceRoot,
    });

    expect(result.kind).toBe("local");
    expect(result.output).toContain("OpenAI account-auth connected");
    expect(result.output).toContain("Connection type: account-auth");

    const configPath = getUserRuntimeConfigPath();
    const stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      provider?: string;
      activeProviderConnectionId?: string;
      providerConnections?: Array<{
        id: string;
        authType: string;
        accountAuth?: {
          openai?: {
            type: string;
            accessToken: string;
            refreshToken: string;
            accountId?: string;
          };
        };
      }>;
      providerCredentials?: {
        openai?: {
          accountAuth?: {
            openai?: { type: string };
          };
        };
      };
    };

    expect(stored.provider).toBe("openai");
    expect(stored.activeProviderConnectionId).toBeTruthy();
    expect(stored.providerConnections?.[0]?.authType).toBe("account-auth");
    expect(stored.providerConnections?.[0]?.accountAuth?.openai?.type).toBe(
      "openai-chatgpt-account",
    );
    expect(
      stored.providerCredentials?.openai?.accountAuth?.openai?.type,
    ).toBe("openai-chatgpt-account");
  });
});
