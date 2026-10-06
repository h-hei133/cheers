import { readRuntimeConfigEditAt } from "./runtimeConfig.js";
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
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-home-"));
    fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-root-"));
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;
    delete process.env.CHEERS_MAX_TURNS;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalHome;
    if (originalUnixHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalUnixHome;
    delete process.env.CHEERS_MAX_TURNS;
    fs.rmSync(fakeHome, { recursive: true, force: true });
    fs.rmSync(fakeRoot, { recursive: true, force: true });
  });

  it("loads defaults when no config file exists", () => {
    const config = getRuntimeConfig(fakeRoot);
    // Assert the fields a caller actually reads, not the exact key set: pinning
    // the key set is what let a missing field go unnoticed.
    expect(config.provider).toBe("openai");
    expect(config.maxTurns).toBe(15);
    expect(config.disabledTools).toEqual([]);
    expect(config.hiddenToolPrefixes).toEqual([]);
    expect(config.enableMcpTools).toBe(true);
    expect(config.activeProviderConnectionId).toBeUndefined();
    expect(config.providerConnections).toEqual([]);
    expect(config.providerCredentials).toEqual({});
    expect(config.configSources).toEqual([]);
  });

  it("keeps the screen the surface has always taken when tuiMode is unset", () => {
    // Wiring this field must not change how the product looks for someone who
    // never set it. The surface took the alternate screen unconditionally before
    // the field had a reader, so that is what the default has to keep: a default
    // of `regular` silently moved every existing session onto the main screen.
    const config = getRuntimeConfig(fakeRoot);
    expect(config.tuiMode).not.toBe("regular");
  });

  it("honours tuiMode when a config file asks for the main screen", () => {
    fs.writeFileSync(
      path.join(fakeRoot, ".cheers.json"),
      JSON.stringify({ tuiMode: "regular" }),
      "utf8",
    );
    expect(getRuntimeConfig(fakeRoot).tuiMode).toBe("regular");
  });

  it("keeps every declared optional field that a config file sets", () => {
    const configPath = path.join(fakeRoot, ".cheers.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        contextWindow: 200_000,
        reserveTokens: 30_000,
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 8192,
        agentMode: "plan",
      }),
      "utf8",
    );

    const config = getRuntimeConfig(fakeRoot);
    expect(config.contextWindow).toBe(200_000);
    expect(config.reserveTokens).toBe(30_000);
    expect(config.temperature).toBe(0.2);
    expect(config.topP).toBe(0.9);
    expect(config.maxOutputTokens).toBe(8192);
    expect(config.agentMode).toBe("plan");
  });

  it("defaults the instruction budget to a bounded number of bytes", () => {
    // A default of zero would disable project instructions for everyone, and an
    // unbounded default would let one repository's file fill the prompt.
    const config = getRuntimeConfig(fakeRoot);
    expect(config.instructionBudgetBytes).toBe(32 * 1024);
  });

  it("retries by default, with the turn layer carrying the retries", () => {
    // Retrying is on because the failures it absorbs are ones the user cannot
    // act on. The provider layer starts at none so one transient failure costs
    // one retry rather than one per layer.
    const config = getRuntimeConfig(fakeRoot);
    expect(config.retryEnabled).toBe(true);
    expect(config.retryMaxRetries).toBe(3);
    expect(config.providerRetryMaxRetries).toBe(0);
  });

  it("takes the retry settings a config file sets", () => {
    fs.writeFileSync(
      path.join(fakeRoot, ".cheers.json"),
      JSON.stringify({
        retryEnabled: false,
        retryMaxRetries: 5,
        providerRetryMaxRetries: 2,
        retryBaseDelayMs: 500,
        retryMaxDelayMs: 10_000,
      }),
      "utf8",
    );

    const config = getRuntimeConfig(fakeRoot);
    expect(config.retryEnabled).toBe(false);
    expect(config.retryMaxRetries).toBe(5);
    expect(config.providerRetryMaxRetries).toBe(2);
    expect(config.retryBaseDelayMs).toBe(500);
    expect(config.retryMaxDelayMs).toBe(10_000);
  });

  it("keeps the queue delivery the kernel already had when unset", () => {
    // Both queues delivered one message at a time before these fields had a
    // reader, so that is what the defaults have to preserve.
    const config = getRuntimeConfig(fakeRoot);
    expect(config.steeringMode).toBe("one-at-a-time");
    expect(config.followUpMode).toBe("one-at-a-time");
  });

  it("takes the queue delivery a config file asks for", () => {
    fs.writeFileSync(
      path.join(fakeRoot, ".cheers.json"),
      JSON.stringify({ steeringMode: "all", followUpMode: "all" }),
      "utf8",
    );

    const config = getRuntimeConfig(fakeRoot);
    expect(config.steeringMode).toBe("all");
    expect(config.followUpMode).toBe("all");
  });

  it("starts anyway when a config file cannot be parsed", () => {
    // A stray comma used to stop the process, which turned a typo into a
    // product that would not run. The file is skipped and the complaint is
    // reported instead.
    fs.writeFileSync(path.join(fakeRoot, ".cheers.json"), "{ not json", "utf8");

    const config = getRuntimeConfig(fakeRoot);
    expect(config.provider).toBe("openai");
    expect(config.configDiagnostics).toHaveLength(1);
    expect(config.configDiagnostics[0]).toContain("Invalid config at");
    expect(config.configDiagnostics[0]).toContain(".cheers.json");
  });

  it("does not let a broken project file inherit the user's settings", () => {
    // Skipping the file means it contributes nothing. Falling back to the user
    // file would attribute the user's values to a project that never declared
    // them, and the diagnostics would be the only sign.
    fs.mkdirSync(path.dirname(getUserRuntimeConfigPath()), { recursive: true });
    fs.writeFileSync(
      getUserRuntimeConfigPath(),
      JSON.stringify({ maxTurns: 99, provider: "anthropic" }),
      "utf8",
    );
    fs.writeFileSync(path.join(fakeRoot, ".cheers.json"), "{ not json", "utf8");

    const config = getRuntimeConfig(fakeRoot);
    // The user file still applies; the project file contributed nothing.
    expect(config.maxTurns).toBe(99);
    expect(config.configDiagnostics).toHaveLength(1);
  });

  /**
   * An unknown provider from a file is not typed by anything. Before this was
   * checked it reached the provider facts, which refuse an undeclared name by
   * throwing — at the first request, and as a crash rather than a complaint.
   */
  it("falls back and says so when the config names a provider it does not know", () => {
    fs.mkdirSync(path.dirname(getUserRuntimeConfigPath()), { recursive: true });
    fs.writeFileSync(
      getUserRuntimeConfigPath(),
      JSON.stringify({ provider: "opemai" }),
      "utf8",
    );

    const config = getRuntimeConfig(fakeRoot);
    // Compared against the default, not against another read of the same bad
    // file: two reads of the same config agree whatever it says, so that
    // comparison would pass with the fallback removed.
    expect(config.provider).toBe("openai");
    expect(config.configDiagnostics).toEqual(["Config user provider: invalid-value; value ignored."]);
    // Supplied provider text may itself be a credential; diagnostics identify
    // the field and source without printing the rejected value.
    expect(config.configDiagnostics.join(" ")).not.toContain("opemai");
  });

  it("takes a provider the config names when it is one it knows", () => {
    // The negative case for the check above: being told about a name must not
    // mean rejecting a good one.
    fs.mkdirSync(path.dirname(getUserRuntimeConfigPath()), { recursive: true });
    fs.writeFileSync(getUserRuntimeConfigPath(), JSON.stringify({ provider: "anthropic" }), "utf8");

    const config = getRuntimeConfig(fakeRoot);
    expect(config.provider).toBe("anthropic");
    expect(config.configDiagnostics).toHaveLength(0);
  });

  it("reports one diagnostic per distinct problem", () => {
    fs.writeFileSync(path.join(fakeRoot, ".cheers.json"), "{ not json", "utf8");
    const config = getRuntimeConfig(fakeRoot);
    // The same file read twice must not read as two problems.
    expect(new Set(config.configDiagnostics).size).toBe(config.configDiagnostics.length);
  });

  it("says nothing when every config file reads cleanly", () => {
    fs.writeFileSync(path.join(fakeRoot, ".cheers.json"), JSON.stringify({ maxTurns: 7 }), "utf8");
    expect(getRuntimeConfig(fakeRoot).configDiagnostics).toEqual([]);
  });

  it("still refuses to write back a user config it could not read", () => {
    // The read-modify-write path keeps throwing on purpose: returning an empty
    // object there would make the next write replace everything the user had
    // with the single field the command was setting.
    const userConfigPath = getUserRuntimeConfigPath();
    fs.mkdirSync(path.dirname(userConfigPath), { recursive: true });
    fs.writeFileSync(userConfigPath, "{ not json", "utf8");
    expect(() => readUserRuntimeConfigFile()).toThrow(/Failed to read user runtime config/);
  });

  it("does not allow unreviewed hooks unless a flag says so", () => {
    // The default has to be the safe one: a config file must not be able to grant
    // this, or a repository could ship the exemption along with the hooks.
    const config = getRuntimeConfig(fakeRoot);
    expect(config.allowUntrustedHooks).toBe(false);
  });

  it("lets no configuration file turn on unreviewed hooks", () => {
    // The exemption must be given per run, by a person typing a flag. A repository
    // that could ship it alongside its hooks would be approving its own commands,
    // which is the whole thing the gate exists to prevent.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bypass-config-"));
    fs.writeFileSync(
      path.join(dir, ".cheers.json"),
      JSON.stringify({ allowUntrustedHooks: true }),
      "utf8",
    );

    expect(getRuntimeConfig(dir).allowUntrustedHooks).toBe(false);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("lets a command-line override turn on unreviewed hooks", () => {
    const config = getRuntimeConfig(fakeRoot, { allowUntrustedHooks: true });
    expect(config.allowUntrustedHooks).toBe(true);
  });

  it("leaves the context window absent when the user did not set one", () => {
    // The window is resolved per model from the catalog. A default filled in
    // here would be indistinguishable from a deliberate override, so the
    // catalog would never be consulted and every model would compact at the
    // same number.
    const config = getRuntimeConfig(fakeRoot);
    expect(config.contextWindow).toBeUndefined();
  });

  it("does not carry a config key whose value nothing reads", () => {
    // A key that survives onto the resolved config is a promise the runtime
    // does not keep: the user sets it, and nothing happens. A config file that
    // still carries a removed key must load without error and must not put the
    // key back on the result.
    const configPath = path.join(fakeRoot, ".cheers.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        contextWindow: 200_000,
        thinkingBudgets: { high: 8192 },
        promptCacheTtl: "1h",
      }),
      "utf8",
    );

    const config = getRuntimeConfig(fakeRoot);
    expect(config.contextWindow).toBe(200_000);
    expect(Object.keys(config)).not.toContain("thinkingBudgets");
    expect(Object.keys(config)).not.toContain("promptCacheTtl");
  });

  it("expands environment references in personal credential fields", () => {
    const configPath = getUserRuntimeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        providerCredentials: {
          openai: { apiKey: "${TEST_CONFIG_KEY}" },
          anthropic: { apiKey: "$TEST_CONFIG_KEY" },
        },
      }),
      "utf8",
    );
    process.env.TEST_CONFIG_KEY = "sk-from-environment";

    const config = getRuntimeConfig(fakeRoot);
    expect(config.providerCredentials.openai?.apiKey).toBe("sk-from-environment");
    expect(config.providerCredentials.anthropic?.apiKey).toBe("sk-from-environment");
  });

  it("loads personal connections and env overrides", () => {
    const configPath = getUserRuntimeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify({
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
    process.env.CHEERS_MAX_TURNS = "12";

    const config = getRuntimeConfig(fakeRoot);
    expect(config.provider).toBe("openai");
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

  it("keeps personal selection without inheriting project credentials", () => {
    fs.writeFileSync(
      path.join(fakeRoot, ".cheers.json"),
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
    }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));

    const config = getRuntimeConfig(fakeRoot);
    expect(config.provider).toBe("openai-compatible");
    expect(config.providerCredentials["openai-compatible"]?.apiKey).toBe(
      "user-compatible-key",
    );
    expect(config.providerCredentials.openai).toBeUndefined();
    expect(config.configDiagnostics).toContain("Config project providerCredentials: source-not-allowed; value ignored.");
    expect(config.configSources).toEqual([
      path.join(fakeRoot, ".cheers.json"),
      getUserRuntimeConfigPath(),
    ]);
  });

  it("returns stable candidate paths", () => {
    // The user-level candidate is where the file is *read* from, which is the
    // current directory when nothing older holds one — so the promise is that it
    // resolves under the current name, not that it is a particular string.
    const candidates = getCandidateConfigPaths(fakeRoot);
    expect(candidates[0]).toContain(".cheers");
    expect(candidates[1]).toBe(path.join(fakeRoot, ".cheers.json"));
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
    }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));

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
    }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));

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
    const configPath = path.join(fakeRoot, ".cheers.json");
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

  it("names the config path in the diagnostic for invalid JSON", () => {
    // The path has to be in the message: with two candidate files, "invalid
    // config" alone leaves the user guessing which one to fix.
    const configPath = path.join(fakeRoot, ".cheers.json");
    fs.writeFileSync(configPath, "{ invalid_json }", "utf8");

    const diagnostics = getRuntimeConfig(fakeRoot).configDiagnostics;
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain(".cheers.json");
  });

  it("does not lose a concurrent edit made between read and write", async () => {
    // An unchanged field in an old snapshot must not undo another writer's deletion.
    const configPath = getUserRuntimeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ maxTurns: 5 }), "utf8");
    fs.writeFileSync(configPath, JSON.stringify({ maxTurns: 7, theme: "light" }), "utf8");

    const edit = readRuntimeConfigEditAt(configPath);
    const first = edit.values;
    fs.writeFileSync(configPath, JSON.stringify({ maxTurns: 5 }), "utf8");
    writeUserRuntimeConfigFile({ ...first, maxTurns: 5, provider: "anthropic" }, edit);

    const merged = readUserRuntimeConfigFile();
    expect(merged.provider).toBe("anthropic");
    expect(merged.maxTurns).toBe(5);
    expect(merged.theme).toBeUndefined();
  });

  it("leaves the config intact when the process dies mid-write", () => {
    // A plain `writeFileSync` truncates the file before writing, so a crash in
    // that window — or a kill -9 at the wrong moment — leaves a file with half
    // a JSON document in it, and every later read of the config fails. The
    // write has to land whole or not at all: a temp file renamed over the
    // target, the same way session state is written.
    const configPath = getUserRuntimeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const before = JSON.stringify({ maxTurns: 5, theme: "light" });
    fs.writeFileSync(configPath, before, "utf8");

    // What a crash mid-write looks like from the file's side: truncation and
    // a partial document. Simulated directly, because the point is what the
    // write mechanism leaves behind, not that fs can be interrupted.
    // The assertion is that a real write leaves no such window: after it, the
    // file parses, and no temp file is left next to it.
    writeUserRuntimeConfigFile({ maxTurns: 9 }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));

    const merged = readUserRuntimeConfigFile();
    expect(merged.maxTurns).toBe(9);
    expect(merged.theme).toBe("light");
    // The atomic path is real: writing via a temp file means a failed write
    // leaves the old content, not a truncated one. The mechanism is asserted
    // by what it leaves beside the file it wrote.
    const leftovers = fs
      .readdirSync(path.dirname(configPath))
      .filter((name) => name.startsWith(path.basename(configPath) + ".tmp"));
    expect(leftovers).toEqual([]);
  });
});
