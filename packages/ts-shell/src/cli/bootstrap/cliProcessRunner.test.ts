import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import { TerminalOutput } from "../../presentation/tui/terminal/output.js";
import { supportsFullScreenSurface } from "../interactive/surfaceCapability.js";

vi.mock("../../entrypoints/cliArgs.js", () => ({ parseCliArgs: vi.fn() }));
vi.mock("../../core/paths/profile/context.js", async () => {
  const actual = await vi.importActual<typeof import("../../core/paths/profile/context.js")>(
    "../../core/paths/profile/context.js",
  );
  return {
    ...actual,
    createProfileContext: vi.fn(() => ({})),
    currentProfile: vi.fn(() => undefined),
    withProfile: vi.fn(async (_profile: unknown, run: () => Promise<void>) => run()),
  };
});
vi.mock("./profile/admission.js", () => ({
  claimSwitchChild: vi.fn(() => undefined),
  admitSwitchChild: vi.fn(),
}));
vi.mock("./profile/process.js", () => ({ runProfileSwitch: vi.fn() }));
vi.mock("../collaboration/service.js", () => ({
  runCollaborationServiceMode: vi.fn(async () => false),
}));
vi.mock("./cliBootstrapContext.js", () => ({
  createCliRootContext: vi.fn(),
  createCliBootstrapRuntimeContext: vi.fn(),
  prepareCliBootstrapRuntimeContext: vi.fn(),
  logCliBootstrapSessionInitialized: vi.fn(),
}));
vi.mock("../../core/shell/runtimeContext.js", async () => ({
  ...await vi.importActual<typeof import("../../core/shell/runtimeContext.js")>("../../core/shell/runtimeContext.js"),
  refreshShellRuntimeConfig: vi.fn(() => ({ status: 'applied' })),
}));
vi.mock("./cliStartupSurface.js", () => ({
  projectAndRenderCliStartupSurface: vi.fn(),
}));
vi.mock("../interactive/interactiveLoop.js", () => ({
  runInteractiveLoop: vi.fn(),
}));
vi.mock("../runtime/shutdown.js", () => ({ createCliShutdown: vi.fn() }));
vi.mock("../runtime/goalScheduling.js", () => ({
  cancelGoalRunForShutdown: vi.fn(),
}));
vi.mock("../runtime/collaboration.js", () => ({ closeCollaborationFor: vi.fn() }));
vi.mock("../runtime/ssh.js", () => ({ closeSshFor: vi.fn() }));
vi.mock("../runtime/media.js", () => ({
  installMediaSurface: vi.fn(),
  closeMediaFor: vi.fn(),
}));
vi.mock("../runtime/jobs.js", () => ({ closeJobsFor: vi.fn() }));
vi.mock("../runtime/director.js", () => ({ closeDirectorFor: vi.fn() }));
vi.mock("../runtime/extensions.js", () => ({
  closeExtensionsFor: vi.fn(), waitForExtensionsFor: vi.fn().mockResolvedValue(undefined), startExtensionsFor: vi.fn().mockResolvedValue(undefined),
  shutdownExtensionsFor: vi.fn(async (_context, _reason, settle) => { await settle?.(); }),
}));
vi.mock("../../observability/traceDashboard.js", () => ({
  closeTraceDashboard: vi.fn(),
}));
vi.mock("../provider/cliProviderRuntimeBridge.js", () => ({
  createCliProviderRuntimeBridge: vi.fn(),
}));
vi.mock("../runtime/cliSessionRuntimeFactory.js", () => ({
  createCliSessionRuntime: vi.fn(),
}));
vi.mock("../print/printModeRouter.js", () => ({
  runCliPrintModeRouter: vi.fn(async () => false),
}));
vi.mock("../print/stdinPromptCapture.js", () => ({
  captureCliStdinPrompts: vi.fn(),
}));
vi.mock("../../core/update/check.js", () => ({
  checkForUpdate: vi.fn(async () => ({})),
  formatUpdateNotice: vi.fn(() => undefined),
}));
vi.mock("../../config/inputs/selection.js", () => ({
  createConfigInputs: vi.fn(),
}));

