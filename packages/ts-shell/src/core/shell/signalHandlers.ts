import type { Interface } from "node:readline";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type { ShellSessionRuntime } from "./sessionRuntime.js";
import type { ShellRuntimeContext } from "./runtimeContext.js";

export function handleShellSigint(input: {
  sessionRuntime: ShellSessionRuntime;
  renderer: StreamingRenderer;
  runtimeContext: ShellRuntimeContext;
  readline?: Pick<Interface, "close">;
  exit: (code: number) => never;
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
  exit?: (code: number) => never;
  /** Used only to ask whether the session survived being closed. */
  sessionManager?: { sessionExists(sessionId: string): boolean };
}): void {
  const sessionId = input.runtimeContext.session.id;
  input.sessionRuntime.terminate(sessionId);
  if (input.readline?.close) {
    input.readline.close();
  }
  // One line, and only the line the user needs to come back — and only when there
  // is something to come back to. A run that only listed commands has already had
  // its session discarded, so offering a resume id would name a session that is
  // gone.
  const kept = input.sessionManager?.sessionExists(sessionId) ?? true;
  if (kept) input.renderer.renderLine(`\n  --resume ${sessionId}\n`);
  else input.renderer.renderLine("");
  input.exit?.(0);
}
