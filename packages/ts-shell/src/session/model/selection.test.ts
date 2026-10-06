import { readRuntimeConfigEditAt } from "../../config/runtimeConfig.js";
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
import { readSessionModel, readSessionModelEdit, writeSessionModel } from "./state.js";
import { projectSessionModel } from "./projection.js";
import { writeSessionState } from "../store/sessionStateStore.js";
import * as configStore from "../../config/runtimeConfig.js";
import * as files from '../store/sessionFileStore.js';
import { defaultHookDispatcher } from '../../core/hooks/hookDispatcher.js';

let home: string;
let manager: SessionManager;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "model-scope-"));
  vi.stubEnv("HOME", home); vi.stubEnv("USERPROFILE", home);
  writeUserRuntimeConfigFile({ provider: "openai", activeProviderConnectionId: "fixture", providerConnections: [{
    id: "fixture", provider: "openai", authType: "api-key", apiKey: "synthetic-key", model: "base-model",
    createdAt: "2026-01-01", updatedAt: "2026-01-01", status: "connected",
  }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
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
  const bridge = createCliProviderRuntimeBridge({ runtimeConfig: () => context.runtimeConfig, options: {}, env: {} });
  expect(bridge.resolveCredentialSnapshot().model).toBe("base-model");
  const result = await runModelCommand(["use", "session-model"], { cwd: home, sessionId: one.id,
    runtimeConfig: context.runtimeConfig, refreshRuntimeConfig: () => refreshShellRuntimeConfig(context) });
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
  writeSessionModel(session.id, { connectionId: "fixture", provider: "openai", model: "private-model" }, readSessionModelEdit(session.id));
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

it('rejects a delayed older selection after another command has saved a newer model', async () => {
  const session = manager.createNew(home); const original = fs.readFileSync(getUserRuntimeConfigPath());
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch' && event.toModel === 'old') await gate;
    return undefined;
  });
  const refreshRuntimeConfig = vi.fn();
  const pending = runModelCommand(['old', '--global'], { cwd: home, sessionId: session.id, refreshRuntimeConfig });
  const winner = await runModelCommand(['new'], { cwd: home, sessionId: session.id });
  expect(winner.output).toContain('Model switched to new');
  const state = fs.readFileSync(locateExistingSessionLayout(createSessionStoreLayout(), session.id).statePath);
  release();
  expect((await pending).output).toContain('conflict: this attempt did not write');
  expect(readSessionModel(session.id)?.model).toBe('new');
  expect(fs.readFileSync(locateExistingSessionLayout(createSessionStoreLayout(), session.id).statePath)).toEqual(state);
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(original);
  expect(refreshRuntimeConfig).not.toHaveBeenCalled();
});

it('refuses a connection whose credential was replaced while the selection hook ran', async () => {
  const session = manager.createNew(home); let external!: Buffer;
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') {
      const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
      writeUserRuntimeConfigFile({ providerConnections: edit.values.providerConnections?.map(item => ({ ...item, apiKey: 'SYNTHETIC_ROTATED_SECRET' })) }, edit);
      external = fs.readFileSync(getUserRuntimeConfigPath());
    }
    return undefined;
  });
  const result = await runModelCommand(['late', '--global'], { cwd: home, sessionId: session.id });
  expect(result.output).toContain('conflict: this attempt did not write');
  expect(result.output).not.toContain('SYNTHETIC_ROTATED_SECRET');
  expect(readSessionModel(session.id)).toBeUndefined();
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(external);
});

it('checks current admission after the asynchronous hook before either write', async () => {
  const session = manager.createNew(home); const original = fs.readFileSync(getUserRuntimeConfigPath());
  let blocked = false;
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') blocked = true;
    return undefined;
  });
  const result = await runModelCommand(['late', '--global'], { cwd: home, sessionId: session.id, admission: () => blocked ? 'private diagnostic' : undefined });
  expect(result.output).toContain('admission changed');
  expect(result.output).not.toContain('private diagnostic');
  expect(readSessionModel(session.id)).toBeUndefined();
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(original);
});

it('does not apply or write global defaults when the session writer returns without saving', async () => {
  const session = manager.createNew(home); const original = fs.readFileSync(getUserRuntimeConfigPath());
  const hook = vi.spyOn(defaultHookDispatcher, 'dispatch').mockResolvedValue(undefined);
  vi.spyOn(files, 'writeJsonFileAtomic').mockImplementation(() => {});
  const refreshRuntimeConfig = vi.fn();
  const result = await runModelCommand(['lost', '--global'], { cwd: home, sessionId: session.id, refreshRuntimeConfig });
  expect(result.output).toContain('verification-failed');
  expect(result.output).not.toContain('Model switched');
  expect(refreshRuntimeConfig).not.toHaveBeenCalled();
  expect(hook.mock.calls.some(([event]) => event.eventName === 'PostModelSwitch')).toBe(false);
  expect(readSessionModel(session.id)).toBeUndefined();
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(original);
});