import { parseCliArgs } from "../../entrypoints/cliArgs.js";
import { createCliRootContext, createCliBootstrapRuntimeContext, prepareCliBootstrapRuntimeContext } from "./cliBootstrapContext.js";
import { projectAndRenderCliStartupSurface } from "./cliStartupSurface.js";
import { runInteractiveLoop } from "../interactive/interactiveLoop.js";
import { createCliShutdown } from "../runtime/shutdown.js";
import { createCliProviderRuntimeBridge } from "../provider/cliProviderRuntimeBridge.js";
import { createCliSessionRuntime } from "../runtime/cliSessionRuntimeFactory.js";
import { closeExtensionsFor, startExtensionsFor, shutdownExtensionsFor, waitForExtensionsFor } from '../runtime/extensions.js';
import { cancelGoalRunForShutdown } from '../runtime/goalScheduling.js';
import { captureCliStdinPrompts } from "../print/stdinPromptCapture.js";
import { runCliPrintModeRouter } from "../print/printModeRouter.js";
import { runCliProcess } from "./cliProcessRunner.js";
import * as usage from '../../observability/usageTelemetry.js';
import { createEmptyLifecycleIndex } from '../../core/tools/toolResultLifecycle.js';
import { flushRawStdout, isStdoutTakenOver, restoreStdout, takeOverStdout, writeRawStdout } from '../../core/shell/outputGuard.js';

const projectRoot = "/tmp/cli-process-runner-project";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(startExtensionsFor).mockResolvedValue(undefined);
  vi.mocked(shutdownExtensionsFor).mockImplementation(async (_context, _reason, settle) => { await settle?.(); });
  vi.mocked(closeExtensionsFor).mockResolvedValue(undefined);
  vi.mocked(cancelGoalRunForShutdown).mockResolvedValue(undefined);
});

afterEach(() => { restoreStdout(); });

it.each(['idle', 'busy', 'pending', 'unknown', 'unreadable', 'save-failed'] as const)("routes startup notices and preserves signal lifecycle for %s work", async state => {
  const renderer = new StreamingRenderer();
  const transcript: string[] = [];
  const runtimeContext = {
    session: {
      id: "sess_current",
      createdAt: "2026-10-20T00:00:00.000Z",
    },
    projectRoot,
    cwd: projectRoot,
    originalCwd: projectRoot,
    runtimeConfig: {
      offline: true,
      provider: "openai",
      maxTurns: 15,
      configDiagnostics: [],
    },
    configuration: {
      current: { revision: 1, config: {} },
      recordDisplay: vi.fn(),
    },
    startupArgs: [],
  };
  const sessionManager = {
    getRecoveryHintAsync: vi.fn(async () => ({
      candidate: { id: "sess_saved" },
      summary: { resumeDisposition: "fully-resumable" },
    })),
    getRecoverySnapshot: vi.fn(() => {
      if (state === 'unreadable') throw new Error('private fixture recovery failure');
      return { pendingLifecycle: createEmptyLifecycleIndex(), runPhase: state === 'pending' ? 'turn-active' : 'idle',
        terminalClassification: state === 'unknown' ? 'stopped' : undefined,
        terminalReason: state === 'unknown' ? 'stopped_not_proven' : undefined };
    }),
    saveTerminated: vi.fn(() => { if (state === 'save-failed') throw new Error('private fixture persistence failure'); }),
  } as never;
  const mcpGateway = {
    close: vi.fn(),
    syncWorkspace: vi.fn(),
  };
  const shutdown = { exit: vi.fn(), close: vi.fn(async () => undefined) };

  vi.mocked(parseCliArgs).mockReturnValue({
    ok: true,
    args: { options: {}, versionRequested: false, doctorRequested: false },
  } as never);
  vi.mocked(createCliRootContext).mockReturnValue({
    workspaceRoot: projectRoot,
    runtimeConfig: runtimeContext.runtimeConfig,
  } as never);
  vi.mocked(createCliBootstrapRuntimeContext).mockReturnValue({
    sessionManager,
    renderer,
    recoveryCandidate: null,
    recoveryCandidateSummary: null,
    runtimeContext,
    bootstrap: { lifecycleNotices: ['Resumed session sess_current'] },
    settleModel: vi.fn(),
    mcpGateway,
  } as never);
  vi.mocked(projectAndRenderCliStartupSurface).mockResolvedValue({
    fullScreenHost: true,
    showStartupSurface: false,
    startupPlan: {},
  } as never);
  vi.mocked(createCliProviderRuntimeBridge).mockReturnValue({
    resolveCredentialSnapshot: () => ({}),
    providerModeEnv: () => undefined,
  } as never);
  vi.mocked(captureCliStdinPrompts).mockResolvedValue({
    stdinTransportMode: "stream-live",
    pipedInput: null,
    nonInteractivePrompts: [],
    cliModePlan: { kind: "interactive" },
  } as never);
  vi.mocked(createCliSessionRuntime).mockReturnValue({
    getCurrentRunController: () => state === 'busy' ? new AbortController() : null,
    terminate: vi.fn(),
    observeEvents: vi.fn(),
    getState: () => "idle",
    waitForIdle: vi.fn(async () => undefined),
  } as never);
  vi.mocked(createCliShutdown).mockReturnValue(shutdown as never);
  const usageRead = vi.spyOn(usage, 'getSessionUsage').mockReturnValue({ usageHealth: { status: 'degraded',
    rejectedBuckets: 1, rejectedHistoryEntries: 0, invalidSnapshot: false } } as never);
  vi.mocked(runInteractiveLoop).mockImplementation(async (input) => {
    input.setStartupNotice?.(line => transcript.push(line));
    expect(transcript).toContain('Resumed session sess_current');
    expect(transcript).toContain('Persisted usage is incomplete; recovered counts and cost estimates exclude unreadable records. Inspect /cost.');
    input.onFirstFrame?.();
    await vi.waitFor(() => {
      expect(transcript).toContain(
        "- Recovery hint: /resume or --session-id sess_saved (fully-resumable)",
      );
    });
    const shutdownInput = vi.mocked(createCliShutdown).mock.calls[0]![0];
    const hook = shutdownInput.onSignal!;
    const before = (sessionManager as unknown as { saveTerminated: ReturnType<typeof vi.fn> }).saveTerminated;
    await shutdownInput.close();
    expect(before).not.toHaveBeenCalled(); // Ordinary cleanup is not a session close.
    if (state === 'unreadable' || state === 'save-failed') expect(() => hook('SIGTERM')).toThrow('private fixture');
    else hook('SIGTERM');
    expect(before).toHaveBeenCalledTimes(state === 'idle' || state === 'save-failed' ? 1 : 0);
  });

  const stdout = new PassThrough();
  const processEvents = Object.assign(new EventEmitter(), {
    stdout,
    stderr: new PassThrough(),
    env: {},
    execPath: process.execPath,
    argv: [process.execPath, "cli"],
  }) as unknown as NodeJS.Process;
  const stdin = Object.assign(new PassThrough(), { isTTY: true }) as unknown as NodeJS.ReadStream;
  const stdoutWrite = vi.spyOn(process.stdout, "write");

  try {
    await runCliProcess({
      args: [],
      launchCwd: projectRoot,
      stdin,
      process: processEvents,
      writeOutput: vi.fn(),
      writeError: vi.fn(),
      exit: ((code: number) => { throw new Error(`unexpected exit ${code}`); }) as never,
    });
  } finally {
    usageRead.mockRestore();
    stdoutWrite.mockRestore();
    (stdin as unknown as PassThrough).destroy();
    stdout.destroy();
    (processEvents.stderr as unknown as PassThrough).destroy();
  }

  expect(transcript).toContain(
    "- Recovery hint: /resume or --session-id sess_saved (fully-resumable)",
  );
  expect(stdoutWrite.mock.calls.some(([chunk]) => String(chunk).includes("Recovery hint"))).toBe(false);
  expect(shutdown.close).toHaveBeenCalledOnce();
});

