import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getCandidateConfigPaths,
  getRuntimeConfig,
  getUserRuntimeConfigPath,
  readUserRuntimeConfigFile,
  writeUserRuntimeConfigFile,
} from "./runtimeConfig.js";

describe("runtime config", () => {
  const originalHome = process.env.USERPROFILE;
  const originalUnixHome = process.env.HOME;
  let fakeHome: string;
  let fakeRoot: string;

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "private-agents-home-"));
    fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "private-agents-root-"));
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;
    delete process.env.DAEMON_ENABLED;
    delete process.env.PRIVATE_AGENTS_MAX_TURNS;
  });

  afterEach(() => {
    process.env.USERPROFILE = originalHome;
    process.env.HOME = originalUnixHome;
    delete process.env.DAEMON_ENABLED;
    delete process.env.PRIVATE_AGENTS_MAX_TURNS;
    fs.rmSync(fakeHome, { recursive: true, force: true });
    fs.rmSync(fakeRoot, { recursive: true, force: true });
  });

  it("loads defaults when no config file exists", () => {
    const config = getRuntimeConfig(fakeRoot);
    expect(config).toEqual({
      provider: "openai",
      daemonEnabled: true,
      maxTurns: 6,
      disabledTools: [],
      hiddenToolPrefixes: [],
      enableMcpTools: true,
      activeProviderConnectionId: undefined,
      providerConnections: [],
      providerCredentials: {},
      configSources: [],
    });
  });

  it("loads project config and env overrides", () => {
    const configPath = path.join(fakeRoot, ".private-agents.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        daemonEnabled: false,
        maxTurns: 9,
        activeProviderConnectionId: "conn-compatible",
        providerConnections: [
          {
            id: "conn-compatible",
            provider: "openai-compatible",
            authType: "api-key",
            apiKey: "conn-compatible-key",
            baseUrl: "https://api.siliconflow.cn/v1/",
            model: "deepseek-ai/DeepSeek-V3",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        providerCredentials: {
          openai: { apiKey: "cfg-openai-key" },
          anthropic: { apiKey: "cfg-anthropic-key" },
          "openai-compatible": {
            apiKey: "cfg-compatible-key",
            baseUrl: "https://api.siliconflow.cn/v1/",
            model: "deepseek-ai/DeepSeek-V3",
          },
        },
      }),
      "utf8",
    );
    process.env.DAEMON_ENABLED = "1";
    process.env.PRIVATE_AGENTS_MAX_TURNS = "12";

    const config = getRuntimeConfig(fakeRoot);
    expect(config.provider).toBe("openai");
    expect(config.daemonEnabled).toBe(true);
    expect(config.maxTurns).toBe(12);
    expect(config.providerCredentials.openai?.apiKey).toBe("cfg-openai-key");
    expect(config.providerCredentials.anthropic?.apiKey).toBe(
      "cfg-anthropic-key",
    );
    expect(config.providerCredentials["openai-compatible"]?.apiKey).toBe(
      "cfg-compatible-key",
    );
    expect(config.providerCredentials["openai-compatible"]?.baseUrl).toBe(
      "https://api.siliconflow.cn/v1",
    );
    expect(config.providerCredentials["openai-compatible"]?.model).toBe(
      "deepseek-ai/DeepSeek-V3",
    );
    expect(config.activeProviderConnectionId).toBe("conn-compatible");
    expect(config.providerConnections).toHaveLength(1);
    expect(config.providerConnections[0]?.baseUrl).toBe(
      "https://api.siliconflow.cn/v1",
    );
    expect(config.configSources).toContain(configPath);
  });

  it("lets user runtime config override project defaults", () => {
    fs.writeFileSync(
      path.join(fakeRoot, ".private-agents.json"),
      JSON.stringify({
        provider: "openai",
        providerCredentials: {
          openai: { apiKey: "project-openai-key" },
        },
      }),
      "utf8",
    );

    writeUserRuntimeConfigFile({
      provider: "openai-compatible",
      providerCredentials: {
        "openai-compatible": {
          apiKey: "user-compatible-key",
          baseUrl: "https://api.siliconflow.cn/v1/",
          model: "deepseek-ai/DeepSeek-V3",
        },
      },
    });

    const config = getRuntimeConfig(fakeRoot);
    expect(config.provider).toBe("openai-compatible");
    expect(config.providerCredentials["openai-compatible"]?.apiKey).toBe(
      "user-compatible-key",
    );
    expect(config.providerCredentials.openai?.apiKey).toBe(
      "project-openai-key",
    );
    expect(config.configSources).toEqual([
      path.join(fakeRoot, ".private-agents.json"),
      getUserRuntimeConfigPath(),
    ]);
  });

  it("returns stable candidate paths", () => {
    const candidates = getCandidateConfigPaths(fakeRoot);
    expect(candidates[0]).toContain(".private-agents");
    expect(candidates[1]).toBe(path.join(fakeRoot, ".private-agents.json"));
  });

  it("uses the same user config path for connection writes and runtime reads", () => {
    const configPath = getUserRuntimeConfigPath();
    expect(getCandidateConfigPaths(fakeRoot)[0]).toBe(configPath);

    writeUserRuntimeConfigFile({
      provider: "openai-compatible",
      providerCredentials: {
        "openai-compatible": {
          apiKey: "user-compatible-key",
          baseUrl: "https://api.siliconflow.cn/v1",
          model: "deepseek-ai/DeepSeek-V4-Flash",
        },
      },
    });

    const config = getRuntimeConfig(fakeRoot);
    expect(config.provider).toBe("openai-compatible");
    expect(config.configSources).toContain(configPath);
    expect(config.providerCredentials["openai-compatible"]?.model).toBe(
      "deepseek-ai/DeepSeek-V4-Flash",
    );
  });

  it("reads and writes user runtime config file for credential onboarding", () => {
    const configPath = getUserRuntimeConfigPath();
    expect(readUserRuntimeConfigFile()).toEqual({});

    writeUserRuntimeConfigFile({
      provider: "openai",
      providerCredentials: {
        openai: { apiKey: "user-openai-key" },
        "openai-compatible": {
          apiKey: "user-compatible-key",
          baseUrl: "https://api.siliconflow.cn/v1/",
          model: "deepseek-ai/DeepSeek-V3",
        },
      },
    });

    expect(fs.existsSync(configPath)).toBe(true);
    const loaded = readUserRuntimeConfigFile();
    expect(loaded.provider).toBe("openai");
    expect(loaded.providerCredentials?.openai?.apiKey).toBe("user-openai-key");
    expect(loaded.providerCredentials?.["openai-compatible"]?.baseUrl).toBe(
      "https://api.siliconflow.cn/v1/",
    );
    expect(loaded.providerCredentials?.["openai-compatible"]?.model).toBe(
      "deepseek-ai/DeepSeek-V3",
    );
  });

  it("tolerates UTF-8 BOM in config file", () => {
    const configPath = path.join(fakeRoot, ".private-agents.json");
    fs.writeFileSync(
      configPath,
      "\uFEFF" + JSON.stringify({ maxTurns: 10 }),
      "utf8",
    );
    const config = getRuntimeConfig(fakeRoot);
    expect(config.maxTurns).toBe(10);
  });

  it("tolerates UTF-8 BOM in user config file", () => {
    const configPath = getUserRuntimeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      "\uFEFF" + JSON.stringify({ maxTurns: 15 }),
      "utf8",
    );
    const loaded = readUserRuntimeConfigFile();
    expect(loaded.maxTurns).toBe(15);
  });

  it("includes config path in parse error for invalid JSON", () => {
    const configPath = path.join(fakeRoot, ".private-agents.json");
    fs.writeFileSync(configPath, "{ invalid_json }", "utf8");
    expect(() => getRuntimeConfig(fakeRoot)).toThrowError(
      new RegExp(`Failed to read runtime config at .*\\.private-agents\\.json:.*`)
    );
  });
});
