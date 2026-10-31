import { readRuntimeConfigEditAt } from "../../config/runtimeConfig.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SessionManager } from "../SessionManager.js";
import { getRuntimeConfig, getUserAuthPath, getUserRuntimeConfigPath, readUserRuntimeConfigFile, writeUserRuntimeConfigFile } from "../../config/runtimeConfig.js";
import { runModelCommand } from "../../core/commands/modelCommandRuntime.js";
import { runThinkingCommand } from '../../core/commands/thinkingCommandRuntime.js';
import { createCliProviderRuntimeBridge, resolveCliCredential } from "../../cli/provider/cliProviderRuntimeBridge.js";
import { createShellRuntimeContext, refreshShellRuntimeConfig, switchActiveSession } from "../../core/shell/runtimeContext.js";
import { createSessionStoreLayout, locateExistingSessionLayout } from "../store/sessionFileLayout.js";
import { readSessionModel, readSessionModelEdit, writeSessionModel } from "./state.js";
import { projectModelSelection, projectSessionModel } from "./projection.js";
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { writeSessionState } from "../store/sessionStateStore.js";
import * as configStore from "../../config/runtimeConfig.js";
import * as files from '../store/sessionFileStore.js';
import { defaultHookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { buildCliCommandExecution } from '../../entrypoints/cliCommandExecutionBridge.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { userCatalogPath } from '../../core/models/catalogStore.js';

let home: string;
let manager: SessionManager;
function configBytes() {
  return [getUserRuntimeConfigPath(), getUserAuthPath()].map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined);
}
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

function addAlternateConnection(active = false) {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, ...(active ? { provider: 'google' as const, activeProviderConnectionId: 'alternate' } : {}),
    providerConnections: [...edit.values.providerConnections!, { id: 'alternate', provider: 'google', authType: 'api-key',
      apiKey: 'synthetic-alternate-key', model: 'alternate-base', createdAt: '2026-01-01', updatedAt: '2026-01-01' }] }, edit);
}

it.each(['/model new', '/model openai/new --global', '/model google/new', '/thinking high --global'])(
  'rejects a different request provider before hooks or writes through the command bridge: %s', async prompt => {
    addAlternateConnection();
    const session = manager.createNew(home);
    const config = configBytes();
    const statePath = locateExistingSessionLayout(createSessionStoreLayout(), session.id).statePath;
    const state = fs.readFileSync(statePath);
    const hooks = vi.spyOn(defaultHookDispatcher, 'dispatch');
    const lines: string[] = [];
    const runtimeConfig = getRuntimeConfig(home);
    expect(resolveCliCredential(runtimeConfig, { provider: 'google' }, {}).model).toBe('alternate-base');
    const result = await buildCliCommandExecution({ prompt, cwd: home, projectRoot: home, sessionId: session.id,
      runtimeConfig, resolveConfigTarget: config => resolveCliCredential(config, { provider: 'google' }, {}),
      interactive: true, printMode: false, renderer: { renderLine: (line: string) => lines.push(line) } as StreamingRenderer });
    expect(result.kind).toBe('handled');
    expect(lines.join(' ')).toContain('request provider differs');
    expect(lines.join(' ')).not.toMatch(/synthetic-alternate-key|Model switched|preference saved/i);
    expect(hooks).not.toHaveBeenCalled();
    expect(configBytes()).toEqual(config);
    expect(fs.readFileSync(statePath)).toEqual(state);
  });

it('allows an explicit request provider after selecting its matching saved connection', async () => {
  addAlternateConnection(true);
  const session = manager.createNew(home);
  const runtimeConfig = getRuntimeConfig(home);
  const resolveConfigTarget = (config: typeof runtimeConfig) => resolveCliCredential(config, { provider: 'google' }, {});
  const result = await runModelCommand(['google/new', '--global'], { cwd: home, projectRoot: home, sessionId: session.id,
    runtimeConfig, resolveConfigTarget });
  expect(result.output).toContain('Model switched to new');
  const saved = readUserRuntimeConfigFile();
  expect(saved.providerConnections?.find(item => item.id === 'fixture')?.model).toBe('base-model');
  expect(readSessionModel(session.id)).toMatchObject({ connectionId: 'alternate', provider: 'google', model: 'new' });
  expect(resolveConfigTarget(projectSessionModel(getRuntimeConfig(home), session.id)).model).toBe('new');
});