it("waits for the line-loop first-frame callback before starting the recovery hint", async () => {
  const renderer = new StreamingRenderer();
  const notices: string[] = [];
  const restoreRenderer = renderer.setSink({
    line: line => notices.push(line),
    chunk: () => {},
  }, { ownsTranscript: false });
  const runtimeContext = {
    session: {
      id: "sess_current",
      createdAt: "2026-10-20T00:00:00.000Z",
    },
    projectRoot,
    cwd: projectRoot,
    originalCwd: projectRoot,
    runtimeConfig: {
      offline: true,
      provider: "openai",
      maxTurns: 15,
      configDiagnostics: [],
    },
    configuration: {
      current: { revision: 1, config: {} },
      recordDisplay: vi.fn(),
    },
    startupArgs: [],
  };
  const getRecoveryHintAsync = vi.fn(async () => ({
    candidate: { id: "sess_saved" },
    summary: { resumeDisposition: "fully-resumable" },
  }));
  const sessionManager = { getRecoveryHintAsync } as never;
  const mcpGateway = {
    close: vi.fn(),
    syncWorkspace: vi.fn(),
  };
  const shutdown = { exit: vi.fn(), close: vi.fn(async () => undefined) };

  vi.mocked(parseCliArgs).mockReturnValue({
    ok: true,
    args: { options: {}, versionRequested: false, doctorRequested: false },
  } as never);
  vi.mocked(createCliRootContext).mockReturnValue({
    workspaceRoot: projectRoot,
    runtimeConfig: runtimeContext.runtimeConfig,
  } as never);
  vi.mocked(createCliBootstrapRuntimeContext).mockReturnValue({
    sessionManager,
    renderer,
    recoveryCandidate: null,
    recoveryCandidateSummary: null,
    runtimeContext,
    bootstrap: { lifecycleNotices: [] },
    settleModel: vi.fn(),
    mcpGateway,
  } as never);
  vi.mocked(projectAndRenderCliStartupSurface).mockResolvedValue({
    fullScreenHost: false,
    showStartupSurface: true,
    startupPlan: {},
  } as never);
  vi.mocked(createCliProviderRuntimeBridge).mockReturnValue({
    resolveCredentialSnapshot: () => ({}),
    providerModeEnv: () => undefined,
  } as never);
  vi.mocked(captureCliStdinPrompts).mockResolvedValue({
    stdinTransportMode: "stream-live",
    pipedInput: null,
    nonInteractivePrompts: [],
    cliModePlan: { kind: "interactive" },
  } as never);
  vi.mocked(createCliSessionRuntime).mockReturnValue({
    getCurrentRunController: () => null,
    terminate: vi.fn(),
    observeEvents: vi.fn(),
    getState: () => "idle",
    waitForIdle: vi.fn(async () => undefined),
  } as never);
  vi.mocked(createCliShutdown).mockReturnValue(shutdown as never);
  let interactiveInput: Parameters<typeof runInteractiveLoop>[0] | undefined;
  vi.mocked(runInteractiveLoop).mockImplementation(async (input) => {
    interactiveInput = input;
    expect(getRecoveryHintAsync).not.toHaveBeenCalled();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(getRecoveryHintAsync).not.toHaveBeenCalled();

    input.onFirstFrame?.();
    await vi.waitFor(() => {
      expect(getRecoveryHintAsync).toHaveBeenCalledOnce();
      expect(notices).toContain(
        "- Recovery hint: /resume or --session-id sess_saved (fully-resumable)",
      );
    });
  });

  const stdout = new PassThrough();
  const processEvents = Object.assign(new EventEmitter(), {
    stdout,
    stderr: new PassThrough(),
    env: {},
    execPath: process.execPath,
    argv: [process.execPath, "cli"],
  }) as unknown as NodeJS.Process;
  const stdin = Object.assign(new PassThrough(), { isTTY: false }) as unknown as NodeJS.ReadStream;
  const stdoutWrite = vi.spyOn(process.stdout, "write");

  try {
    await runCliProcess({
      args: [],
      launchCwd: projectRoot,
      stdin,
      process: processEvents,
      writeOutput: vi.fn(),
      writeError: vi.fn(),
      exit: ((code: number) => { throw new Error(`unexpected exit ${code}`); }) as never,
    });
  } finally {
    restoreRenderer();
    stdoutWrite.mockRestore();
    (stdin as unknown as PassThrough).destroy();
    stdout.destroy();
    (processEvents.stderr as unknown as PassThrough).destroy();
  }

  expect(getRecoveryHintAsync).toHaveBeenCalledOnce();
  expect(stdoutWrite.mock.calls.some(([chunk]) => String(chunk).includes("Recovery hint"))).toBe(false);
  const routed = vi.mocked(runCliPrintModeRouter).mock.calls[0]?.[0];
  expect(routed?.onFirstFrame).toBe(interactiveInput?.onFirstFrame);
  expect(routed?.onUserIntent).toBe(interactiveInput?.onUserIntent);
  expect(shutdown.close).toHaveBeenCalledOnce();
});

