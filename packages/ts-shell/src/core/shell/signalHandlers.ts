import type { Interface } from "node:readline";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type { ShellSessionRuntime } from "./sessionRuntime.js";
import type { ShellRuntimeContext } from "./runtimeContext.js";

export function handleShellSigint(input: {
  sessionRuntime: ShellSessionRuntime;
  renderer: StreamingRenderer;
  runtimeContext: ShellRuntimeContext;
  readline?: Pick<Interface, "close">;
  exit: (code: number) => void;
}): void {
  if (input.sessionRuntime.getCurrentRunController()) {
    input.renderer.renderLine("\nCancellation requested by user (Ctrl+C).");
    input.sessionRuntime.cancelCurrentRun();
    return;
  }

  handleShellClose({
    sessionRuntime: input.sessionRuntime,
    renderer: input.renderer,
    runtimeContext: input.runtimeContext,
    readline: input.readline,
    exit: input.exit,
  });
}

export function handleShellClose(input: {
  sessionRuntime: ShellSessionRuntime;
  renderer: StreamingRenderer;
  runtimeContext: ShellRuntimeContext;
  readline?: Pick<Interface, "close">;
  /**
   * Optional: surfaces that call this without an exit hook (and tests) must not be
   * forced to terminate the process. Absent means "close the session, keep running".
   */
  exit?: (code: number) => void;
  /** Used only to ask whether the session survived being closed. */
  sessionManager?: { sessionExists(sessionId: string): boolean };
}): void {
  const sessionId = input.runtimeContext.session.id;
  let exitCode = 0;
  let closed = false;
  try {
    input.sessionRuntime.terminate(sessionId);
    closed = true;
    input.readline?.close();
    // Closing retains unfinished recovery evidence; offer only a retained id.
    const kept = input.sessionManager?.sessionExists(sessionId) ?? true;
    if (kept) input.renderer.renderLine(`\n  --resume ${sessionId}\n`);
    else input.renderer.renderLine("");
  } catch (error) {
    exitCode = 1;
    try {
      input.renderer.renderLine(closed
        ? "Session cleanup failed; process exit was not verified."
        : "Session state could not be saved; session close was not verified.");
    } catch { /* A disconnected terminal must still reach the exit hook. */ }
    // Embedded callers retain the failure instead of silently continuing.
    if (!input.exit) throw error;
  } finally {
    input.exit?.(exitCode);
  }
}
