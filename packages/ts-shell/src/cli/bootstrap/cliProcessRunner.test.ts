import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";
import { StreamingRenderer } from "../../presentation/terminal/streaming.js";

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
  logCliBootstrapSessionInitialized: vi.fn(),
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
vi.mock("../runtime/extensions.js", () => ({ closeExtensionsFor: vi.fn() }));
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
import { createCliRootContext, createCliBootstrapRuntimeContext } from "./cliBootstrapContext.js";
import { projectAndRenderCliStartupSurface } from "./cliStartupSurface.js";
import { runInteractiveLoop } from "../interactive/interactiveLoop.js";
import { createCliShutdown } from "../runtime/shutdown.js";
import { createCliProviderRuntimeBridge } from "../provider/cliProviderRuntimeBridge.js";
import { createCliSessionRuntime } from "../runtime/cliSessionRuntimeFactory.js";
import { captureCliStdinPrompts } from "../print/stdinPromptCapture.js";
import { runCliPrintModeRouter } from "../print/printModeRouter.js";
import { runCliProcess } from "./cliProcessRunner.js";

const projectRoot = "/tmp/cli-process-runner-project";

beforeEach(() => {
  vi.clearAllMocks();
});

it("routes a fullscreen recovery hint through the interactive transcript", async () => {
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
      current: { revision: 1 },
      recordDisplay: vi.fn(),
    },
    startupArgs: [],
  } as never;
  const sessionManager = {
    getRecoveryHintAsync: vi.fn(async () => ({
      candidate: { id: "sess_saved" },
      summary: { resumeDisposition: "fully-resumable" },
    })),
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
    bootstrap: { lifecycleNotices: [] },
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
    getCurrentRunController: () => null,
    terminate: vi.fn(),
    observeEvents: vi.fn(),
    getState: () => "idle",
    waitForIdle: vi.fn(async () => undefined),
  } as never);
  vi.mocked(createCliShutdown).mockReturnValue(shutdown as never);
  vi.mocked(runInteractiveLoop).mockImplementation(async (input) => {
    input.setStartupNotice?.(line => transcript.push(line));
    input.onFirstFrame?.();
    await vi.waitFor(() => {
      expect(transcript).toContain(
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
  }) as NodeJS.Process;
  const stdin = Object.assign(new PassThrough(), { isTTY: true }) as NodeJS.ReadStream;
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
      current: { revision: 1 },
      recordDisplay: vi.fn(),
    },
    startupArgs: [],
  } as never;
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
  }) as NodeJS.Process;
  const stdin = Object.assign(new PassThrough(), { isTTY: false }) as NodeJS.ReadStream;
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
