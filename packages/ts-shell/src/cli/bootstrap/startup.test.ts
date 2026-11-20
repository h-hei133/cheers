import fs from "node:fs";
import { syncBuiltinESMExports } from 'node:module';
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SessionManager } from "../../session/SessionManager.js";
import { createSessionStoreLayout } from "../../session/store/sessionFileLayout.js";
import { SessionStoreAccess } from '../../session/store/sessionStoreAccess.js';
import { promptIntentPath } from '../../session/store/prompt/intent.js';
import {
  getUserRuntimeConfigPath,
  readRuntimeConfigEditAt,
  writeUserRuntimeConfigFile,
} from "../../config/runtimeConfig.js";
import { selectPooledConnection } from "../../core/auth/account/pool.js";
import { StartupSurface } from '../interactive/startup.js';
import { RecordingTerminal, ManualScheduler } from '../../test-utils/terminalDouble.js';
import {
  createCliBootstrapRuntimeContext,
  createCliRootContext,
  prepareCliBootstrapRuntimeContext,
} from "./cliBootstrapContext.js";
import { cliExtensionArguments } from '../options/extensions.js';

let scratch = "";
let home = "";
let workspace = "";
const processPorts = { writeError: vi.fn(), exit: (): never => { throw new Error('root context unexpectedly exited'); } };

beforeEach(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-bootstrap-startup-"));
  home = path.join(scratch, "home");
  workspace = path.join(scratch, "workspace");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("GIT_CEILING_DIRECTORIES", scratch);
  vi.stubEnv("CHEERS_PROVIDER_MODE", "synthetic");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(scratch, { recursive: true, force: true });
});

it.each([0, 100, 1_000, 10_000])(
  "does not enumerate %i saved sessions before the startup context is ready",
  count => {
    const sessionsDir = createSessionStoreLayout(home).sessionsDir;
    fs.mkdirSync(sessionsDir, { recursive: true });
    for (let index = 0; index < count; index += 1) {
      fs.mkdirSync(path.join(sessionsDir, `saved-${index}`), { recursive: true });
    }

    const scan = vi.spyOn(SessionManager.prototype, "listSessions").mockImplementation(() => {
      throw new Error("startup must not enumerate saved sessions");
    });
    const options = {};
    const rootContext = createCliRootContext({ launchCwd: workspace, options, ...processPorts });
    const bootstrap = createCliBootstrapRuntimeContext({
      launchCwd: workspace,
      options,
      rootContext,
      writeError: vi.fn(),
      exit: () => {
        throw new Error("bootstrap unexpectedly exited");
      },
    });

    expect(scan).not.toHaveBeenCalled();
    expect(bootstrap.recoveryCandidate).toBeNull();
    expect(bootstrap.recoveryCandidateSummary).toBeNull();
    expect(bootstrap.runtimeContext.session.projectRoot).toBe(workspace);
  },
);

it("resolves a pooled target with the bootstrapped session identity", () => {
  const baseUrl = "https://fixture.invalid/v1";
  const connection = (id: string) => ({
    id, provider: "openai" as const, authType: "api-key" as const, apiKey: `synthetic-${id}`,
    baseUrl, model: "fixture", status: "connected" as const,
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
  });
  writeUserRuntimeConfigFile({
    provider: "openai",
    providerConnections: [connection("first"), connection("second")],
    accountPool: { openai: { connections: ["first", "second"] } },
  }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));

  const options = {};
  const rootContext = createCliRootContext({ launchCwd: workspace, options, ...processPorts });
  const bootstrap = createCliBootstrapRuntimeContext({
    launchCwd: workspace,
    options,
    rootContext,
    writeError: vi.fn(),
    exit: () => {
      throw new Error("bootstrap unexpectedly exited");
    },
  });
  const { session, resolveConfigTarget } = bootstrap.runtimeContext;
  const config = bootstrap.runtimeContext.runtimeConfig;
  expect(selectPooledConnection({
    config, provider: "openai", connectionId: "second", sessionId: session.id,
  })).toMatchObject({ connection: { id: "second" } });

  expect(resolveConfigTarget?.(config, session.id)).toMatchObject({
    credential: { connectionId: "second", apiKey: "synthetic-second" },
  });
});

