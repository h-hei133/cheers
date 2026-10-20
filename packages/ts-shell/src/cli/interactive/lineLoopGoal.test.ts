import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "../../session/SessionManager.js";
import { runSessionGoalCommand } from "../../planning/goal/command.js";
import { installGoalScheduler } from "../runtime/goalScheduling.js";
import { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import { runLineLoop } from "./lineLoop.js";
import * as interactiveCommandRouter from "./interactiveCommandRouter.js";

let scratch = "";
let manager: SessionManager;
let session: ReturnType<SessionManager["createNew"]>;

async function prepareGoalTest(): Promise<void> {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-line-goal-"));
  const root = path.join(scratch, "project");
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  vi.stubEnv("HOME", path.join(scratch, "home"));
  vi.stubEnv("USERPROFILE", path.join(scratch, "home"));
  vi.stubEnv("GIT_CEILING_DIRECTORIES", scratch);
  manager = new SessionManager();
  session = manager.createNew(root);
  await runSessionGoalCommand(["set", "Continue the recorded goal"], {
    cwd: root,
    projectRoot: root,
    sessionId: session.id,
  }, manager, session);
}

describe("line loop goal integration", () => {
afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(scratch, { recursive: true, force: true });
});

it("settles a real detached goal scheduler when the line stop signal aborts", async () => {
  await prepareGoalTest();
  let releaseSubmission!: () => void;
  const route = vi.spyOn(interactiveCommandRouter, "routeInteractiveCommand").mockImplementationOnce(async input => {
    await new Promise<void>(resolve => { releaseSubmission = resolve; });
    return { turnNumber: input.turnNumber };
  });

  const context = {
    projectRoot: session.projectRoot,
    cwd: session.projectRoot,
    session,
    runtimeConfig: { denyRules: [] },
  } as never;
  const runtime = {
    getAgentMode: () => "build",
    getCurrentRunController: () => null,
    getPermissionScope: () => "ask",
    getState: () => "idle",
    observeEvents: () => () => {},
    cancelCurrentRun: () => releaseSubmission?.(),
    cancelAndWait: async () => {},
    waitForIdle: async () => {},
    terminate: () => {},
  } as never;
  const scheduler = installGoalScheduler(context, manager, runtime, () => {});
  const stop = new AbortController();
  const renderer = new StreamingRenderer();
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const processEvents = new EventEmitter();
  const running = runLineLoop({
    stdin: stdin as never,
    stdout: stdout as never,
    process: processEvents as never,
    runtimeContext: context,
    sessionRuntime: runtime,
    sessionManager: manager,
    renderer,
    logger: { warn() {}, error() {}, info() {} } as never,
    approvalTrustPolicy: {} as never,
    initialMcpGateway: {} as never,
    setReadline() {},
    setActiveNonInteractiveApprovalMode() {},
    exit: vi.fn(),
    stopSignal: stop.signal,
  });

  try {
    expect(scheduler.start()).toBeUndefined();
    await vi.waitFor(() => expect(route).toHaveBeenCalledOnce());
    stop.abort();
    await expect(Promise.race([
      running,
      new Promise((_, reject) => setTimeout(() => reject(new Error("line loop did not settle")), 1_000)),
    ])).resolves.toBeUndefined();
    expect(renderer.captured).toBe(false);
  } finally {
    await scheduler.stop("user");
    stdin.destroy();
    stdout.destroy();
  }
});

it("fences late goal output when scheduler drain times out", async () => {
  await prepareGoalTest();
  let releaseSubmission!: () => void;
  const route = vi.spyOn(interactiveCommandRouter, "routeInteractiveCommand").mockImplementationOnce(async input => {
    await new Promise<void>(resolve => { releaseSubmission = resolve; });
    input.renderer.renderLine("late goal output");
    return { turnNumber: input.turnNumber };
  });

  const context = {
    projectRoot: session.projectRoot,
    cwd: session.projectRoot,
    session,
    runtimeConfig: { denyRules: [] },
  } as never;
  const runtime = {
    getAgentMode: () => "build",
    getCurrentRunController: () => null,
    getPermissionScope: () => "ask",
    getState: () => "idle",
    observeEvents: () => () => {},
    cancelCurrentRun: () => {},
    cancelAndWait: async () => {},
    waitForIdle: async () => {},
    terminate: () => {},
  } as never;
  const scheduler = installGoalScheduler(context, manager, runtime, () => {});
  const stop = new AbortController();
  const renderer = new StreamingRenderer();
  const external: string[] = [];
  renderer.setSink({
    line: line => external.push(line),
    chunk: () => {},
  }, { ownsTranscript: false });
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  let output = "";
  stdout.on("data", chunk => { output += chunk.toString(); });
  const processEvents = new EventEmitter();
  const running = runLineLoop({
    stdin: stdin as never,
    stdout: stdout as never,
    process: processEvents as never,
    runtimeContext: context,
    sessionRuntime: runtime,
    sessionManager: manager,
    renderer,
    logger: { warn() {}, error() {}, info() {} } as never,
    approvalTrustPolicy: {} as never,
    initialMcpGateway: {} as never,
    setReadline() {},
    setActiveNonInteractiveApprovalMode() {},
    exit: vi.fn(),
    stopSignal: stop.signal,
  });

  try {
    expect(scheduler.start()).toBeUndefined();
    await vi.waitFor(() => expect(route).toHaveBeenCalledOnce());
    stop.abort();
    await expect(Promise.race([
      running,
      new Promise((_, reject) => setTimeout(() => reject(new Error("line loop did not settle")), 2_000)),
    ])).resolves.toBeUndefined();
    renderer.renderLine("late original while goal remains pending");
    expect(external).not.toContain("late original while goal remains pending");
    releaseSubmission();
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(external).not.toContain("late goal output");
    expect(external).not.toContain("late original while goal remains pending");
    expect(output).not.toContain("late goal output");
    expect(output).not.toContain("late original while goal remains pending");
    let marker = 0;
    await vi.waitFor(() => {
      const line = `restored sink ${marker++}`;
      renderer.renderLine(line);
      expect(external).toContain(line);
    });
    expect(renderer.captured).toBe(true);
    expect(renderer.transcriptOwned).toBe(false);
  } finally {
    await scheduler.stop("user");
    stdin.destroy();
    stdout.destroy();
  }
});
});