type OutputPort = { write(text: string): void; flush(): Promise<void> };
type OutputFixtureOptions = {
  options?: Record<string, unknown>;
  args?: readonly string[];
  stdinTty?: boolean;
  stdoutTty?: boolean;
  stderrTty?: boolean;
  plan?: 'interactive' | 'stdin-batch' | 'stdin-stream';
  rootFailure?: Error;
  bootstrapFailure?: Error;
  writeFailure?: Error;
  cleanupFailure?: Error;
  holdOutput?: boolean;
  exitAt?: 'root' | 'bootstrap' | 'router';
};

function outputFixture(settings: OutputFixtureOptions = {}) {
  const output: string[] = [];
  const errors: string[] = [];
  const guardAtRoot: boolean[] = [];
  let completeOutput: (() => void) | undefined;
  const deviceWrite = (target: string[]) => (chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void) => {
    const text = String(chunk);
    if (text) target.push(text);
    const complete = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    if (target === output && text.includes('answer')) {
      if (settings.holdOutput) completeOutput = () => complete?.();
      else queueMicrotask(() => complete?.(settings.writeFailure));
    } else complete?.();
    return true;
  };
  const stdout = Object.assign(new EventEmitter(), {
    isTTY: settings.stdoutTty ?? true, write: vi.fn(deviceWrite(output)),
  });
  const stderr = Object.assign(new EventEmitter(), {
    isTTY: settings.stderrTty ?? true, write: vi.fn(deviceWrite(errors)),
  });
  const originalWrite = stdout.write;
  const processEvents = Object.assign(new EventEmitter(), {
    stdout, stderr, env: {}, execPath: process.execPath, argv: [process.execPath, 'cli'],
  }) as unknown as NodeJS.Process;
  const stdin = Object.assign(new PassThrough(), { isTTY: settings.stdinTty ?? true });
  const options = settings.options ?? {};
  const plan = settings.plan ?? 'stdin-batch';
  const renderer = new StreamingRenderer();
  const runtimeContext = {
    session: { id: 'output-session', createdAt: '2026-11-16T00:00:00.000Z' },
    projectRoot, cwd: projectRoot, originalCwd: projectRoot,
    runtimeConfig: { offline: true, provider: 'openai', maxTurns: 15, configDiagnostics: [] },
    configuration: { current: { revision: 1, config: {} }, recordDisplay: vi.fn() },
    startupArgs: [],
  };
  const mcpGateway = { close: vi.fn(async () => {
    stdout.write('cleanup noise\n');
    if (settings.cleanupFailure) throw settings.cleanupFailure;
  }) };
  const boot = {
    sessionManager: { getRecoveryHintAsync: vi.fn(async () => null) }, renderer,
    recoveryCandidate: null, recoveryCandidateSummary: null, runtimeContext,
    bootstrap: { lifecycleNotices: [] }, settleModel: vi.fn(), mcpGateway,
  };
  vi.mocked(parseCliArgs).mockReturnValue({ ok: true,
    args: { options, versionRequested: false, doctorRequested: false } } as never);
  vi.mocked(createCliRootContext).mockImplementation(input => {
    guardAtRoot.push(isStdoutTakenOver());
    stdout.write('root noise\n');
    if (settings.exitAt === 'root') { writeRawStdout('root blocked\n'); input.exit(1); }
    if (settings.rootFailure) throw settings.rootFailure;
    return { workspaceRoot: projectRoot, runtimeConfig: runtimeContext.runtimeConfig } as never;
  });
  vi.mocked(createCliBootstrapRuntimeContext).mockImplementation(input => {
    const supplied = (input as unknown as { output?: OutputPort }).output;
    if (!supplied && (options.jsonEvents || options.rpcMode)) takeOverStdout(stdout as never, stderr as never);
    const port = supplied ?? (options.jsonEvents || options.rpcMode
      ? { write: writeRawStdout, flush: flushRawStdout }
      : { write: (text: string) => { stdout.write(text); }, flush: async () => {} });
    const framed = Boolean(options.jsonEvents || options.rpcMode);
    renderer.setSink({
      line: (text: string) => port.write(framed ? `${JSON.stringify({ type: 'cli.output', text: `${text}\n` })}\n` : `${text}\n`),
      chunk: (text: string) => port.write(framed ? `${JSON.stringify({ type: 'cli.output', text })}\n` : text),
      flush: () => port.flush(),
    } as never, { ownsTranscript: false });
    stdout.write('bootstrap noise\n');
    if (settings.exitAt === 'bootstrap') { renderer.renderLine('bootstrap blocked'); input.exit(1); }
    if (settings.bootstrapFailure) throw settings.bootstrapFailure;
    return boot as never;
  });
  vi.mocked(projectAndRenderCliStartupSurface).mockResolvedValue({
    fullScreenHost: false, showStartupSurface: false, startupPlan: {},
  } as never);
  vi.mocked(createCliProviderRuntimeBridge).mockReturnValue({
    resolveCredentialSnapshot: () => ({}), providerModeEnv: () => undefined,
  } as never);
  vi.mocked(captureCliStdinPrompts).mockResolvedValue({
    stdinTransportMode: plan === 'stdin-stream' ? 'stream-live' : 'capture-batch',
    pipedInput: null, nonInteractivePrompts: [], cliModePlan: { kind: plan },
  } as never);
  vi.mocked(createCliSessionRuntime).mockReturnValue({
    getCurrentRunController: () => null, terminate: vi.fn(), observeEvents: vi.fn(),
    getState: () => 'idle', waitForIdle: vi.fn(async () => undefined),
  } as never);
  vi.mocked(createCliShutdown).mockImplementation(input => ({ close: vi.fn(input.close), exit: vi.fn() }));
  vi.mocked(runCliPrintModeRouter).mockImplementation(async input => {
    if (plan === 'interactive') return false;
    input.bootstrapRuntime.renderer.renderLine('answer');
    if (settings.exitAt === 'router') input.exit(1);
    return true;
  });
  vi.mocked(runInteractiveLoop).mockImplementation(async input => { input.renderer.renderLine('answer'); });
  const writeError = vi.fn();
  const terminalExit = new Error('fixture terminal exit');
  const exitState: { code: number; guarded: boolean; restored: boolean; stdout: string }[] = [];
  const exit = vi.fn((code: number): never => {
    exitState.push({ code, guarded: isStdoutTakenOver(), restored: stdout.write === originalWrite,
      stdout: output.join('') });
    throw terminalExit;
  });
  return {
    output, errors, guardAtRoot, stdin, stdout, originalWrite, writeError, exit, exitState, terminalExit,
    complete: () => completeOutput?.(),
    run: () => runCliProcess({ args: settings.args ?? [], launchCwd: projectRoot, stdin: stdin as never,
      process: processEvents, writeOutput: vi.fn(), writeError,
      exit }),
    dispose: () => stdin.destroy(),
  };
}

