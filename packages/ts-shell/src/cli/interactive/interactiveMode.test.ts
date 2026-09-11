import { describe, expect, it, vi } from "vitest";
import { InteractiveMode } from "./interactiveMode.js";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
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
    } as unknown as ShellSessionRuntime,
    sessionManager: {} as unknown as SessionManager,
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
