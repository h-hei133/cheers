import { describe, expect, it, vi } from "vitest";
import { InteractiveMode, type InteractiveModeOptions } from "./interactiveMode.js";
import { createView } from "./surface.js";
import type { InteractiveView } from "../../presentation/tui/view.js";
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
function boot(
  overrides: Partial<InteractiveModeOptions> = {},
): { mode: InteractiveMode; terminal: RecordingTerminal; scheduler: ManualScheduler; warnings: string[] } {
  const terminal = new RecordingTerminal();
  terminal.columns = 80;
  terminal.rows = 24;
  const scheduler = new ManualScheduler();
  const warnings: string[] = [];
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
      getPermissionScope: () => "ask",
    } as unknown as ShellSessionRuntime,
    sessionManager: {} as unknown as SessionManager,
    renderer: new StreamingRenderer(),
    logger: {
      info: () => {},
      warn: (message: string) => warnings.push(message),
      error: () => {},
    } as unknown as StructuredLogger,
    approvalTrustPolicy: {} as unknown as ApprovalTrustPolicy,
    initialMcpGateway: {} as unknown as CliMcpGateway,
    surface: "frame",
    ...overrides,
  });
  return { mode, terminal, scheduler, warnings };
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

  it("takes a screen of its own, and gives it back", () => {
    const { mode, terminal, scheduler } = boot();
    mode.start();
    scheduler.flush();
    // A screen of its own is what makes leaving restore the terminal exactly, and
    // what lets the mouse be ours without costing the user their scrollback.
    expect(terminal.drain()).toContain("\x1b[?1049h");
    mode.stop();
    expect(terminal.drain()).toContain("\x1b[?1049l");
  });

  it("asks for mouse reports, since the screen is ours to answer for", () => {
    const { mode, terminal, scheduler } = boot();
    mode.start();
    scheduler.flush();

    expect(terminal.drain()).toContain("\x1b[?1002h");
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

describe("composed surface through the host", () => {
  it("paints the same first frame as the default surface", () => {
    const frame = boot({ surface: "frame" });
    const composed = boot({ surface: "composed" });
    frame.mode.start();
    composed.mode.start();
    frame.scheduler.flush();
    composed.scheduler.flush();
    const left = frame.terminal.drain();
    const right = composed.terminal.drain();
    expect(right).toBe(left);
    expect(right).toContain("Coding Agent");
    expect(right).toContain("opus-5");
    frame.mode.stop();
    composed.mode.stop();
  });

  it("routes typed keys, completions, and scrolling through the composed surface", () => {
    const { mode, terminal, scheduler } = boot({ surface: "composed" });
    mode.start();
    scheduler.flush();
    terminal.drain();
    terminal.input("/mod");
    scheduler.flush();
    const output = terminal.drain();
    expect(output).toContain("/mode");
    expect(output).toContain("tab complete");
    terminal.input("\x1b[5~");
    scheduler.flush();
    expect(terminal.writes.length).toBeGreaterThan(0);
    mode.stop();
    expect(terminal.drain()).toContain("\x1b[?1049l");
  });

  it("falls back to the default surface when the composed one cannot paint, keeping the transcript", () => {
    const failing = vi.fn();
    const { mode, terminal, scheduler, warnings } = boot({
      surface: "composed",
      viewFactory: (choice, context, state) => {
        if (choice === "frame") return createView(choice, context, state);
        return {
          ...createView(choice, context, state),
          renderFrame: () => {
            failing();
            throw new Error("composed paint failed");
          },
        } as InteractiveView;
      },
    });
    mode.start();
    scheduler.flush();
    const output = terminal.drain();
    expect(failing).toHaveBeenCalledOnce();
    expect(output).toContain("Coding Agent");
    expect(output).toContain("composed surface failed to paint");
    expect(warnings).toEqual(["interactive surface fell back to the default"]);
    terminal.input("hi");
    scheduler.flush();
    expect(terminal.drain()).toContain("hi");
    mode.stop();
    expect(terminal.drain()).toContain("\x1b[?1049l");
  });
});
