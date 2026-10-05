import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SessionManager } from "../SessionManager.js";
import { getRuntimeConfig, getUserRuntimeConfigPath, readUserRuntimeConfigFile, writeUserRuntimeConfigFile } from "../../config/runtimeConfig.js";
import { runModelCommand } from "../../core/commands/modelCommandRuntime.js";
import { createCliProviderRuntimeBridge } from "../../cli/provider/cliProviderRuntimeBridge.js";
import { createShellRuntimeContext, refreshShellRuntimeConfig, switchActiveSession } from "../../core/shell/runtimeContext.js";
import { createSessionStoreLayout, locateExistingSessionLayout } from "../store/sessionFileLayout.js";
import { readSessionModel, writeSessionModel } from "./state.js";
import { projectSessionModel } from "./projection.js";
import { writeSessionState } from "../store/sessionStateStore.js";
import * as configStore from "../../config/runtimeConfig.js";

let home: string;
let manager: SessionManager;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "model-scope-"));
  vi.stubEnv("HOME", home); vi.stubEnv("USERPROFILE", home);
  writeUserRuntimeConfigFile({ provider: "openai", activeProviderConnectionId: "fixture", providerConnections: [{
    id: "fixture", provider: "openai", authType: "api-key", apiKey: "synthetic-key", model: "base-model",
    createdAt: "2026-01-01", updatedAt: "2026-01-01", status: "connected",
  }] });
  manager = new SessionManager();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

it("persists a session-only selection through lifecycle writes, restart and session switching", async () => {
  const one = manager.createNew(home); const two = manager.createNew(home);
  const configPath = getUserRuntimeConfigPath(); const original = fs.readFileSync(configPath); const stamp = fs.statSync(configPath).mtimeMs;
  const context = createShellRuntimeContext({ cwd: home, originalCwd: home, projectRoot: home, targetPathBase: home,
    rootMode: "direct", gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
    session: one, runtimeConfig: getRuntimeConfig(home) });
  context.runtimeConfigOverrides = { allowedTools: ["Read"], offline: true, instructionBudgetBytes: 0 };
  refreshShellRuntimeConfig(context);
  const bridge = createCliProviderRuntimeBridge({ projectRoot: home, options: {}, env: {}, currentSession: () => context.session });
  expect(bridge.resolveCredentialSnapshot().model).toBe("base-model");
  const result = await runModelCommand(["use", "session-model"], { cwd: home, sessionId: one.id });
  expect(result.output).toContain("saved for resume");
  expect(fs.readFileSync(configPath)).toEqual(original); expect(fs.statSync(configPath).mtimeMs).toBe(stamp);
  expect(bridge.resolveCredentialSnapshot().credential?.model).toBe("session-model");
  manager.addTurn(one.id, { role: "user", content: "persist this session" });
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), one.id);
  writeSessionState({ session: one, layout });
  expect(readSessionModel(one.id)?.model).toBe("session-model");
  switchActiveSession(context, two);
  expect(context.runtimeConfig.allowedTools).toEqual(["Read"]);
  expect(context.runtimeConfig.offline).toBe(true);
  expect(context.runtimeConfig.instructionBudgetBytes).toBe(0);
  expect(bridge.resolveCredentialSnapshot().model).toBe("base-model");
  manager.persistUserPromptBarrier(one.id, "resume the fixture");
  manager.saveInterrupted(one.id);
  const restarted = new SessionManager();
  const resumed = restarted.tryResume(one.id);
  expect(resumed).toMatchObject({ ok: true });
  switchActiveSession(context, restarted.getSession(one.id)!);
  expect(bridge.resolveCredentialSnapshot().model).toBe("session-model");
  expect(context.runtimeConfig.providerConnections[0]?.model).toBe("session-model");
  expect((await runModelCommand(["status"], { cwd: home, sessionId: one.id })).output).toContain("Model: session-model");
});