it("rejects a missing explicit config before bootstrap", () => {
  const missing = path.join(workspace, "missing.json");
  expect(() => createCliRootContext({
    ...processPorts,
    launchCwd: workspace,
    options: { configPaths: [missing] },
  })).toThrow(/Explicit config input/);
});

it.each(['sessionId', 'forkSource'] as const)('keeps the real registry and source unchanged when a %s option is refused', async selection => {
  const manager = new SessionManager();
  const source = manager.createNew(workspace);
  const current = manager.createNew(workspace);
  manager.addTurn(source.id, { role: 'user', content: 'saved question' });
  const entry = path.join(workspace, 'extension.ts');
  fs.writeFileSync(entry, `export default async api => {
    await api.appendEntry('initialization', 'unadmitted write').catch(() => {});
    api.registerFlag({name:'known',type:'boolean'});
  };`);
  const options = { [selection]: source.id, extensionPaths: [entry] };
  const rootContext = createCliRootContext({ launchCwd: workspace, options, ...processPorts });
  const store = createSessionStoreLayout(home);
  const bytes = () => ({ registry: fs.readFileSync(store.currentSessionStorePath),
    sessions: fs.readdirSync(store.sessionsDir).sort().map(id => ({ id, records: fs.readdirSync(manager.getSessionDirPath(id)).sort()
      .map(name => ({ name, bytes: fs.readFileSync(path.join(manager.getSessionDirPath(id), name)) })) })) });
  const before = bytes();
  const unresolved = cliExtensionArguments([{ name: '--unexpected' }], () => {});
  await expect(prepareCliBootstrapRuntimeContext({ launchCwd: workspace, options, rootContext, ...processPorts }, unresolved))
    .rejects.toThrow(/not registered/);
  expect(bytes()).toEqual(before);
  expect(manager.resolveCurrentSessionForProject(workspace, { readOnly: true })).toMatchObject({ ok: true, session: { id: current.id } });
});

function interruptPromptAppend(publish: () => void): void {
  const append = fs.appendFileSync;
  const failure = vi.spyOn(fs, 'appendFileSync').mockImplementation((file, data, options) => {
    if (typeof file === 'number' && Buffer.isBuffer(data)) throw new Error('Interrupted prompt append.');
    return append(file, data, options);
  });
  syncBuiltinESMExports();
  try { expect(publish).toThrow(/persistence is unknown/i); }
  finally { failure.mockRestore(); syncBuiltinESMExports(); }
}

