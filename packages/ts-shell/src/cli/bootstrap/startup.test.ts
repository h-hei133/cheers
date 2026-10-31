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
} from "./cliBootstrapContext.js";

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
