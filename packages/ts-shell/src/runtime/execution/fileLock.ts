import { AsyncLocalStorage } from "node:async_hooks";
import { realpath } from "node:fs/promises";
import path from "node:path";

/**
 * One lock per file, so two mutations of the same file cannot interleave.
 *
 * A read-modify-write is the shape every workspace edit takes: read the file,
 * work out what it should now say, write it back. Run two of those at once on one
 * file and both read the same original, so the second write is built on content
 * the first already replaced and the first change is gone. Both calls report
 * success. Nothing errors, nothing is logged, and the file is simply missing an
 * edit someone asked for.
 *
 * Serializing only the write does not help. By then both reads have happened, and
 * the damage is already decided.
 *
 * Different files never wait on each other: the lock is keyed by file, so work on
 * unrelated targets stays concurrent.
 *
 * Re-entry within one call chain is skipped rather than waited on. A tool locks
 * the file to cover its read and write, and the write then reaches the generic
 * write path, which locks the same file again. Waiting there would be a deadlock:
 * the outer call cannot finish until the write returns, and the write cannot
 * start. The inner acquisition therefore proceeds when the same chain already
 * holds the file. This is per-chain, so a second caller still waits.
 */

/** The queue tail for each locked file, by canonical path. */
const queues = new Map<string, Promise<void>>();

/**
 * Files this call chain already holds.
 *
 * Keyed by the chain rather than by the file so unrelated concurrent callers
 * still queue normally. `AsyncLocalStorage` is what makes "this chain" knowable
 * across awaits without threading a parameter through every layer.
 */
const heldByChain = new AsyncLocalStorage<Map<string, number>>();

/**
 * Serializes lock registration.
 *
 * Registering means reading a key's queue and replacing it, and the key is
 * resolved asynchronously. Two registrations for one file could both read the
 * same tail and both decide they are next, which is the interleaving this module
 * exists to prevent. Chaining registrations makes that window impossible.
 */
let registration = Promise.resolve();

/**
 * The path two mentions of the same file share.
 *
 * Symlinks are why this resolves rather than compares strings: a workspace can
 * reach one file by more than one name, and a lock that treated those as different
 * files would let the very writes it exists to serialize happen at once.
 */
async function lockKey(absolutePath: string): Promise<string> {
  const resolved = path.resolve(absolutePath);
  // The file itself first: that is what makes two names for one file — a link and
  // its target — resolve to a single key. Resolving only the directory would give
  // them different keys, and a mutation through the link would then run alongside
  // one through the target, which is the interleaving this module exists to stop.
  try {
    return await realpath(resolved);
  } catch {
    // Usually because the file does not exist yet, which is ordinary: an edit that
    // creates a file takes this path. Resolving the directory still gives the file
    // the same key before and after it appears, because the name is unchanged.
    try {
      return path.join(await realpath(path.dirname(resolved)), path.basename(resolved));
    } catch {
      // A directory that cannot be resolved is about to fail the write anyway.
      return resolved;
    }
  }
}

/**
 * Run `mutate` with exclusive use of `absolutePath`.
 *
 * The lock is held for the whole call, not just the write, because what needs
 * protecting is the read that decided the write.
 */
export async function withFileLock<T>(
  absolutePath: string,
  mutate: () => Promise<T>,
): Promise<T> {
  const held = heldByChain.getStore();
  if (held) {
    // Already held by this chain: run directly instead of waiting on ourselves.
    const key = await lockKey(absolutePath);
    if ((held.get(key) ?? 0) > 0) {
      return mutate();
    }
  }
  const registered = registration.then(async () => {
    const key = await lockKey(absolutePath);
    const held = queues.get(key) ?? Promise.resolve();
    const released = Promise.withResolvers<void>();
    const tail = held.then(() => released.promise);
    queues.set(key, tail);
    return { key, held, tail, release: released.resolve };
  });
  // A failed registration must not strand every later one behind it.
  registration = registered.then(
    () => undefined,
    () => undefined,
  );

  const { key, tail, release } = await registered;
  await registered.then((r) => r.held);
  const chain = heldByChain.getStore() ?? new Map<string, number>();
  try {
    chain.set(key, (chain.get(key) ?? 0) + 1);
    return await heldByChain.run(chain, mutate);
  } finally {
    release();
    // Only the last holder cleans up: an earlier one removing the entry would
    // let a new caller start while a later holder is still queued.
    if (queues.get(key) === tail) {
      queues.delete(key);
    }
  }
}
