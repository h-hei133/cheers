import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getUserRuntimeConfigPath } from "../../config/runtimeConfig.js";
import { writeUserRuntimeConfigFile } from "../../config/runtimeConfig.js";
import { runConnectCommand } from "./connectCommandRuntime.js";
import { runModelCommand } from "./modelCommandRuntime.js";

describe("model command runtime", () => {
  const originalHome = process.env.USERPROFILE;
  const originalUnixHome = process.env.HOME;
  let fakeHome = "";
  let workspaceRoot = "";

  beforeEach(async () => {
    fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-model-home-"),
    );
    workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-model-root-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    await runConnectCommand(["login", "openai", "--api-key", "sk-test-key"], {
      cwd: workspaceRoot,
    });
  });

  afterEach(() => {
    process.env.USERPROFILE = originalHome;
    process.env.HOME = originalUnixHome;
    fs.rmSync(fakeHome, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("shows model status", async () => {
    const result = await runModelCommand(["status"], { cwd: workspaceRoot });
    expect(result.kind).toBe("local");
    expect(result.output).toContain("Model selection status");
    expect(result.output).toContain("Provider: openai");
    expect(result.output).toContain("Provider readiness");
    expect(result.output).toContain("npm run verify:provider-readiness");
  });

  it("explains missing active connection", async () => {
    writeUserRuntimeConfigFile({
      provider: "openai",
      providerConnections: [
        {
          id: "openai-test",
          provider: "openai",
          authType: "api-key",
          apiKey: "sk-test",
          model: "gpt-4.1-mini",
          status: "connected",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const result = await runModelCommand(["status"], { cwd: workspaceRoot });

    expect(result.output).toContain("Active connection: none");
    expect(result.output).toContain("Config status: no active connection selected");
    expect(result.output).toContain("/connect status");
  });

  it("explains incomplete active provider config", async () => {
    writeUserRuntimeConfigFile({
      provider: "openai-compatible",
      activeProviderConnectionId: "sf-test",
      providerConnections: [
        {
          id: "sf-test",
          provider: "openai-compatible",
          authType: "api-key",
          apiKey: "sk-test",
          status: "connected",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const result = await runModelCommand(["status"], { cwd: workspaceRoot });

    expect(result.output).toContain("Provider: openai-compatible");
    expect(result.output).toContain("requires base URL");
    expect(result.output).toContain("--base-url <url> --model <model>");
  });

  it("explains pending and error connection states", async () => {
    writeUserRuntimeConfigFile({
      provider: "openai",
      activeProviderConnectionId: "pending-test",
      providerConnections: [
        {
          id: "pending-test",
          provider: "openai",
          authType: "browser-assisted-capture",
          status: "pending",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const pending = await runModelCommand(["status"], { cwd: workspaceRoot });
    expect(pending.output).toContain("connection setup is pending");

    writeUserRuntimeConfigFile({
      provider: "openai",
      activeProviderConnectionId: "error-test",
      providerConnections: [
        {
          id: "error-test",
          provider: "openai",
          authType: "browser-assisted-capture",
          status: "error",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const error = await runModelCommand(["status"], { cwd: workspaceRoot });
    expect(error.output).toContain("connection setup is in error state");
  });

  it("updates active model and persists to active connection", async () => {
    const result = await runModelCommand(["use", "gpt-5.4"], {
      cwd: workspaceRoot,
    });
    expect(result.kind).toBe("local");
    expect(result.output).toContain("Model switched to gpt-5.4");

    const stored = JSON.parse(
      fs.readFileSync(getUserRuntimeConfigPath(), "utf8"),
    ) as {
      activeProviderConnectionId?: string;
      providerConnections?: Array<{ id: string; model?: string }>;
      providerCredentials?: { openai?: { model?: string } };
    };
    const active = stored.providerConnections?.find(
      (connection) => connection.id === stored.activeProviderConnectionId,
    );
    expect(active?.model).toBe("gpt-5.4");
    expect(stored.providerCredentials?.openai?.model).toBe("gpt-5.4");
  });

  it("answers a bare /model with the catalogue, grouped by provider", async () => {
    const result = await runModelCommand([], { cwd: workspaceRoot });

    expect(result.output).toContain("### Providers and models");
    expect(result.output).toContain("**Anthropic**");
    expect(result.output).toContain("**SiliconFlow**");
    // Grouping is the point: the same model name can appear under two providers,
    // so a row is only meaningful with its provider attached.
    expect(result.output).toContain("`/model use <provider>/<model>`");
  });

  it("refuses a model that belongs to a provider that is not connected", async () => {
    const result = await runModelCommand(["use", "openrouter/openai/gpt-5.3"], {
      cwd: workspaceRoot,
    });

    expect(result.output).toMatch(/openrouter|No active connection/);
  });
});
