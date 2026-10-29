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
  /** Signal-only persistence; ordinary exits and restart/profile close never invoke it. */
  onSignal?: (signal: 'SIGTERM' | 'SIGHUP') => void | Promise<void>;
  /** Total bound across resource owners; expiry never admits runtime reentry. */
  timeoutMs?: number;
}): { close(): Promise<void>; exit(code?: number): void } {
  let exiting = false;
  let exitCode = 0;
  let closing: Promise<void> | undefined;
  let signalClose: Promise<void> | undefined;
  const signalExit = (signal: 'SIGTERM' | 'SIGHUP', code: number): void => {
    if (exiting) return;
    signalClose ??= Promise.resolve().then(() => input.onSignal?.(signal));
    // close() may already be pending on a stuck owner; retain this failure for
    // its bounded join without generating an unhandled rejection meanwhile.
    void signalClose.catch(() => {});
    exit(code);
  };
  const onTerm = () => signalExit('SIGTERM', 143);
  const onHangup = () => signalExit('SIGHUP', 129);
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
      const cleanup = (async () => {
        // Capture signal persistence before resource cancellation can change its
        // recovery evidence. A signal arriving during close joins the same budget.
        const signal = signalClose;
        const results = await Promise.allSettled([
          signal ?? Promise.resolve(),
          Promise.resolve().then(() => input.close()),
          killAllTrackedProcesses(),
        ]);
        if (!signal && signalClose) results.push(...await Promise.allSettled([signalClose]));
        return results;
      })();
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