it('rejects a request provider change during the model hook before committing either store', async () => {
  addAlternateConnection();
  const session = manager.createNew(home);
  const config = configBytes();
  const statePath = locateExistingSessionLayout(createSessionStoreLayout(), session.id).statePath;
  const state = fs.readFileSync(statePath);
  let provider: 'openai' | 'google' = 'openai';
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') provider = 'google';
    return undefined;
  });
  const result = await runModelCommand(['new', '--global'], { cwd: home, projectRoot: home, sessionId: session.id,
    resolveConfigTarget: config => resolveCliCredential(config, { provider }, {}) });
  expect(result.output).toContain('conflict: this attempt did not write');
  expect(configBytes()).toEqual(config);
  expect(fs.readFileSync(statePath)).toEqual(state);
});

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

it('keeps independent provider preferences and origins intact under a named session selection', () => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ providerCredentials: { openai: { apiKey: 'synthetic-independent', model: 'provider-model', thinkingEffort: 'high' } } }, edit);
  const config = getRuntimeConfig(home);
  const projected = projectModelSelection(config, { connectionId: 'fixture', connectionScope: 'session', provider: 'openai', model: 'session-model', thinkingEffort: null });
  expect(projected.providerCredentials).toBe(config.providerCredentials);
  expect(projected.configProvenance.providerCredentials).toBe(config.configProvenance.providerCredentials);
  expect(projected.providerConnections[0]).toMatchObject({ model: 'session-model', thinkingEffort: null });
  expect(projected.configProvenance.providerConnections.children?.['0'].children?.model.sources).toEqual(['session']);
  expect(resolveProviderCredential({ runtimeConfig: projected, env: {} })).toMatchObject({ model: 'session-model', thinkingEffort: null, credential: { source: 'connection' } });
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
  const session = manager.createNew(home); const config = configBytes();
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
  const result = await runModelCommand(args, { cwd: home, sessionId: session.id });
  expect(result.output).toContain("Invalid model arguments");
  expect(fetch).not.toHaveBeenCalled(); expect(readSessionModel(session.id)).toBeUndefined();
  expect(configBytes()).toEqual(config);
});

it("blocks a missing session without changing global defaults", async () => {
  const original = configBytes();
  const result = await runModelCommand(["use", "new", "--global"], { cwd: home, sessionId: "missing" });
  expect(result.output).toContain("session preference");
  expect(configBytes()).toEqual(original);
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
  const original = configBytes();
  vi.spyOn(configStore, "writeUserRuntimeConfigFile").mockImplementation(() => { throw new Error("sensitive fixture error"); });
  const refreshRuntimeConfig = vi.fn();
  const result = await runModelCommand(["use", "new", "--global"], { cwd: home, sessionId: session.id, refreshRuntimeConfig });
  expect(result.output).toContain("Session preference saved and verified. Global write outcome is unverified.");
  expect(result.output).not.toContain("sensitive fixture error");
  expect(readSessionModel(session.id)?.model).toBe("new");
  expect(configBytes()).toEqual(original);
  expect(refreshRuntimeConfig).not.toHaveBeenCalled();
});

it("rejects damaged session state without replacing it or writing global defaults", async () => {
  const session = manager.createNew(home);
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), session.id);
  fs.writeFileSync(layout.statePath, "{broken");
  const original = configBytes();
  const result = await runModelCommand(["use", "new", "--global"], { cwd: home, sessionId: session.id });
  expect(result.output).toContain("Model switch failed: session preference");
  expect(fs.readFileSync(layout.statePath, "utf8")).toBe("{broken");
  expect(configBytes()).toEqual(original);
});

