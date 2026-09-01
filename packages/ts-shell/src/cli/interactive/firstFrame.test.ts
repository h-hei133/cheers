import { describe, expect, it } from "vitest";
import { InteractiveMode } from "./interactiveMode.js";
import { ManualScheduler, RecordingTerminal } from "../../test-utils/terminalDouble.js";
import { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";

/**
 * Boot the real host against a recording device.
 *
 * The defect this guards is the one unit tests could not see: every component
 * passed in isolation while the first composed frame threw, so the session
 * painted nothing at all. Booting the host end to end and requiring bytes on the
 * device is the cheapest check that cannot be satisfied by a broken frame.
 */
function boot(): { mode: InteractiveMode; terminal: RecordingTerminal; scheduler: ManualScheduler } {
  const terminal = new RecordingTerminal();
  terminal.columns = 80;
  terminal.rows = 24;
  const scheduler = new ManualScheduler();
  const mode = new InteractiveMode({
    terminal,
    scheduler,
    runtimeContext: {
      cwd: "/workspace",
      projectRoot: "/workspace",
      session: { id: "sess_first_frame" },
      gitContext: { branch: "main" },
      runtimeConfig: {
        provider: "openai",
        providerCredentials: { openai: { model: "opus-5" } },
        contextWindow: 200_000,
        agentMode: "build",
      },
    } as unknown as ShellRuntimeContext,
    sessionRuntime: {
      observeEvents: () => () => {},
      cancelCurrentRun: () => {},
      getAgentMode: () => "build",
    } as unknown as ShellSessionRuntime,
    sessionManager: {} as unknown as SessionManager,
    renderer: new StreamingRenderer(),
    logger: { info: () => {}, warn: () => {}, error: () => {} } as unknown as StructuredLogger,
    approvalTrustPolicy: {} as unknown as ApprovalTrustPolicy,
    initialMcpGateway: {} as unknown as CliMcpGateway,
  });
  return { mode, terminal, scheduler };
}

describe("first painted frame", () => {
  it("reaches the device instead of throwing", () => {
    const { mode, terminal, scheduler } = boot();
    mode.start();
    scheduler.flush();
    expect(terminal.writes.length).toBeGreaterThan(0);
    mode.stop();
  });

  it("holds the intro, the status band, and the prompt cue", () => {
    const { mode, terminal, scheduler } = boot();
    mode.start();
    scheduler.flush();
    const output = terminal.drain();
    expect(output).toContain("Coding Agent");
    expect(output).toContain("opus-5");
    expect(output).toContain("main");
    expect(output).toContain("╰─");
    mode.stop();
  });

  it("pins a visible cursor inside the frame", () => {
    const { mode, terminal, scheduler } = boot();
    mode.start();
    scheduler.flush();
    expect(terminal.drain()).toMatch(/\x1b\[\d+;\d+H\x1b\[\?25h/);
    mode.stop();
  });

  it("stays on the normal screen so the transcript keeps real scrollback", () => {
    const { mode, terminal, scheduler } = boot();
    mode.start();
    scheduler.flush();
    expect(terminal.drain()).not.toContain("?1049");
    mode.stop();
  });

  it("routes typed keys into the prompt and repaints", () => {
    const { mode, terminal, scheduler } = boot();
    mode.start();
    scheduler.flush();
    terminal.drain();
    terminal.input("hi");
    scheduler.flush();
    expect(terminal.drain()).toContain("hi");
    mode.stop();
  });

  it("opens completions when the prompt starts a command", () => {
    const { mode, terminal, scheduler } = boot();
    mode.start();
    scheduler.flush();
    terminal.drain();
    terminal.input("/mod");
    scheduler.flush();
    const output = terminal.drain();
    expect(output).toContain("/mode");
    expect(output).toContain("tab complete");
    mode.stop();
  });

  it("restores the device on stop", () => {
    const { mode, terminal, scheduler } = boot();
    mode.start();
    scheduler.flush();
    mode.stop();
    expect(terminal.stopped).toBe(true);
  });
});