it('resolves typed startup options before choosing the prompt route', async () => {
  const fixture = outputFixture({ args: ['-e', './extension.ts', '--label', './path-value.json',
    '--enabled=false', '--browse', 'User question', '--print', '--', '--literal'] });
  const actual = await vi.importActual<typeof import('../../entrypoints/cliArgs.js')>('../../entrypoints/cliArgs.js');
  vi.mocked(parseCliArgs).mockImplementationOnce(actual.parseCliArgs).mockImplementationOnce(actual.parseCliArgs);
  vi.mocked(prepareCliBootstrapRuntimeContext).mockImplementationOnce(async (input, startup) => {
    expect(captureCliStdinPrompts).not.toHaveBeenCalled();
    const flags = [{ name: 'label', type: 'string' }, { name: 'enabled', type: 'boolean' },
      { name: 'browse', type: 'boolean' }] as const;
    const declarations = flags.map(flag => ({ flag, source: { entry: './extension.ts', canonical: '/extension.ts' } }));
    expect(declarations.map(declaration => startup.value(declaration))).toEqual(['./path-value.json', false, true]);
    startup.validate(declarations);
    return { runtime: createCliBootstrapRuntimeContext(input), extensions: { check: vi.fn(), retire: vi.fn(), bind: vi.fn() } };
  });
  try {
    await fixture.run();
    expect(createCliSessionRuntime).toHaveBeenCalledOnce();
    expect(captureCliStdinPrompts).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ printMode: true, promptArg: 'User question --literal' }),
    }));
    expect(startExtensionsFor).toHaveBeenCalledOnce();
  } finally { fixture.dispose(); }
});