it('rejects a delayed older selection after another command has saved a newer model', async () => {
  const session = manager.createNew(home); const original = configBytes();
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
  expect(configBytes()).toEqual(original);
  expect(refreshRuntimeConfig).not.toHaveBeenCalled();
});

it('refuses a connection whose credential was replaced while the selection hook ran', async () => {
  const session = manager.createNew(home); let external!: ReturnType<typeof configBytes>;
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') {
      const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
      writeUserRuntimeConfigFile({ providerConnections: edit.values.providerConnections?.map(item => ({ ...item, apiKey: 'SYNTHETIC_ROTATED_SECRET' })) }, edit);
      external = configBytes();
    }
    return undefined;
  });
  const result = await runModelCommand(['late', '--global'], { cwd: home, sessionId: session.id });
  expect(result.output).toContain('conflict: this attempt did not write');
  expect(result.output).not.toContain('SYNTHETIC_ROTATED_SECRET');
  expect(readSessionModel(session.id)).toBeUndefined();
  expect(configBytes()).toEqual(external);
});

it('checks current admission after the asynchronous hook before either write', async () => {
  const session = manager.createNew(home); const original = configBytes();
  let blocked = false;
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') blocked = true;
    return undefined;
  });
  const result = await runModelCommand(['late', '--global'], { cwd: home, sessionId: session.id, admission: () => blocked ? 'private diagnostic' : undefined });
  expect(result.output).toContain('admission changed');
  expect(result.output).not.toContain('private diagnostic');
  expect(readSessionModel(session.id)).toBeUndefined();
  expect(configBytes()).toEqual(original);
});

it('does not apply or write global defaults when the session writer returns without saving', async () => {
  const session = manager.createNew(home); const original = configBytes();
  const hook = vi.spyOn(defaultHookDispatcher, 'dispatch').mockResolvedValue(undefined);
  vi.spyOn(files, 'writeJsonFileAtomic').mockImplementation(() => {});
  const refreshRuntimeConfig = vi.fn();
  const result = await runModelCommand(['lost', '--global'], { cwd: home, sessionId: session.id, refreshRuntimeConfig });
  expect(result.output).toContain('verification-failed');
  expect(result.output).not.toContain('Model switched');
  expect(refreshRuntimeConfig).not.toHaveBeenCalled();
  expect(hook.mock.calls.some(([event]) => event.eventName === 'PostModelSwitch')).toBe(false);
  expect(readSessionModel(session.id)).toBeUndefined();
  expect(configBytes()).toEqual(original);
});

it('does not redirect a selection from the accepted connection to a newly selected disk connection', async () => {
  const session = manager.createNew(home); const runtimeConfig = getRuntimeConfig(home);
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ activeProviderConnectionId: 'other', providerConnections: [
    ...edit.values.providerConnections!, { ...edit.values.providerConnections![0]!, id: 'other' },
  ] }, edit);
  const original = configBytes();
  const hook = vi.spyOn(defaultHookDispatcher, 'dispatch');
  const result = await runModelCommand(['lost', '--global'], { cwd: home, sessionId: session.id, runtimeConfig });
  expect(result.output).toContain('differs from the accepted session configuration');
  expect(hook).not.toHaveBeenCalled();
  expect(readSessionModel(session.id)).toBeUndefined();
  expect(configBytes()).toEqual(original);
});

