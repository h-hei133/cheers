import { describe, expect, it, vi } from "vitest";
import { InteractiveMode } from "./interactiveMode.js";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import { RecordingTerminal } from "../../test-utils/terminalDouble.js";

function build(overrides: { observeEvents?: () => () => void } = {}): {
  mode: InteractiveMode;
  renderer: StreamingRenderer;
  readline: { current: unknown };
  terminal: RecordingTerminal;
} {
  const renderer = new StreamingRenderer();
  const readline: { current: unknown } = { current: null };
  const terminal = new RecordingTerminal();
  const mode = new InteractiveMode({
    runtimeContext: {
      cwd: "/workspace",
      projectRoot: "/workspace",
      session: { id: "sess_1" },
      gitContext: { branch: "main" },
      runtimeConfig: { provider: "openai", providerCredentials: {}, contextWindow: 64_000 },
    } as unknown as ShellRuntimeContext,
    sessionRuntime: {
      observeEvents: overrides.observeEvents ?? (() => () => {}),
      cancelCurrentRun: () => {},
      getAgentMode: () => "build",
      getPermissionScope: () => "ask",
      getCurrentRunController: () => null,
      terminate: () => {},
    } as unknown as ShellSessionRuntime,
    sessionManager: { sessionExists: () => false } as unknown as SessionManager,
    renderer,
    logger: { info: () => {}, warn: () => {}, error: () => {} } as unknown as StructuredLogger,
    approvalTrustPolicy: {} as unknown as ApprovalTrustPolicy,
    initialMcpGateway: {} as unknown as CliMcpGateway,
    terminal,
    setReadline: (value) => {
      readline.current = value;
    },
  });
  return { mode, renderer, readline, terminal };
}

describe("session wiring", () => {
  it("does not submit buffered keys after an exit key in the same chunk", async () => {
    const { mode, terminal } = build();
    let finish!: () => void;
    Object.assign(terminal, { drainInput: () => new Promise<void>((resolve) => { finish = resolve; }) });
    const submit = vi.spyOn(mode as unknown as { onSubmit(text: string): void }, "onSubmit").mockImplementation(() => {});
    mode.start();
    terminal.input("\x04should-not-submit\r\x1b[200~pasted\x1b[201~\r");
    expect(submit).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(terminal.stopped).toBe(true));
  });

  it("waits for late input before closing the terminal on user exit", async () => {
    const { mode, terminal } = build();
    let finish!: () => void;
    const drain = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    Object.assign(terminal, { drainInput: drain });
    mode.start();
    terminal.input("\x04");
    terminal.input("\x04");
    expect(drain).toHaveBeenCalledOnce();
    expect(terminal.stopped).toBe(false);
    finish();
    await vi.waitFor(() => expect(terminal.stopped).toBe(true));
  });

  it("installs a readline stand-in that can answer runtime questions", () => {
    // Runtime code asks through readline.question; without a working stand-in the
    // approval flow throws instead of prompting.
    const { readline } = build();
    const stub = readline.current as { question?: unknown; close?: unknown };
    expect(typeof stub.question).toBe("function");
    expect(typeof stub.close).toBe("function");
  });

  it("subscribes to the structured event stream on start", () => {
    const observeEvents = vi.fn(() => () => {});
    const { mode } = build({ observeEvents });
    mode.start();
    expect(observeEvents).toHaveBeenCalledOnce();
    mode.stop();
  });

  it("leaves the renderer writing to stdout while idle", () => {
    const { mode, renderer } = build();
    mode.start();
    expect(renderer.captured).toBe(false);
    mode.stop();
  });
  it("releases the session event subscription on stop", () => {
    let released = 0;
    const { mode } = build({ observeEvents: () => () => {
      released += 1;
    } });
    mode.start();
    mode.stop();
    mode.stop();
    expect(released).toBe(1);
  });
  it("cleans up host resources when the terminal disconnects", () => {
    const { mode, renderer, readline, terminal } = build();
    mode.start();
    terminal.disconnect();
    expect(terminal.stopped).toBe(true);
    expect(renderer.captured).toBe(false);
    const readlineInterface = readline.current;
    expect(readlineInterface && typeof readlineInterface === "object" && "close" in readlineInterface).toBe(true);
    mode.stop();
  });
});

describe("terminal attention", () => {
  it("sets the window title to the session and project on start", () => {
    const { mode, terminal } = build();
    mode.start();
    // One OSC 0 write naming the session and the project directory, so a
    // tab among many says which conversation it holds.
    const title = terminal.writes.find((write) => write.startsWith("\x1b]0;"));
    expect(title).toBeDefined();
    expect(title).toContain("sess_1");
    expect(title).toContain("workspace");
  });
});

describe("attention on idle", () => {
  it("leaves a session quiet when the flag is off, which is the default", () => {
    const { mode, terminal } = build();
    mode.start();
    // The build helper sets no attentionOnIdle, so the default — off — is
    // what runs. The title write happens once at start and nothing after it
    // may carry a BEL: a bell that fires when nobody asked is the failure.
    const title = terminal.writes.find((write) => write.startsWith("\x1b]0;"));
    const afterTitle = terminal.writes.slice(terminal.writes.indexOf(title!) + 1);
    expect(afterTitle.some((write) => write.includes("\x07"))).toBe(false);
  });
});
