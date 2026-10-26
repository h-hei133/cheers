/** Observe close from spawn onward, including launch errors and signal exits. */
export function processSettlement(child, timeoutMs = 30_000) {
  let closed = false, launchError, interrupted = false;
  let resolveClose;
  const closing = new Promise(resolve => { resolveClose = resolve; });
  const onError = error => { launchError = error; };
  const onClose = (code, signal) => {
    closed = true;
    clearTimeout(timer);
    child.off("error", onError);
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onInterrupt);
    process.off("exit", onExit);
    resolveClose({ code, signal, launchError, interrupted });
  };
  const onInterrupt = () => { interrupted = true; child.kill("SIGTERM"); };
  const onExit = () => { if (!closed) child.kill("SIGTERM"); };
  const timer = setTimeout(() => { interrupted = true; child.kill("SIGTERM"); }, timeoutMs);
  child.on("error", onError);
  child.once("close", onClose);
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onInterrupt);
  process.once("exit", onExit);
  return {
    assertRunning() {
      if (launchError) throw launchError;
      if (interrupted || closed || child.exitCode !== null || child.signalCode !== null) {
        throw new Error("benchmark process ended or was interrupted before observation");
      }
    },
    async wait(timeout = 20_000) {
      let deadline;
      try {
        return await Promise.race([closing, new Promise((_, reject) => {
          deadline = setTimeout(() => reject(new Error("benchmark process close is unconfirmed")), timeout);
        })]);
      } finally { clearTimeout(deadline); }
    },
    async stop() {
      if (closed) return;
      // script forwards TERM to its PTY child and waits for it. Never call a
      // killed launcher alone a settled target, or continue after uncertainty.
      child.kill("SIGTERM");
      try { await this.wait(5_000); }
      catch (error) {
        child.kill("SIGKILL");
        await this.wait(2_000).catch(() => undefined);
        throw error;
      }
    },
  };
}