it.each([
  { option: '--other', candidate: 'Must not dispatch', message: 'not registered' },
  { option: '--ready', candidate: './ambiguous/workspace', message: 'positional workspace ambiguous' },
])('refuses $option before consuming stdin, startup handlers or a prompt', async ({ option, candidate, message }) => {
  const fixture = outputFixture({ args: ['-e', './extension.ts', option, candidate, '--print'] });
  const actual = await vi.importActual<typeof import('../../entrypoints/cliArgs.js')>('../../entrypoints/cliArgs.js');
  vi.mocked(parseCliArgs).mockImplementation(actual.parseCliArgs);
  vi.mocked(prepareCliBootstrapRuntimeContext).mockImplementationOnce(async (_input, startup) => {
    startup.validate([{ flag: { name: 'ready', type: 'boolean' }, source: { entry: './extension.ts', canonical: '/extension.ts' } }]);
    throw new Error('Argument validation unexpectedly accepted the options.');
  });
  try {
    await expect(fixture.run()).rejects.toBe(fixture.terminalExit);
    expect(fixture.writeError).toHaveBeenCalledWith(expect.stringContaining(message));
    expect(fixture.exit).toHaveBeenCalledWith(1);
    expect(startExtensionsFor).not.toHaveBeenCalled();
    expect(createCliBootstrapRuntimeContext).not.toHaveBeenCalled();
    expect(createCliSessionRuntime).not.toHaveBeenCalled();
    expect(captureCliStdinPrompts).not.toHaveBeenCalled();
    expect(runCliPrintModeRouter).not.toHaveBeenCalled();
  } finally { fixture.dispose(); }
});

