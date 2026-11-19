import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SessionManager } from "../../session/SessionManager.js";
import { createSessionStoreLayout } from "../../session/store/sessionFileLayout.js";
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
