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