it('awaits session startup before the first prompt and drains the run before session shutdown and extension retirement', async () => {
  const fixture = outputFixture({ options: { printMode: true } });
  const order: string[] = [];
  let ready!: () => void; let finishRun!: () => void;
  const started = new Promise<void>(resolve => { ready = resolve; }); const running = new Promise<void>(resolve => { finishRun = resolve; });
  vi.mocked(startExtensionsFor).mockImplementation(async () => { order.push('start'); await started; order.push('started'); });
  vi.mocked(runCliPrintModeRouter).mockImplementation(async () => { order.push('prompt'); return true; });
  vi.mocked(cancelGoalRunForShutdown).mockImplementation(async () => { order.push('cancel'); await running; order.push('settled'); });
  vi.mocked(shutdownExtensionsFor).mockImplementation(async (_context, _reason, settle) => { await settle?.(); order.push('shutdown'); });
  vi.mocked(closeExtensionsFor).mockImplementation(async () => { order.push('retired'); });
  let pending: Promise<unknown> | undefined;
  try {
    pending = fixture.run();
    await vi.waitFor(() => expect(order).toContain('start'));
    expect(order).not.toContain('prompt'); ready();
    await vi.waitFor(() => expect(order).toContain('cancel'));
    expect(order).not.toContain('shutdown'); expect(order).not.toContain('retired'); finishRun(); await pending;
    expect(order).toEqual(['start', 'started', 'prompt', 'cancel', 'settled', 'shutdown', 'retired']);
  } finally { ready(); finishRun(); await pending?.catch(() => undefined); fixture.dispose(); }
});

it('attaches structured event observers before a startup extension can submit a prompt', async () => {
  const fixture = outputFixture({ options: { jsonEvents: true } });
  const bootstrap = vi.mocked(createCliBootstrapRuntimeContext).getMockImplementation()!;
  vi.mocked(createCliBootstrapRuntimeContext).mockImplementation(input => ({ ...bootstrap(input), writeJsonEvent: vi.fn() }));
  vi.mocked(startExtensionsFor).mockImplementation(async () => {
    const runtime = vi.mocked(createCliSessionRuntime).mock.results.at(-1)?.value;
    expect(runtime.observeEvents).toHaveBeenCalledOnce();
  });
  try { await fixture.run(); } finally { fixture.dispose(); }
});

it('defers interactive startup until its input host supplies readiness', async () => {
  const fixture = outputFixture({ options: {}, plan: 'interactive' }); const order: string[] = [];
  vi.mocked(startExtensionsFor).mockImplementation(async () => { order.push('start'); });
  vi.mocked(runCliPrintModeRouter).mockResolvedValue(false);
  vi.mocked(runInteractiveLoop).mockImplementation(async input => {
    order.push('input-bound'); expect(startExtensionsFor).not.toHaveBeenCalled();
    const ready = (input as unknown as { onInputReady?: () => Promise<void> }).onInputReady;
    expect(ready).toBeTypeOf('function'); await ready!(); order.push('prompt-ready');
  });
  try { await fixture.run(); expect(order).toEqual(['input-bound', 'start', 'prompt-ready']); }
  finally { fixture.dispose(); }
});

it.each(['root', 'bootstrap', 'router'] as const)('drains and restores before a synchronous %s exit', async exitAt => {
  const fixture = outputFixture({ options: { printMode: true }, exitAt });
  const expected = exitAt === 'router' ? 'answer\n' : `${exitAt} blocked\n`;
  try {
    await expect(fixture.run()).rejects.toBe(fixture.terminalExit);
    expect(fixture.exit).toHaveBeenCalledOnce();
    expect(fixture.exitState).toEqual([{ code: 1, guarded: false, restored: true, stdout: expected }]);
    expect(fixture.output.join('')).toBe(expected);
  } finally { fixture.dispose(); }
});