it.each(['current', 'sessionId', 'forkSource', 'forkCurrent', 'forkPrefix', 'settled'] as const)(
  'leaves a recoverable prompt transaction untouched until %s startup options pass', async selection => {
    const manager = new SessionManager();
    const access = new SessionStoreAccess();
    const unrelated = selection === 'forkPrefix' ? manager.createNewWithId('unrelated-session', workspace) : undefined;
    if (unrelated) interruptPromptAppend(() => manager.persistUserPromptBarrier(unrelated.id, 'Other prompt'));
    const unrelatedMarker = unrelated && promptIntentPath(access.stateLayout(unrelated.id));
    const session = manager.createNewWithId('selected-session', workspace);
    const layout = access.stateLayout(session.id);
    if (selection === 'settled') {
      manager.persistUserPromptBarrier(session.id, 'Recovered prompt');
      interruptPromptAppend(() => manager.saveCompleted(session.id));
    } else interruptPromptAppend(() => manager.persistUserPromptBarrier(session.id, 'Recovered prompt'));

    const marker = promptIntentPath(layout);
    const store = createSessionStoreLayout(home);
    const bytes = () => [layout.transcriptPath, layout.metadataPath, layout.statePath, marker, store.currentSessionStorePath,
      ...(unrelatedMarker ? [unrelatedMarker] : [])]
      .map(file => fs.readFileSync(file));
    const before = bytes();
    const entry = path.join(workspace, 'extension.ts');
    fs.writeFileSync(entry, `export default api => api.registerFlag({name:'known',type:'boolean'});`);
    const options = { extensionPaths: [entry], ...(selection === 'sessionId' ? { sessionId: session.id }
      : selection === 'forkSource' ? { forkSource: session.id } : selection === 'forkCurrent' ? { forkSource: 'current' }
      : selection === 'forkPrefix' ? { forkSource: 'selected-' } : {}) };
    const rootContext = createCliRootContext({ launchCwd: workspace, options, ...processPorts });
    const startup = { launchCwd: workspace, options, rootContext, ...processPorts };
    const unresolved = cliExtensionArguments([{ name: '--unexpected' }], vi.fn());
    await expect(prepareCliBootstrapRuntimeContext(startup, unresolved)).rejects.toThrow(/not registered/);
    expect(bytes()).toEqual(before);
    expect(fs.readdirSync(store.sessionsDir).sort()).toEqual(unrelated ? [session.id, unrelated.id] : [session.id]);

    const accepted = cliExtensionArguments([{ name: '--known' }], () => { expect(bytes()).toEqual(before); });
    const prepared = await prepareCliBootstrapRuntimeContext(startup, accepted);
    try {
      expect(fs.existsSync(marker)).toBe(false);
      expect(manager.getTranscriptEvents(session.id).filter(event => event.type === 'message' && event.role === 'user')).toHaveLength(1);
      if (selection === 'settled') {
        expect(prepared.runtime.runtimeContext.session.id).not.toBe(session.id);
        expect(manager.getSession(session.id)?.status).toBe('completed');
      } else if (selection === 'current' || selection === 'sessionId') expect(prepared.runtime.runtimeContext.session.id).toBe(session.id);
      else expect(prepared.runtime.runtimeContext.session).toMatchObject({ parentSession: session.id });
      if (unrelatedMarker) expect(fs.readFileSync(unrelatedMarker)).toEqual(before.at(-1));
    } finally { prepared.extensions.retire(); await prepared.runtime.mcpGateway.close(); }
  },
);

it('keeps a pending match in an ambiguous fork prefix without replaying it', async () => {
  const manager = new SessionManager();
  const pending = manager.createNewWithId('matching-pending', workspace);
  manager.createNewWithId('matching-clean', workspace);
  interruptPromptAppend(() => manager.persistUserPromptBarrier(pending.id, 'Pending prompt'));
  const layout = new SessionStoreAccess().stateLayout(pending.id);
  const store = createSessionStoreLayout(home);
  const files = [layout.transcriptPath, layout.metadataPath, layout.statePath, promptIntentPath(layout), store.currentSessionStorePath];
  const before = files.map(file => fs.readFileSync(file));
  const options = { forkSource: 'matching-' };
  const writeError = vi.fn();
  const rootContext = createCliRootContext({ launchCwd: workspace, options, ...processPorts });
  await expect(prepareCliBootstrapRuntimeContext({ launchCwd: workspace, options, rootContext, ...processPorts, writeError },
    cliExtensionArguments([], vi.fn())))
    .rejects.toThrow('root context unexpectedly exited');
  expect(writeError.mock.calls.flat().join(' ')).toContain('Ambiguous --fork session prefix');
  expect(files.map(file => fs.readFileSync(file))).toEqual(before);
  expect(fs.readdirSync(store.sessionsDir).sort()).toEqual(['matching-clean', 'matching-pending']);
});

