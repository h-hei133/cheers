import type { Interface as ReadlineInterface } from "node:readline";

import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import {
  handleShellClose,
  handleShellSigint,
} from "../../core/shell/signalHandlers.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";

export function installInteractiveSignalHandlers(input: {
  readonly process: NodeJS.Process;
  readonly readline: ReadlineInterface | null;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly renderer: StreamingRenderer;
  readonly runtimeContext: ShellRuntimeContext;
  readonly exit: (code?: number) => never;
}): void {
  input.process.on("SIGINT", () => {
    handleShellSigint({
      sessionRuntime: input.sessionRuntime,
      renderer: input.renderer,
      runtimeContext: input.runtimeContext,
      readline: input.readline ?? undefined,
      exit: input.exit,
    });
  });
}

export function installInteractiveCloseHandler(input: {
  readonly readline: ReadlineInterface;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly renderer: StreamingRenderer;
  readonly runtimeContext: ShellRuntimeContext;
  readonly exit: (code?: number) => never;
}): void {
  input.readline.on("close", () => {
    handleShellClose({
      sessionRuntime: input.sessionRuntime,
      renderer: input.renderer,
      runtimeContext: input.runtimeContext,
      readline: input.readline ?? undefined,
      exit: input.exit,
    });
  });
}
