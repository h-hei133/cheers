import type { Interface as ReadlineInterface } from "node:readline";

import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import {
  handleShellClose,
  handleShellSigint,
} from "../../core/shell/signalHandlers.js";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";

export function installInteractiveSignalHandlers(input: {
  readonly process: NodeJS.Process;
  readonly readline: ReadlineInterface | null;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly renderer: StreamingRenderer;
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionManager: { sessionExists(sessionId: string): boolean };
  readonly exit: (code?: number) => void;
}): () => void {
  let closing = false;
  const release = (): void => {
    closing = true;
    input.process.off('SIGINT', interrupt);
    input.readline?.off('close', close);
  };
  const close = (): void => {
    if (closing) return;
    closing = true;
    try {
      handleShellClose({ ...input, readline: input.readline ?? undefined });
    } finally {
      input.process.off("SIGINT", interrupt);
      input.readline?.off("close", close);
    }
  };
  const interrupt = (): void => {
    if (closing) return;
    if (!input.sessionRuntime.getCurrentRunController()) { close(); return; }
    handleShellSigint({
      sessionRuntime: input.sessionRuntime,
      renderer: input.renderer,
      runtimeContext: input.runtimeContext,
      readline: input.readline ?? undefined,
      exit: input.exit,
    });
  };
  input.process.on("SIGINT", interrupt);
  input.readline?.on("close", close);
  return release;
}