it('refuses to replay a different prompt marker after extension option validation', async () => {
  const manager = new SessionManager();
  const session = manager.createNew(workspace);
  interruptPromptAppend(() => manager.persistUserPromptBarrier(session.id, 'Pending prompt'));
  const layout = new SessionStoreAccess().stateLayout(session.id);
  const marker = promptIntentPath(layout);
  const store = createSessionStoreLayout(home);
  const files = [layout.transcriptPath, layout.metadataPath, layout.statePath, store.currentSessionStorePath];
  const before = files.map(file => fs.readFileSync(file));
  const original = fs.readFileSync(marker);
  const options = { sessionId: session.id };
  const writeError = vi.fn();
  const rootContext = createCliRootContext({ launchCwd: workspace, options, ...processPorts });
  const replaceMarker = vi.fn(() => {
    const replacement = path.join(layout.sessionDir, 'replacement.json');
    fs.writeFileSync(replacement, original);
    fs.renameSync(replacement, marker);
  });
  await expect(prepareCliBootstrapRuntimeContext({ launchCwd: workspace, options, rootContext, ...processPorts, writeError },
    cliExtensionArguments([], replaceMarker))).rejects.toThrow('root context unexpectedly exited');
  expect(replaceMarker).toHaveBeenCalledOnce();
  expect(writeError.mock.calls.flat().join(' ')).toContain('Prompt persistence is unknown');
  expect(files.map(file => fs.readFileSync(file))).toEqual(before);
  expect(fs.readFileSync(marker)).toEqual(original);
});

it('attaches the admitted file instance to the new session without replaying initialization', async () => {
  const entry = path.join(workspace, 'extension.ts');
  fs.writeFileSync(entry, `let count = 0;
    export default async api => {
      count++;
      api.registerFlag({name:'label',type:'string'});
      const label = api.getFlag('label');
      await api.sendMessage('unadmitted prompt').catch(() => {});
      api.on('session_start', () => api.sendMessage(label + ':' + count));
    };`);
  const options = { extensionPaths: [entry] };
  const rootContext = createCliRootContext({ launchCwd: workspace, options, ...processPorts });
  const finalize = vi.fn();
  const args = cliExtensionArguments([{ name: '--label', inline: 'selected' }], finalize);
  const { runtime, extensions } = await prepareCliBootstrapRuntimeContext({ launchCwd: workspace, options, rootContext, ...processPorts }, args);
  const sendMessage = vi.fn(async (_message: unknown) => {});
  try {
    expect(finalize).toHaveBeenCalledOnce();
    expect(runtime.sessionManager.readCurrentSessionSelection(workspace)?.sessionId).toBe(runtime.runtimeContext.session.id);
    const loaded = extensions.bind({ host: { sendMessage }, signal: new AbortController().signal,
      assertEntryAccess: () => {}, denyRules: () => [] });
    const registered = loaded[0]?.handlers.get('session_start');
    expect(registered).toHaveLength(1);
    await registered![0]({ type: 'session_start' });
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('selected:1');
  } finally { extensions.retire(); await runtime.mcpGateway.close(); }
});

it.each(['missing', 'file'] as const)('reports a %s project through the terminal owner before exiting', kind => {
  const projectPath = path.join(workspace, kind);
  if (kind === 'file') fs.writeFileSync(projectPath, 'fixture');
  const terminal = new RecordingTerminal(), surface = new StartupSurface(terminal, new ManualScheduler(), vi.fn());
  const exited = new Error('fixture exit');
  const globalError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const globalExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw exited; });
  const writeError = vi.fn((message: string) => {
    surface.dispose();
    expect(terminal.stopped).toBe(true);
    terminal.write(message);
  });
  const exit = vi.fn((_code: number): never => { throw exited; });
  try {
    expect(() => createCliRootContext({ launchCwd: workspace, options: { projectPath }, writeError, exit })).toThrow(exited);
    expect(writeError).toHaveBeenCalledOnce();
    expect(writeError).toHaveBeenCalledWith(`Target project ${kind === 'missing' ? 'does not exist' : 'must be a directory'}: ${projectPath}`);
    expect(terminal.writes.at(-1)).toBe(writeError.mock.calls[0][0]);
    expect(exit).toHaveBeenCalledOnce(); expect(exit).toHaveBeenCalledWith(1);
    expect(globalError).not.toHaveBeenCalled(); expect(globalExit).not.toHaveBeenCalled();
  } finally { surface.dispose(); }
});
