import { withConfiguration } from "../../test-utils/configuration.js";
import { selectTheme, updateAppearance } from "../../presentation/theme/selection.js";
import { currentTheme } from "../../presentation/theme/theme.js";
import { describe, expect, it, vi } from "vitest";
import { InteractiveMode, type InteractiveModeOptions } from "./interactiveMode.js";
import { ManualScheduler, RecordingTerminal } from "../../test-utils/terminalDouble.js";
import { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import { stripAnsi } from "../../presentation/tui/text/ansi.js";
import type { Picker } from "./overlay.js";
import { StartupSurface } from './startup.js';

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
  tuiMode?: "regular" | "fullscreen",
): { mode: InteractiveMode; terminal: RecordingTerminal; scheduler: ManualScheduler; runtimeContext: ShellRuntimeContext } {
  const terminal = new RecordingTerminal();
  terminal.columns = 80;
  terminal.rows = 24;
  const scheduler = new ManualScheduler();
  const runtimeContext = withConfiguration({
      cwd: "/workspace",
      projectRoot: "/workspace",
      session: { id: "sess_first_frame" },
      gitContext: { branch: "main" },
      runtimeConfig: {
        provider: "openai",
        providerCredentials: { openai: { model: "opus-5" } },
        configDiagnostics: [],
        contextWindow: 200_000,
        agentMode: "build",
        tuiMode,
      },
    } as unknown as ShellRuntimeContext);
  const mode = new InteractiveMode({
    terminal,
    scheduler,
    runtimeContext,
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
      warn: () => {},
      error: () => {},
    } as unknown as StructuredLogger,
    approvalTrustPolicy: {} as unknown as ApprovalTrustPolicy,
    initialMcpGateway: {} as unknown as CliMcpGateway,
    ...overrides,
  });
  return { mode, terminal, scheduler, runtimeContext };
}

describe("transcript search ownership", () => {
  it.each(["regular", "fullscreen"] as const)("retains the actual %s screen after config reload", (screen) => {
    const { mode, terminal, scheduler, runtimeContext } = boot({}, screen);
    mode.start();
    scheduler.flush();
    terminal.drain();
    try {
      runtimeContext.runtimeConfig = { ...runtimeContext.runtimeConfig, tuiMode: screen === "regular" ? "fullscreen" : "regular" };
      terminal.input("\x1b[102;6u");
      scheduler.flush();
      const output = terminal.drain();
      expect(output).not.toContain("\x1b[?1049h");
      expect(stripAnsi(output).includes("find:")).toBe(screen === "fullscreen");
      expect(stripAnsi(output).includes("requires fullscreen mode")).toBe(screen === "regular");
    } finally { mode.stop(); }
  });

  it("explains the regular-screen limitation and leaves typing in the composer", () => {
    const { mode, terminal, scheduler } = boot({}, "regular");
    mode.start();
    scheduler.flush();
    terminal.drain();
    try {
      terminal.input("\x1b[102;6u");
      scheduler.flush();
      const notice = stripAnsi(terminal.drain());
      expect(notice).toContain("Transcript search requires fullscreen mode");
      expect(notice).not.toContain("find:");

      terminal.input("draft");
      scheduler.flush();
      const typed = stripAnsi(terminal.drain());
      expect(typed).toContain(" draft");
      expect(typed).not.toContain("find:");
    } finally {
      mode.stop();
    }
  });

  it("keeps transcript search available on the alternate screen", () => {
    const { mode, terminal, scheduler } = boot({}, "fullscreen");
    mode.start();
    scheduler.flush();
    terminal.drain();
    try {
      terminal.input("\x1b[102;6u");
      terminal.input("Cheers");
      scheduler.flush();
      const searched = stripAnsi(terminal.drain());
      expect(searched).toContain("find: Cheers");
      expect(searched).not.toContain("requires fullscreen mode");
      expect(searched).not.toContain("❯   Cheers");
    } finally {
      mode.stop();
    }
  });
});

