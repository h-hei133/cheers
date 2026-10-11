import type { EventEmitter } from "node:events";
import { killAllTrackedProcesses } from "../../core/shell/platform/processTree.js";

/** Keep asynchronous resource cleanup ahead of catchable CLI exits. */
export function createCliShutdown(input: {
  close(): Promise<void>;
  process: Pick<NodeJS.Process, "on" | "off">;
  streams?: readonly EventEmitter[];
  exit: (code: number) => void;
  writeError: (message: string) => void;
  handleInterrupt?: boolean;
  /** Total bound across resource owners; expiry never admits runtime reentry. */
  timeoutMs?: number;
}): { close(): Promise<void>; exit(code?: number): void } {
  let exiting = false;
  let exitCode = 0;
  let closing: Promise<void> | undefined;
  const onTerm = () => exit(143);
  const onHangup = () => exit(129);
  const onInterrupt = () => exit(130);
  const onStreamError = (error: NodeJS.ErrnoException): void => {
    if (!["EPIPE", "EIO", "ERR_STREAM_DESTROYED"].includes(error.code ?? "")) throw error;
    // Output delivery or the terminal connection failed. Retain error handlers
    // until cleanup and exit finish: more buffered writes may fail meanwhile.
    exit(1);
  };
  const removeHandlers = (): void => {
    input.process.off("SIGTERM", onTerm);
    input.process.off("SIGHUP", onHangup);
    input.process.off("SIGINT", onInterrupt);
    for (const stream of input.streams ?? []) stream.off("error", onStreamError);
  };
  const drain = async (): Promise<void> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const cleanup = Promise.allSettled([
        Promise.resolve().then(() => input.close()),
        killAllTrackedProcesses(),
      ]);
      const results = await Promise.race([cleanup, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Resource cleanup timed out; runtime reentry is blocked.')), input.timeoutMs ?? 10_000);
      })]);
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    }
    finally { clearTimeout(timer); if (!exiting) removeHandlers(); }
  };
  const close = (): Promise<void> => closing ??= drain();
  const exit = (code = 0): void => {
    if (exitCode === 0 && code !== 0) exitCode = code;
    if (exiting) return;
    exiting = true;
    void close().then(
      () => {
        try { input.exit(exitCode); }
        finally { removeHandlers(); }
      },
      () => {
        try { input.writeError("Resource cleanup failed; process exit was not verified."); }
        catch { /* The error stream may be the disconnected resource. */ }
        try { input.exit(1); }
        finally { removeHandlers(); }
      },
    );
  };
  input.process.on("SIGTERM", onTerm);
  input.process.on("SIGHUP", onHangup);
  if (input.handleInterrupt) input.process.on("SIGINT", onInterrupt);
  for (const stream of input.streams ?? []) stream.on("error", onStreamError);
  return { close, exit };
}