it.each(['apiKey', 'baseUrl', 'authType', 'credential'])('rejects same-ID %s replacement before dispatching a model hook', async field => {
  const session = manager.createNew(home); const runtimeConfig = getRuntimeConfig(home);
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const replacement = field === 'apiKey' ? { apiKey: 'SYNTHETIC_NEW_KEY' }
    : field === 'baseUrl' ? { baseUrl: 'https://new-endpoint.invalid/v1' } : { authType: 'browser-assisted-capture' as const };
  writeUserRuntimeConfigFile(field === 'credential' ? { providerCredentials: { openai: { baseUrl: 'https://credential-endpoint.invalid/v1' } } }
    : { providerConnections: edit.values.providerConnections?.map(item => ({ ...item, ...replacement })) }, edit);
  const original = configBytes(); const hook = vi.spyOn(defaultHookDispatcher, 'dispatch');
  const result = await runModelCommand(['pending', '--global'], { cwd: home, sessionId: session.id, runtimeConfig });
  expect(result.output).toContain('differs from the accepted session configuration');
  expect(hook).not.toHaveBeenCalled(); expect(readSessionModel(session.id)).toBeUndefined();
  expect(configBytes()).toEqual(original);
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
  const lock = files.withFileLock; let external!: ReturnType<typeof configBytes>;
  vi.spyOn(files, 'withFileLock').mockImplementation((file, action, options) => lock(file, () => {
    if (file === target.stateLockPath) {
      const config = JSON.parse(fs.readFileSync(getUserAuthPath(), 'utf8'));
      config.providerConnections[0].apiKey = 'SYNTHETIC_LOCK_ROTATION';
      fs.writeFileSync(getUserAuthPath(), JSON.stringify(config), { mode: 0o600 });
      external = configBytes();
    }
    return action();
  }, options));
  const result = await runModelCommand(['pending', '--global'], { cwd: home, sessionId: session.id });
  expect(result.output).toContain('conflict: this attempt did not write');
  expect(readSessionModel(session.id)).toBeUndefined(); expect(configBytes()).toEqual(external);
});

it('allows sequential selections and a no-op after a model-only session overlay is published', async () => {
  const session = manager.createNew(home);
  const context = createShellRuntimeContext({ cwd: home, originalCwd: home, projectRoot: home, targetPathBase: home,
    rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
    session, runtimeConfig: getRuntimeConfig(home) });
  const original = configBytes();
  expect(context.runtimeConfig.providerCredentials.openai).toBeUndefined();
  for (const model of ['first-choice', 'second-choice', 'second-choice']) {
    const before = readSessionModelEdit(session.id);
    const result = await runModelCommand([model], { cwd: home, projectRoot: home, sessionId: session.id,
      runtimeConfig: context.runtimeConfig, refreshRuntimeConfig: () => refreshShellRuntimeConfig(context) });
    expect(result.output).toContain(`Model switched to ${model}`);
    expect(context.runtimeConfig.providerConnections[0]?.model).toBe(model);
    expect(context.runtimeConfig.providerCredentials.openai).toBeUndefined();
    expect(readSessionModel(session.id)?.model).toBe(model);
    if (before.selection?.model === model) expect(readSessionModelEdit(session.id).revision).toBe(before.revision);
  }
  expect(configBytes()).toEqual(original);
});