describe("first painted frame", () => {
  it.each(["regular", "fullscreen"] as const)(
    "reports the %s first frame only after the device accepts its write",
    screen => {
      const onFirstFrame = vi.fn();
      const { mode, terminal, scheduler } = boot({ onFirstFrame }, screen);

      mode.start();
      expect(onFirstFrame).not.toHaveBeenCalled();

      scheduler.flush();
      expect(terminal.writes.length).toBeGreaterThan(0);
      expect(onFirstFrame).toHaveBeenCalledOnce();

      scheduler.flush();
      expect(onFirstFrame).toHaveBeenCalledOnce();
      mode.stop();
    },
  );

  it("reports user intent from actual key input", () => {
    const onUserIntent = vi.fn();
    const { mode, terminal, scheduler } = boot({ onUserIntent }, "fullscreen");

    mode.start();
    scheduler.flush();
    terminal.drain();
    terminal.input("x");
    scheduler.flush();

    expect(onUserIntent).toHaveBeenCalledOnce();
    mode.stop();
  });

  it("reports user intent from actual mouse input", () => {
    const onUserIntent = vi.fn();
    const { mode, terminal, scheduler } = boot({ onUserIntent }, "fullscreen");

    mode.start();
    scheduler.flush();
    terminal.drain();
    terminal.input("\x1b[<0;1;1M");
    scheduler.flush();

    expect(onUserIntent).toHaveBeenCalledOnce();
    mode.stop();
  });

  it("reports user intent from actual paste input", () => {
    const onUserIntent = vi.fn();
    const { mode, terminal, scheduler } = boot({ onUserIntent }, "fullscreen");

    mode.start();
    scheduler.flush();
    terminal.drain();
    terminal.input("\x1b[200~draft\x1b[201~");
    scheduler.flush();

    expect(onUserIntent).toHaveBeenCalledOnce();
    mode.stop();
  });

  it("routes startup notices into the interactive transcript", () => {
    let startupNotice: ((line: string) => void) | undefined;
    const { mode, terminal, scheduler } = boot({
      setStartupNotice: notice => { startupNotice = notice; },
    }, "fullscreen");

    mode.start();
    scheduler.flush();
    terminal.drain();
    startupNotice?.("Recovery hint: /resume");
    scheduler.flush();

    expect(stripAnsi(terminal.drain())).toContain("Recovery hint: /resume");
    mode.stop();
  });

  it("reports user intent when a picker choice is applied", () => {
    const onUserIntent = vi.fn();
    const { mode, scheduler } = boot({ onUserIntent }, "fullscreen");
    const host = mode as unknown as {
      applyPicker(picker: Picker, ids: readonly string[]): void;
    };
    const picker = {
      title: "Choice",
      form: "modal",
      load: async () => [],
      apply: async () => undefined,
    } as Picker;

    mode.start();
    scheduler.flush();
    host.applyPicker(picker, ["choice"]);

    expect(onUserIntent).toHaveBeenCalledOnce();
    mode.stop();
  });

  it("reaches the device instead of throwing", () => {
    const { mode, terminal, scheduler } = boot();
    mode.start();
    scheduler.flush();
    expect(terminal.writes.length).toBeGreaterThan(0);
    mode.stop();
  });

  it("holds the intro and status band with the restored prompt arrow", () => {
    const { mode, terminal, scheduler } = boot();
    mode.start();
    scheduler.flush();
    const output = terminal.drain();
    expect(output).toContain("Cheers");
    expect(output).toContain("opus-5");
    expect(output).toContain("main");
    expect(output).toContain("❯");
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

  it('focuses resume after changing a moved slash query and completes it with Tab', () => {
    const { mode, terminal, scheduler } = boot();
    mode.start(); scheduler.flush(); terminal.drain();
    try {
      terminal.input('/'); scheduler.flush();
      terminal.input('\x1b[B'); terminal.input('\x1b[B'); terminal.input('\x1b[B');
      scheduler.flush(); terminal.drain();
      terminal.input('res'); scheduler.flush(); terminal.drain();
      terminal.input('\t'); scheduler.flush();
      const output = stripAnsi(terminal.drain());
      expect(output).toContain('/resume ');
      expect(output).not.toContain('/restore ');
    } finally { mode.stop(); }
  });

  it("gives a private screen back without leaving the conversation behind", () => {
    // The default mode is the private screen. Giving it back restores the
    // terminal exactly as the session found it; a conversation that should
    // survive the session belongs on the terminal's own screen (`regular`).
    const { mode, terminal, scheduler } = boot();
    mode.start();
    scheduler.flush();
    terminal.input("hello there");
    scheduler.flush();
    terminal.drain();
    mode.stop();
    const written = terminal.drain();
    const left = written.indexOf("\x1b[?1049l");
    expect(left).toBeGreaterThan(-1);
    const document = written.slice(left);
    expect(document).not.toContain("Cheers");
    expect(document).not.toContain("hello there");
    expect(document).not.toContain("❯");
  });

  it("keeps the conversation on the terminal's own screen", () => {
    const { mode, terminal, scheduler } = boot({}, "regular");
    mode.start();
    scheduler.flush();
    terminal.input("hello there");
    scheduler.flush();
    const painted = terminal.drain();
    expect(painted).toContain("Cheers");
    mode.stop();
    // Nothing was taken, so nothing has to be given back, and the rows the
    // session wrote stay in the terminal's scrollback where they were written.
    expect(terminal.drain()).not.toContain("\x1b[?1049l");
  });

  it("restores the device on stop", () => {
    const { mode, terminal, scheduler } = boot();
    mode.start();
    scheduler.flush();
    mode.stop();
    expect(terminal.stopped).toBe(true);
  });
});


it.each(["regular", "fullscreen"] as const)("repaints the %s adopted host when a late appearance report arrives", (screen) => {
  updateAppearance("dark");
  selectTheme("auto");
  const terminal = new RecordingTerminal(), scheduler = new ManualScheduler();
  const startup = new StartupSurface(terminal, scheduler, vi.fn());
  const { mode } = boot({ startup, scheduler }, screen);
  try {
    mode.start();
    scheduler.flush();
    terminal.drain();
    terminal.input("draft");
    scheduler.flush();
    terminal.drain();
    terminal.input("\x1b[?997;");
    terminal.input("2n");
    scheduler.flush();
    expect(currentTheme()).toBe("light");
    const output = terminal.drain();
    expect(stripAnsi(output)).toContain(" draft");
    expect(stripAnsi(output)).not.toContain("997");
  } finally { mode.stop(); startup.dispose(); selectTheme("dark"); updateAppearance("dark"); }
});