it("changes defaults only explicitly while other session overrides remain independent", async () => {
  const one = manager.createNew(home); const two = manager.createNew(home);
  await runModelCommand(["first"], { cwd: home, sessionId: one.id });
  const result = await runModelCommand(["set", "second", "--global"], { cwd: home, sessionId: two.id });
  expect(result.output).toContain("Global default stored at");
  expect(readUserRuntimeConfigFile().providerConnections?.[0]?.model).toBe("second");
  expect(projectSessionModel(getRuntimeConfig(home), one.id).providerConnections[0]?.model).toBe("first");
  expect(projectSessionModel(getRuntimeConfig(home), two.id).providerConnections[0]?.model).toBe("second");
});

it("does not transfer a selection to a different connection or provider", () => {
  const session = manager.createNew(home);
  writeSessionModel(session.id, { connectionId: "fixture", provider: "openai", model: "private-model" });
  const config = getRuntimeConfig(home);
  expect(projectSessionModel({ ...config, activeProviderConnectionId: "other" }, session.id).providerConnections[0]?.model).toBe("base-model");
  expect(projectSessionModel({ ...config, providerConnections: [{ ...config.providerConnections[0]!, provider: "google" }] }, session.id).providerConnections[0]?.model).toBe("base-model");
  expect(config.providerConnections[0]?.model).toBe("base-model");
});

it.each([ ["status", "extra"], ["refresh", "extra"], ["config", "extra"], ["use", "m", "extra"],
  ["use", "m", "--global=false"], ["use", "m", "--global", "--global"], ["use", "m", "--refresh"],
  ["list", "openai", "extra"], ["list", "--unknown"], ["m", "extra"],
])("rejects invalid syntax before file or network effects: %j", async (...args) => {
  const session = manager.createNew(home); const config = fs.readFileSync(getUserRuntimeConfigPath());
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
  const result = await runModelCommand(args, { cwd: home, sessionId: session.id });
  expect(result.output).toContain("Invalid model arguments");
  expect(fetch).not.toHaveBeenCalled(); expect(readSessionModel(session.id)).toBeUndefined();
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(config);
});

it("blocks a missing session without changing global defaults", async () => {
  const original = fs.readFileSync(getUserRuntimeConfigPath());
  const result = await runModelCommand(["use", "new", "--global"], { cwd: home, sessionId: "missing" });
  expect(result.output).toContain("session preference");
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(original);
  expect(readSessionModel("missing")).toBeUndefined();
});

it("retains a model-only session at exit without retaining ordinary empty sessions", async () => {
  const selected = manager.createNew(home); const empty = manager.createNew(home);
  await runModelCommand(["session-model"], { cwd: home, sessionId: selected.id });
  manager.saveTerminated(selected.id);
  expect(manager.sessionExists(selected.id)).toBe(true);
  expect(readSessionModel(selected.id)?.model).toBe("session-model");
  manager.saveTerminated(empty.id);
  expect(manager.sessionExists(empty.id)).toBe(false);
});

it("reports a partial result when the session save succeeds and the global save fails", async () => {
  const session = manager.createNew(home);
  const original = fs.readFileSync(getUserRuntimeConfigPath());
  vi.spyOn(configStore, "writeUserRuntimeConfigFile").mockImplementation(() => { throw new Error("sensitive fixture error"); });
  const refreshRuntimeConfig = vi.fn();
  const result = await runModelCommand(["use", "new", "--global"], { cwd: home, sessionId: session.id, refreshRuntimeConfig });
  expect(result.output).toContain("Session model switched to new, but saving the global default failed");
  expect(result.output).not.toContain("sensitive fixture error");
  expect(readSessionModel(session.id)?.model).toBe("new");
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(original);
  expect(refreshRuntimeConfig).toHaveBeenCalledOnce();
});

it("rejects damaged session state without replacing it or writing global defaults", async () => {
  const session = manager.createNew(home);
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), session.id);
  fs.writeFileSync(layout.statePath, "{broken");
  const original = fs.readFileSync(getUserRuntimeConfigPath());
  const result = await runModelCommand(["use", "new", "--global"], { cwd: home, sessionId: session.id });
  expect(result.output).toContain("Model switch failed: session preference");
  expect(fs.readFileSync(layout.statePath, "utf8")).toBe("{broken");
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(original);
});