it('does not redirect a selection from the accepted connection to a newly selected disk connection', async () => {
  const session = manager.createNew(home); const runtimeConfig = getRuntimeConfig(home);
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ activeProviderConnectionId: 'other', providerConnections: [
    ...edit.values.providerConnections!, { ...edit.values.providerConnections![0]!, id: 'other' },
  ] }, edit);
  const original = fs.readFileSync(getUserRuntimeConfigPath());
  const hook = vi.spyOn(defaultHookDispatcher, 'dispatch');
  const result = await runModelCommand(['lost', '--global'], { cwd: home, sessionId: session.id, runtimeConfig });
  expect(result.output).toContain('differs from the accepted session configuration');
  expect(hook).not.toHaveBeenCalled();
  expect(readSessionModel(session.id)).toBeUndefined();
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(original);
});

it.each(['apiKey', 'baseUrl', 'authType', 'credential'])('rejects same-ID %s replacement before dispatching a model hook', async field => {
  const session = manager.createNew(home); const runtimeConfig = getRuntimeConfig(home);
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const replacement = field === 'apiKey' ? { apiKey: 'SYNTHETIC_NEW_KEY' }
    : field === 'baseUrl' ? { baseUrl: 'https://new-endpoint.invalid/v1' } : { authType: 'browser-assisted-capture' as const };
  writeUserRuntimeConfigFile(field === 'credential' ? { providerCredentials: { openai: { baseUrl: 'https://credential-endpoint.invalid/v1' } } }
    : { providerConnections: edit.values.providerConnections?.map(item => ({ ...item, ...replacement })) }, edit);
  const original = fs.readFileSync(getUserRuntimeConfigPath()); const hook = vi.spyOn(defaultHookDispatcher, 'dispatch');
  const result = await runModelCommand(['pending', '--global'], { cwd: home, sessionId: session.id, runtimeConfig });
  expect(result.output).toContain('differs from the accepted session configuration');
  expect(hook).not.toHaveBeenCalled(); expect(readSessionModel(session.id)).toBeUndefined();
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(original);
});

it('rejects a saved workspace that was rebound before the command captured its baseline', async () => {
  const session = manager.createNew(home); const target = locateExistingSessionLayout(createSessionStoreLayout(), session.id);
  const raw = JSON.parse(fs.readFileSync(target.statePath, 'utf8'));
  fs.writeFileSync(target.statePath, JSON.stringify({ ...raw, projectRoot: path.join(home, 'rebound') }));
  const original = fs.readFileSync(target.statePath); const hook = vi.spyOn(defaultHookDispatcher, 'dispatch');
  const result = await runModelCommand(['pending'], { cwd: home, projectRoot: home, sessionId: session.id });
  expect(result.output).toContain('saved session workspace differs');
  expect(hook).not.toHaveBeenCalled(); expect(fs.readFileSync(target.statePath)).toEqual(original);
});

it('rechecks credentials after acquiring the session lock', async () => {
  const session = manager.createNew(home); const target = locateExistingSessionLayout(createSessionStoreLayout(), session.id);
  const lock = files.withFileLock; let external!: Buffer;
  vi.spyOn(files, 'withFileLock').mockImplementation((file, action, options) => lock(file, () => {
    if (file === target.stateLockPath) {
      const config = JSON.parse(fs.readFileSync(getUserRuntimeConfigPath(), 'utf8'));
      config.providerConnections[0].apiKey = 'SYNTHETIC_LOCK_ROTATION';
      fs.writeFileSync(getUserRuntimeConfigPath(), JSON.stringify(config));
      external = fs.readFileSync(getUserRuntimeConfigPath());
    }
    return action();
  }, options));
  const result = await runModelCommand(['pending', '--global'], { cwd: home, sessionId: session.id });
  expect(result.output).toContain('conflict: this attempt did not write');
  expect(readSessionModel(session.id)).toBeUndefined(); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(external);
});

it('allows sequential selections and a no-op after a model-only session overlay is published', async () => {
  const session = manager.createNew(home);
  const context = createShellRuntimeContext({ cwd: home, originalCwd: home, projectRoot: home, targetPathBase: home,
    rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
    session, runtimeConfig: getRuntimeConfig(home) });
  const original = fs.readFileSync(getUserRuntimeConfigPath());
  expect(context.runtimeConfig.providerCredentials.openai).toBeUndefined();
  for (const model of ['first-choice', 'second-choice', 'second-choice']) {
    const before = readSessionModelEdit(session.id);
    const result = await runModelCommand([model], { cwd: home, projectRoot: home, sessionId: session.id,
      runtimeConfig: context.runtimeConfig, refreshRuntimeConfig: () => refreshShellRuntimeConfig(context) });
    expect(result.output).toContain(`Model switched to ${model}`);
    expect(context.runtimeConfig.providerConnections[0]?.model).toBe(model);
    expect(context.runtimeConfig.providerCredentials.openai).toEqual({ model });
    expect(readSessionModel(session.id)?.model).toBe(model);
    if (before.selection?.model === model) expect(readSessionModelEdit(session.id).revision).toBe(before.revision);
  }
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(original);
});
