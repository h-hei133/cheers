import type { Readable } from "node:stream";

/** Consume late terminal reports until idle, with a hard bound for a noisy link. */
export function drainInput(input: Readable, maxMs = 1000, idleMs = 50): Promise<void> {
  if (input.destroyed || input.readableEnded) return Promise.resolve();
  return new Promise((resolve) => {
    let idle: ReturnType<typeof setTimeout>;
    const limit = setTimeout(finish, maxMs);
    function finish(): void {
      clearTimeout(limit);
      clearTimeout(idle);
      input.off("data", received);
      input.off("end", finish);
      input.off("close", finish);
      resolve();
    }
    function received(): void {
      clearTimeout(idle);
      idle = setTimeout(finish, idleMs);
    }
    input.on("data", received);
    input.once("end", finish);
    input.once("close", finish);
    received();
    input.resume();
  });
}

/** Enter raw mode when stdin is a TTY, returning whether this call took ownership. */
export function acquireRawMode(rawOwned: boolean): boolean {
  if (typeof process.stdin.setRawMode !== "function") return rawOwned;
  if (!process.stdin.isRaw) {
    process.stdin.setRawMode(true);
    return true;
  }
  return rawOwned;
}

/** Release raw mode if owned and pause stdin, tolerating already-torn-down streams. */
export function releaseRawMode(rawOwned: boolean): boolean {
  try {
    if (rawOwned && typeof process.stdin.setRawMode === "function") {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  } catch {
    // Best-effort: the stream may already be torn down.
  }
  return false;
}