it.each(['fallback', 'pool'] as const)('binds a session model change to the resolved %s connection without changing shared defaults', async mode => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, activeProviderConnectionId: undefined,
    providerConnections: edit.values.providerConnections!.map(item => ({ ...item, thinkingEffort: 'low' as const })),
    providerCredentials: { openai: { apiKey: 'synthetic-independent', model: 'independent-model', thinkingEffort: 'high' } },
    ...(mode === 'pool' ? { accountPool: { openai: { connections: ['fixture'] } } } : {}) }, edit);
  fs.writeFileSync(userCatalogPath(), JSON.stringify({ providers: { openai: { models: [
    { id: 'base-model', reasoning: true }, { id: 'next-model', reasoning: true },
  ] } } }));
  const session = manager.createNew(home);
  const shell = createShellRuntimeContext({ cwd: home, originalCwd: home, projectRoot: home, targetPathBase: home,
    rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
    session, runtimeConfig: getRuntimeConfig(home),
    resolveConfigTarget: (config, sessionId) => resolveProviderCredential({ runtimeConfig: config, env: {}, pool: { sessionId } }) });
  const command = () => ({ cwd: home, projectRoot: home, sessionId: session.id, runtimeConfig: shell.runtimeConfig,
    resolveConfigTarget: (config: typeof shell.runtimeConfig, sessionId?: string) => resolveProviderCredential({ runtimeConfig: config, env: {}, pool: { sessionId } }),
    refreshRuntimeConfig: () => refreshShellRuntimeConfig(shell) });
  const original = configBytes();
  expect(command().resolveConfigTarget(shell.runtimeConfig, session.id).credential?.connectionId).toBe('fixture');
  expect((await runThinkingCommand([], command())).output).toContain('Thinking effort: low.');
  expect((await runThinkingCommand([], command())).output).toContain('Model: base-model.');
  expect((await runModelCommand(['next-model', '--effort', 'high'], command())).output).toContain('Model switched to next-model');
  expect(readSessionModel(session.id)).toEqual({ connectionScope: 'session', connectionId: 'fixture', provider: 'openai', model: 'next-model', thinkingEffort: 'high' });
  expect(command().resolveConfigTarget(shell.runtimeConfig, session.id)).toMatchObject({ model: 'next-model', thinkingEffort: 'high',
    credential: { connectionId: 'fixture', source: 'connection' } });
  expect((await runThinkingCommand([], command())).output).toContain('Thinking effort: high.');
  expect((await runThinkingCommand([], command())).output).toContain('Model: next-model.');
  expect(configBytes()).toEqual(original);
  expect(readUserRuntimeConfigFile().activeProviderConnectionId).toBeUndefined();
  manager.persistUserPromptBarrier(session.id, 'resume selected model'); manager.saveInterrupted(session.id);
  const restarted = new SessionManager(); expect(restarted.tryResume(session.id)).toMatchObject({ ok: true });
  const resumed = projectSessionModel(getRuntimeConfig(home), session.id);
  expect(command().resolveConfigTarget(resumed, session.id)).toMatchObject({ model: 'next-model', thinkingEffort: 'high', credential: { connectionId: 'fixture' } });
  expect((await runModelCommand(['base-model'], command())).output).toContain('Model switched to base-model');
  expect(readSessionModel(session.id)).toMatchObject({ connectionScope: 'session', connectionId: 'fixture', model: 'base-model' });
  expect(configBytes()).toEqual(original);
  const latest = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...latest.values,
    providerCredentials: { openai: { apiKey: 'synthetic-profile-must-not-be-used', model: 'base-model' } },
    providerConnections: [{ ...latest.values.providerConnections![0], id: 'replacement' }],
    ...(mode === 'pool' ? { accountPool: { openai: { connections: ['replacement'] } } } : {}) }, latest);
  const unavailable = command().resolveConfigTarget(projectSessionModel(getRuntimeConfig(home), session.id), session.id);
  expect(unavailable.blocked).toBe('connection-unavailable');
  expect(unavailable.credential).toBeUndefined();
});

it.each((['fallback', 'pool'] as const).flatMap(mode => [false, true].map(session => ({ mode, session }))))(
  'updates only the resolved $mode model default on an explicit global save with session=$session', async ({ mode, session: withSession }) => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, activeProviderConnectionId: undefined,
    providerCredentials: { openai: { apiKey: 'synthetic-independent', model: 'independent-model' } },
    ...(mode === 'pool' ? { accountPool: { openai: { connections: ['fixture'] } } } : {}) }, edit);
  const auth = fs.readFileSync(getUserAuthPath());
  const session = withSession ? manager.createNew(home) : undefined;
  const result = await runModelCommand(['next-model', '--effort', 'high', '--global'], { cwd: home, projectRoot: home,
    sessionId: session?.id,
    resolveConfigTarget: (config, sessionId) => resolveProviderCredential({ runtimeConfig: config, env: {}, pool: { sessionId } }) });
  expect(result.output).toContain('Global default stored at');
  const saved = readUserRuntimeConfigFile();
  expect(saved.activeProviderConnectionId).toBeUndefined();
  expect(saved.providerConnections?.[0]).toMatchObject({ model: 'next-model', thinkingEffort: 'high' });
  expect(saved.providerCredentials?.openai).toEqual({ apiKey: 'synthetic-independent', model: 'independent-model' });
  if (session) expect(readSessionModel(session.id)).toEqual({ connectionScope: 'session', connectionId: 'fixture', provider: 'openai', model: 'next-model', thinkingEffort: 'high' });
  expect(JSON.parse(fs.readFileSync(getUserAuthPath(), 'utf8')).providerConnections[0]).not.toHaveProperty('model');
  // Updating a model also updates the connection timestamp; credential material remains exact.
  const beforeAuth = JSON.parse(auth.toString('utf8'));
  const afterAuth = JSON.parse(fs.readFileSync(getUserAuthPath(), 'utf8'));
  delete beforeAuth.providerConnections[0].updatedAt; delete afterAuth.providerConnections[0].updatedAt;
  expect(afterAuth).toEqual(beforeAuth);
});

