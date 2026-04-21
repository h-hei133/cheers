import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getUserRuntimeConfigPath } from "../../config/runtimeConfig.js";
import { runAuthCommand } from "./authCommandRuntime.js";

describe("auth command runtime", () => {
  const originalHome = process.env.USERPROFILE;
  const originalUnixHome = process.env.HOME;
  let fakeHome = "";
  let workspaceRoot = "";

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-auth-home-"),
    );
    workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-auth-root-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env.USERPROFILE = originalHome;
    process.env.HOME = originalUnixHome;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    fs.rmSync(fakeHome, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("writes credential and updates default provider through /auth set", async () => {
    const result = await runAuthCommand(["set", "openai", "sk-test-openai"], {
      cwd: workspaceRoot,
    });

    expect(result.kind).toBe("local");
    expect(result.output).toContain("Credential saved for provider openai");

    const configPath = getUserRuntimeConfigPath();
    const stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      provider?: string;
      providerCredentials?: { openai?: { apiKey?: string } };
    };

    expect(stored.provider).toBe("openai");
    expect(stored.providerCredentials?.openai?.apiKey).toBe("sk-test-openai");
  });

  it("renders status and removes credential through /auth logout", async () => {
    await runAuthCommand(["set", "openai", "sk-test-openai"], {
      cwd: workspaceRoot,
    });

    const status = await runAuthCommand(["status"], { cwd: workspaceRoot });
    expect(status.kind).toBe("local");
    expect(status.output).toContain("Effective provider: openai");

    const removed = await runAuthCommand(["logout", "openai"], {
      cwd: workspaceRoot,
    });
    expect(removed.kind).toBe("local");
    expect(removed.output).toContain(
      "Removed stored credential for provider openai",
    );

    const configPath = getUserRuntimeConfigPath();
    const stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      providerCredentials?: { openai?: { apiKey?: string } };
    };

    expect(stored.providerCredentials?.openai).toBeUndefined();
  });

  it("stores openai-compatible endpoint and model via /auth set", async () => {
    const result = await runAuthCommand(
      [
        "set",
        "openai-compatible",
        "sk-test-compatible",
        "https://api.siliconflow.cn/v1/",
        "deepseek-ai/DeepSeek-V3",
      ],
      {
        cwd: workspaceRoot,
      },
    );

    expect(result.kind).toBe("local");
    expect(result.output).toContain(
      "Credential saved for provider openai-compatible",
    );
    expect(result.output).toContain(
      "Saved base URL: https://api.siliconflow.cn/v1",
    );
    expect(result.output).toContain("Saved model: deepseek-ai/DeepSeek-V3");

    const configPath = getUserRuntimeConfigPath();
    const stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      provider?: string;
      providerCredentials?: {
        "openai-compatible"?: {
          apiKey?: string;
          baseUrl?: string;
          model?: string;
        };
      };
    };

    expect(stored.provider).toBe("openai-compatible");
    expect(stored.providerCredentials?.["openai-compatible"]?.apiKey).toBe(
      "sk-test-compatible",
    );
    expect(stored.providerCredentials?.["openai-compatible"]?.baseUrl).toBe(
      "https://api.siliconflow.cn/v1",
    );
    expect(stored.providerCredentials?.["openai-compatible"]?.model).toBe(
      "deepseek-ai/DeepSeek-V3",
    );
  });

  it("preserves openai-compatible endpoint after /auth logout", async () => {
    await runAuthCommand(
      [
        "set",
        "openai-compatible",
        "sk-test-compatible",
        "https://api.siliconflow.cn/v1",
        "deepseek-ai/DeepSeek-V3",
      ],
      {
        cwd: workspaceRoot,
      },
    );

    const removed = await runAuthCommand(["logout", "openai-compatible"], {
      cwd: workspaceRoot,
    });

    expect(removed.kind).toBe("local");
    expect(removed.output).toContain(
      "Removed stored credential for provider openai-compatible",
    );

    const configPath = getUserRuntimeConfigPath();
    const stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      providerCredentials?: {
        "openai-compatible"?: {
          apiKey?: string;
          baseUrl?: string;
          model?: string;
        };
      };
    };

    expect(
      stored.providerCredentials?.["openai-compatible"]?.apiKey,
    ).toBeUndefined();
    expect(stored.providerCredentials?.["openai-compatible"]?.baseUrl).toBe(
      "https://api.siliconflow.cn/v1",
    );
    expect(stored.providerCredentials?.["openai-compatible"]?.model).toBe(
      "deepseek-ai/DeepSeek-V3",
    );
  });
});
