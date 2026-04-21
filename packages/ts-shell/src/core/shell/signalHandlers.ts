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
    input.renderer.renderLine("\nRun cancelled by user (Ctrl+C)");
    input.sessionRuntime.cancelCurrentRun();
    input.readline.prompt();
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
  readline: Pick<Interface, "close">;
  exit: (code: number) => never;
}): void {
  input.renderer.renderLine("\nExiting...");
  input.sessionRuntime.terminate(input.runtimeContext.session.id);
  input.readline.close();
  input.exit(0);
}