it.each(['fallback', 'pool'] as const)('refuses a changed %s selection after the model hook without saving to either connection', async mode => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const first = edit.values.providerConnections![0];
  writeUserRuntimeConfigFile({ ...edit.values, activeProviderConnectionId: undefined,
    providerConnections: [first, { ...first, id: 'replacement', apiKey: 'synthetic-replacement', model: 'other-model' }],
    ...(mode === 'pool' ? { accountPool: { openai: { connections: ['fixture'] } } } : {}) }, edit);
  const session = manager.createNew(home);
  const before = readSessionModelEdit(session.id);
  let external: ReturnType<typeof configBytes> | undefined;
  const request = (config: ReturnType<typeof getRuntimeConfig>, sessionId?: string) => resolveProviderCredential({ runtimeConfig: config, env: {}, pool: { sessionId } });
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') {
      const current = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
      writeUserRuntimeConfigFile({ ...current.values,
        ...(mode === 'pool' ? { accountPool: { openai: { connections: ['replacement'] } } }
          : { providerConnections: current.values.providerConnections!.map(item => item.id === 'replacement' ? { ...item, updatedAt: '2099-01-01' } : item) }) }, current);
      expect(request(getRuntimeConfig(home), session.id).credential?.connectionId).toBe('replacement');
      external = configBytes();
    }
    return undefined;
  });
  const result = await runModelCommand(['next-model', '--global'], { cwd: home, projectRoot: home, sessionId: session.id, resolveConfigTarget: request });
  expect(result.output).toContain('conflict: this attempt did not write');
  expect(external).toBeDefined(); expect(configBytes()).toEqual(external);
  expect(readSessionModelEdit(session.id)).toEqual(before);
});

it.each(['fallback', 'pool'] as const)('rechecks the resolved %s choice inside the session lock before saving', async mode => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const first = edit.values.providerConnections![0];
  writeUserRuntimeConfigFile({ ...edit.values, activeProviderConnectionId: undefined,
    providerConnections: [first, { ...first, id: 'replacement', apiKey: 'synthetic-replacement', model: 'other-model' }],
    ...(mode === 'pool' ? { accountPool: { openai: { connections: ['fixture'] } } } : {}) }, edit);
  const session = manager.createNew(home);
  const before = readSessionModelEdit(session.id);
  const target = locateExistingSessionLayout(createSessionStoreLayout(), session.id);
  const lock = files.withFileLock;
  let external: ReturnType<typeof configBytes> | undefined;
  vi.spyOn(files, 'withFileLock').mockImplementation((file, action, options) => lock(file, () => {
    if (file === target.stateLockPath) {
      const current = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
      writeUserRuntimeConfigFile({ ...current.values,
        ...(mode === 'pool' ? { accountPool: { openai: { connections: ['replacement'] } } }
          : { providerConnections: current.values.providerConnections!.map(item => item.id === 'replacement' ? { ...item, updatedAt: '2099-01-01' } : item) }) }, current);
      external = configBytes();
    }
    return action();
  }, options));
  const result = await runModelCommand(['next-model', '--global'], { cwd: home, projectRoot: home, sessionId: session.id,
    resolveConfigTarget: (config, sessionId) => resolveProviderCredential({ runtimeConfig: config, env: {}, pool: { sessionId } }) });
  expect(result.output).toContain('conflict: this attempt did not write');
  expect(external).toBeDefined(); expect(configBytes()).toEqual(external);
  expect(readSessionModelEdit(session.id)).toEqual(before);
});
