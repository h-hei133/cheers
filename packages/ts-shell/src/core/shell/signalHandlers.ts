import type { Interface } from "node:readline";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { ShellSessionRuntime } from "./sessionRuntime.js";
import type { ShellRuntimeContext } from "./runtimeContext.js";

export function handleShellSigint(input: {
  sessionRuntime: ShellSessionRuntime;
  renderer: StreamingRenderer;
  runtimeContext: ShellRuntimeContext;
  readline: Pick<Interface, "close" | "prompt">;
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
  exit: (code: number) => never;
}): void {
  const sessionId = input.runtimeContext.session.id;
  input.sessionRuntime.terminate(sessionId);
  if (input.readline?.close) {
    input.readline.close();
  }
  // One line, and only the line the user needs to come back. Anything more is
  // noise on the way out.
  input.renderer.renderLine(`\n  --resume ${sessionId}\n`);
  input.exit(0);
}