it.each([
  { name: 'print', options: { printMode: true } },
  { name: 'json', options: { jsonEvents: true } },
  { name: 'rpc', options: { rpcMode: true } },
  { name: 'stdin batch', stdinTty: false, plan: 'stdin-batch' as const },
  { name: 'stdin stream', stdinTty: false, plan: 'stdin-stream' as const },
  { name: 'redirected stdout', stdoutTty: false, plan: 'interactive' as const },
])('protects $name output before root setup and through resource cleanup', async settings => {
  const fixture = outputFixture(settings);
  try {
    await fixture.run();
    expect(parseCliArgs).toHaveBeenCalledOnce();
    expect(fixture.guardAtRoot).toEqual([true]);
    expect(fixture.output.join('')).toContain('answer');
    expect(fixture.output.join('')).not.toContain('noise');
    expect(fixture.errors.join('')).toBe('root noise\nbootstrap noise\ncleanup noise\n');
    expect(fixture.stdout.write).toBe(fixture.originalWrite);
    expect(isStdoutTakenOver()).toBe(false);
  } finally { fixture.dispose(); }
});

it.each([true, false])('keeps native terminal frames on stdout with stderr TTY %s', async stderrTty => {
  const fixture = outputFixture({ plan: 'interactive', stderrTty });
  const frame = '\u001b[2J\u001b[Hterminal frame\n';
  const disconnect = vi.fn();
  const terminal = new TerminalOutput(() => false, disconnect);
  const nativeWrite = vi.spyOn(process.stdout, 'write').mockImplementation((chunk, encodingOrCallback, callback) =>
    fixture.stdout.write(chunk, encodingOrCallback, callback));
  vi.mocked(runInteractiveLoop).mockImplementation(async () => { terminal.write(frame); });
  try {
    expect(supportsFullScreenSurface(fixture.stdin as never, fixture.stdout as never)).toBe(true);
    await fixture.run();
    expect({ stdout: fixture.output.join(''), stderr: fixture.errors.join('') }).toEqual({
      stdout: `root noise\nbootstrap noise\n${frame}cleanup noise\n`, stderr: '',
    });
    expect(fixture.guardAtRoot).toEqual([false]);
    expect(fixture.stdout.write).toBe(fixture.originalWrite);
    expect(terminal.pendingBytes).toBe(0);
    expect(disconnect).not.toHaveBeenCalled();
  } finally { nativeWrite.mockRestore(); fixture.dispose(); }
});

it.each(['root', 'bootstrap'] as const)('restores protected stdout after %s setup failure', async owner => {
  const failure = new Error(`${owner} setup failed`);
  const fixture = outputFixture({ options: { printMode: true },
    ...(owner === 'root' ? { rootFailure: failure } : { bootstrapFailure: failure }) });
  try {
    await expect(fixture.run()).rejects.toBe(failure);
    expect(fixture.output).toEqual([]);
    expect(fixture.errors.join('')).toContain('root noise\n');
    expect(fixture.stdout.write).toBe(fixture.originalWrite);
    expect(isStdoutTakenOver()).toBe(false);
  } finally { fixture.dispose(); }
});

it('waits for the print device callback before completing the process cycle', async () => {
  const fixture = outputFixture({ options: { printMode: true }, holdOutput: true });
  let completed = false;
  const pending = fixture.run().then(() => { completed = true; });
  void pending.catch(() => {});
  try {
    await vi.waitFor(() => { expect(fixture.output.join('')).toBe('answer\n'); });
    expect(completed).toBe(false);
    fixture.complete();
    await pending;
    expect(fixture.stdout.write).toBe(fixture.originalWrite);
  } finally {
    fixture.complete();
    await pending.catch(() => {});
    fixture.dispose();
  }
});

it('propagates output drain failure and restores the writer', async () => {
  const failure = Object.assign(new Error('output closed'), { code: 'EPIPE' });
  const fixture = outputFixture({ options: { printMode: true }, writeFailure: failure });
  try {
    await expect(fixture.run()).rejects.toBe(failure);
    expect(fixture.stdout.write).toBe(fixture.originalWrite);
    expect(isStdoutTakenOver()).toBe(false);
  } finally { fixture.dispose(); }
});

it('preserves an earlier cleanup failure while reporting secondary output failure safely', async () => {
  const cleanupFailure = new Error('resource cleanup failed');
  const outputFailure = Object.assign(new Error('private device detail'), { code: 'EPIPE' });
  const fixture = outputFixture({ options: { jsonEvents: true }, cleanupFailure, writeFailure: outputFailure });
  try {
    await expect(fixture.run()).rejects.toBe(cleanupFailure);
    expect(fixture.writeError).toHaveBeenCalledWith(expect.stringMatching(/output.*failed.*delivery.*not verified/i));
    expect(fixture.writeError.mock.calls.flat().join('')).not.toContain('private device detail');
    expect(fixture.stdout.write).toBe(fixture.originalWrite);
    expect(isStdoutTakenOver()).toBe(false);
  } finally { fixture.dispose(); }
});
