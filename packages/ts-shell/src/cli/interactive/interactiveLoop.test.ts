import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { Interface as ReadlineInterface } from "node:readline";
import { describe, expect, it, vi } from "vitest";

import { runInteractiveLoop } from "./interactiveLoop.js";
import { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import { withConfiguration } from "../../test-utils/configuration.js";
import { ManualScheduler, RecordingTerminal } from "../../test-utils/terminalDouble.js";
import { createStartupRecoveryHint } from "../bootstrap/recoveryHint.js";
import { stripAnsi } from "../../presentation/tui/text/ansi.js";
import type { Session, SessionReentrySummary } from "../../session/SessionManager.js";
import { createCliShutdown } from '../runtime/shutdown.js';
import * as processTree from '../../core/shell/platform/processTree.js';

describe("interactive loop", () => {
  it.each(['regular', 'fullscreen'] as const)('hands MCP close to the single CLI shutdown budget on %s exit', async kind => {
    const stdin = Object.assign(new PassThrough(), { isTTY: true }) as unknown as NodeJS.ReadStream;
    const stdout = Object.assign(new PassThrough(), { isTTY: true }) as unknown as NodeJS.WriteStream;
    const processEvents = new EventEmitter() as NodeJS.Process;
    const terminal = new RecordingTerminal();
    const kill = vi.spyOn(processTree, 'killAllTrackedProcesses').mockResolvedValue(undefined);
    const close = vi.fn(() => new Promise<void>(() => {}));
    const errors: string[] = [];
    let finish!: (code: number) => void;
    const exited = new Promise<number>(resolve => { finish = resolve; });
    const shutdown = createCliShutdown({ process: processEvents, close,
      exit: finish, writeError: message => errors.push(message), timeoutMs: 20 });
    let readline: ReadlineInterface | null = null;
    const loop = runInteractiveLoop({
      stdin, stdout, process: processEvents, terminal, scheduler: new ManualScheduler(),
      sessionManager: { sessionExists: () => false } as never,
      renderer: new StreamingRenderer(),
      runtimeContext: withConfiguration({ cwd: '/tmp/project-exit', projectRoot: '/tmp/project-exit',
        session: { id: 'sess_exit' }, gitContext: { branch: 'main' },
        runtimeConfig: { provider: 'openai', providerCredentials: {}, contextWindow: 64000, configDiagnostics: [], tuiMode: kind },
      } as never),
      sessionRuntime: { getAgentMode: () => 'build', getPermissionScope: () => 'ask',
        getCurrentRunController: () => null, observeEvents: () => () => {}, terminate: () => {},
      } as never,
      logger: { error: () => {}, info: () => {}, warn: () => {} } as never,
      approvalTrustPolicy: {} as never,
      initialMcpGateway: { close } as never,
      setReadline: value => { readline = value; },
      setActiveNonInteractiveApprovalMode: () => {}, exit: shutdown.exit,
    });
    try {
      await vi.waitFor(() => expect(readline).not.toBeNull());
      readline!.close();
      await loop;
      expect(await exited).toBe(1);
      expect(close).toHaveBeenCalledOnce();
      expect(errors).toEqual(['Resource cleanup failed; process exit was not verified.']);
      expect(terminal.stopped).toBe(true);
    } finally {
      kill.mockRestore();
      (stdin as unknown as PassThrough).destroy();
      (stdout as unknown as PassThrough).destroy();
    }
  });

  it("publishes a startup recovery hint through the host transcript", async () => {
    const stdin = Object.assign(new PassThrough(), { isTTY: true }) as unknown as NodeJS.ReadStream;
    const stdout = Object.assign(new PassThrough(), { isTTY: true }) as unknown as NodeJS.WriteStream;
    const processEvents = new EventEmitter() as NodeJS.Process;
    const stop = new AbortController();
    const terminal = new RecordingTerminal();
    terminal.columns = 80;
    terminal.rows = 24;
    const scheduler = new ManualScheduler();
    const candidate = { id: "sess_saved" } as Session;
    const summary = {
      id: candidate.id,
      resumeDisposition: "fully-resumable",
    } as SessionReentrySummary;
    let startupNotice: ((line: string) => void) | undefined;
    let hintRun: Promise<void> | undefined;
    const hint = createStartupRecoveryHint({
      sessionManager: {
        getRecoveryHintAsync: vi.fn(async () => ({ candidate, summary })),
      },
      preferredProjectRoot: "/tmp/project-alpha",
      currentSessionId: "sess_current",
      generation: () => "stable",
      publish: value => startupNotice?.(`- Recovery hint: ${value.candidate?.id}`),
      logger: { warn: vi.fn() },
    });
    const stdoutWrite = vi.spyOn(process.stdout, "write");

    const loop = runInteractiveLoop({
      stdin,
      stdout,
      process: processEvents,
      terminal,
      scheduler,
      onFirstFrame: () => { hintRun = hint.start(); },
      setStartupNotice: notice => { startupNotice = notice; },
      sessionManager: { sessionExists: () => false } as never,
      renderer: new StreamingRenderer(),
      runtimeContext: withConfiguration({
        cwd: "/tmp/project-alpha",
        projectRoot: "/tmp/project-alpha",
        session: { id: "sess_current" },
        runtimeConfig: { provider: "openai", providerCredentials: {}, contextWindow: 64000, configDiagnostics: [] },
        gitContext: { branch: "main" },
      } as never),
      sessionRuntime: {
        getAgentMode: () => "build",
        getPermissionScope: () => "ask",
        getCurrentRunController: () => null,
        observeEvents: () => () => undefined,
        terminate: () => undefined,
      } as never,
      logger: {
        error: () => undefined,
        info: () => undefined,
        warn: () => undefined,
      } as never,
      approvalTrustPolicy: {} as never,
      initialMcpGateway: {} as never,
      setReadline: () => undefined,
      setActiveNonInteractiveApprovalMode: () => undefined,
      exit: () => undefined,
      stopSignal: stop.signal,
    });

    scheduler.flush();
    terminal.drain();
    expect(hintRun).toBeDefined();
    await hintRun!;
    scheduler.flush();

    expect(stripAnsi(terminal.drain())).toContain("Recovery hint: sess_saved");
    expect(stdoutWrite.mock.calls.some(([chunk]) => String(chunk).includes("Recovery hint"))).toBe(false);

    stop.abort();
    await loop;
    stdoutWrite.mockRestore();
    (stdin as unknown as PassThrough).destroy();
    (stdout as unknown as PassThrough).destroy();
  });

  it("reports the first frame from the real interactive host after its write", async () => {
    const stdin = Object.assign(new PassThrough(), { isTTY: true }) as unknown as NodeJS.ReadStream;
    const stdout = Object.assign(new PassThrough(), { isTTY: true }) as unknown as NodeJS.WriteStream;
    const processEvents = new EventEmitter() as NodeJS.Process;
    const stop = new AbortController();
    const terminal = new RecordingTerminal();
    terminal.columns = 80;
    terminal.rows = 24;
    const scheduler = new ManualScheduler();
    const onFirstFrame = vi.fn();

    const loop = runInteractiveLoop({
      stdin,
      stdout,
      process: processEvents,
      terminal,
      scheduler,
      onFirstFrame,
      sessionManager: { sessionExists: () => false } as never,
      renderer: new StreamingRenderer(),
      runtimeContext: withConfiguration({
        cwd: "/tmp/project-alpha",
        projectRoot: "/tmp/project-alpha",
        session: { id: "sess_1234567890abcdef" },
        runtimeConfig: { provider: "openai", providerCredentials: {}, contextWindow: 64000, configDiagnostics: [] },
        gitContext: { branch: "main" },
      } as never),
      sessionRuntime: {
        getAgentMode: () => "build",
        getPermissionScope: () => "ask",
        getCurrentRunController: () => null,
        observeEvents: () => () => undefined,
        terminate: () => undefined,
      } as never,
      logger: {
        error: () => undefined,
        info: () => undefined,
        warn: () => undefined,
      } as never,
      approvalTrustPolicy: {} as never,
      initialMcpGateway: {} as never,
      setReadline: () => undefined,
      setActiveNonInteractiveApprovalMode: () => undefined,
      exit: () => undefined,
      stopSignal: stop.signal,
    });

    expect(onFirstFrame).not.toHaveBeenCalled();
    scheduler.flush();
    expect(onFirstFrame).toHaveBeenCalledOnce();

    stop.abort();
    await loop;
    (stdin as unknown as PassThrough).destroy();
    (stdout as unknown as PassThrough).destroy();
  });

  it("uses the full-screen host and its readline stand-in on a real terminal", async () => {
    const stdin = Object.assign(new PassThrough(), { isTTY: true }) as unknown as NodeJS.ReadStream;
    const stdout = Object.assign(new PassThrough(), { isTTY: true }) as unknown as NodeJS.WriteStream;
    const processEvents = new EventEmitter() as NodeJS.Process;
    let capturedReadline: ReadlineInterface | null = null;
    const stop = new AbortController();

    const loop = runInteractiveLoop({
      stdin,
      stdout,
      process: processEvents,
      sessionManager: { sessionExists: () => false } as never,
      renderer: new StreamingRenderer(),
      runtimeContext: withConfiguration({
        cwd: "/tmp/project-alpha",
        projectRoot: "/tmp/project-alpha",
        session: { id: "sess_1234567890abcdef" },
        runtimeConfig: { provider: "openai", providerCredentials: {}, contextWindow: 64000, configDiagnostics: [] },
        gitContext: { branch: "main" },
      } as never),
      sessionRuntime: {
        getAgentMode: () => "build",
      getPermissionScope: () => "ask",
        getCurrentRunController: () => null,
        observeEvents: () => () => undefined,
        terminate: () => undefined,
      } as never,
      logger: {
        error: () => undefined,
        info: () => undefined,
      } as never,
      approvalTrustPolicy: {} as never,
      initialMcpGateway: {} as never,
      setReadline: (readline) => {
        capturedReadline = readline;
      },
      setActiveNonInteractiveApprovalMode: () => undefined,
      exit: () => undefined,
      stopSignal: stop.signal,
    });

    // The host owns raw stdin, so downstream command routers get a readline
    // stand-in whose question() is answered from the host's own prompt.
    expect(capturedReadline).not.toBeNull();
    expect(typeof capturedReadline?.question).toBe("function");
    expect(typeof capturedReadline?.close).toBe("function");

    stop.abort();
    await loop;
    capturedReadline?.close();
    (stdin as unknown as PassThrough).destroy();
    (stdout as unknown as PassThrough).destroy();
  });

  it("falls back to the line-oriented loop when output is a pipe", async () => {
    // Over a pipe there is no window size and no cursor addressing, so the
    // full-screen host cannot render anything usable.
    const stdin = new PassThrough();
    const processEvents = new EventEmitter() as NodeJS.Process;
    let capturedReadline: ReadlineInterface | null = null;
    const sessionExists = vi.fn(() => false);
    const exit = vi.fn();
    const loop = runInteractiveLoop({
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: new PassThrough() as unknown as NodeJS.WriteStream,
      process: processEvents,
      sessionManager: { sessionExists } as never,
      renderer: new StreamingRenderer(),
      runtimeContext: withConfiguration({
        cwd: "/tmp/project-beta",
        projectRoot: "/tmp/project-beta",
        session: { id: "sess_abcdef0123456789" },
        runtimeConfig: { provider: "openai", providerCredentials: {}, contextWindow: 64000, configDiagnostics: [] },
        gitContext: { branch: "main" },
      } as never),
      sessionRuntime: {
        getAgentMode: () => "build",
      getPermissionScope: () => "ask",
        getCurrentRunController: () => null,
        observeEvents: () => () => undefined,
        terminate: () => undefined,
        getState: () => "idle",
      } as never,
      logger: { error: () => undefined, info: () => undefined } as never,
      approvalTrustPolicy: {} as never,
      initialMcpGateway: {} as never,
      setReadline: (readline) => {
        capturedReadline = readline;
      },
      setActiveNonInteractiveApprovalMode: () => undefined,
      exit,
    });

    stdin.end();
    await loop;
    // Actual readline drives the input while questions use the host stand-in.
    expect(capturedReadline).not.toBeNull();
    expect(typeof capturedReadline?.question).toBe("function");
    expect(sessionExists.mock.calls).toEqual([["sess_abcdef0123456789"]]);
    expect(exit.mock.calls).toEqual([[0]]);
    expect(processEvents.listenerCount("SIGINT")).toBe(0);
  });

  it("marks raw line input as user intent before a line is submitted", async () => {
    const stdin = new PassThrough();
    const processEvents = new EventEmitter() as NodeJS.Process;
    const stop = new AbortController();
    const onUserIntent = vi.fn();
    const loop = runInteractiveLoop({
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: new PassThrough() as unknown as NodeJS.WriteStream,
      process: processEvents,
      onUserIntent,
      sessionManager: { sessionExists: () => false } as never,
      renderer: new StreamingRenderer(),
      runtimeContext: withConfiguration({
        cwd: "/tmp/project-gamma",
        projectRoot: "/tmp/project-gamma",
        session: { id: "sess_gamma" },
        runtimeConfig: { provider: "openai", providerCredentials: {}, contextWindow: 64000, configDiagnostics: [] },
        gitContext: { branch: "main" },
      } as never),
      sessionRuntime: {
        getAgentMode: () => "build",
        getPermissionScope: () => "ask",
        getCurrentRunController: () => null,
        observeEvents: () => () => undefined,
        terminate: () => undefined,
        getState: () => "idle",
      } as never,
      logger: { error: () => undefined, info: () => undefined } as never,
      approvalTrustPolicy: {} as never,
      initialMcpGateway: {} as never,
      setReadline: () => undefined,
      setActiveNonInteractiveApprovalMode: () => undefined,
      exit: () => undefined,
      stopSignal: stop.signal,
    });

    stdin.write("draft");
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(onUserIntent).toHaveBeenCalledOnce();

    stop.abort();
    await loop;
  });
});
