import * as fs from "node:fs";
import os from "node:os";

/**
 * Recovering a lock its owner cannot release.
 *
 * A crashed process leaves its lock file behind, and a lock nobody can take
 * blocks every later write to that session. This module answers two questions:
 * whether the lock is stale and whether it can be removed for another attempt.
 *
 * What this does and does not achieve, stated so the next reader does not
 * over-trust it: it removes the common failure — a dead process blocking
 * forever. A live local owner remains protected across synchronous I/O and
 * pauses, which cannot run a timer heartbeat. Foreign or unidentifiable owners
 * still use an age heuristic. There is no fencing token to stop an owner that
 * was replaced externally from writing; recovery is not distributed exclusion.
 *
 * The checks are heuristics rather than proofs, and the liveness one is the
 * weakest. A PID can be reused by an unrelated process, so `kill(pid, 0)` can
 * report a live owner that has nothing to do with the lock. Local dead-owner
 * recovery requires a matching hostname and an ESRCH result. When a local
 * liveness probe is uncertain the caller waits rather than takes over: a
 * wrong wait is slow, a wrong takeover is data loss.
 */

/** How old a lock must be before its owner is presumed gone. */
export const STALE_LOCK_AGE_MS = 60_000;

/** Allow metadata creation to finish, while recovering a crash within the acquisition timeout. */
export const INCOMPLETE_LOCK_AGE_MS = 500;

/** The observation that makes a lock eligible for recovery. */
export interface StaleLockTakeover {
  readonly reason: "owner-dead" | "lock-expired" | "lock-unreadable";
  /** The pid recorded in the lock that was removed. */
  readonly previousPid?: number;
  readonly hostname: string;
  readonly at: string;
}

/**
 * Whether the lock at `lockPath` is stale and may be taken over.
 *
 * Three readings, in the order that costs least to trust:
 * a lock whose owner's pid is gone (checked only when it was written on this
 * host — a pid from another machine names a process this one cannot ask
 * about); a foreign/unidentified lock older than the age threshold; and a lock
 * with incomplete JSON older than a short creation grace. Filesystem read
 * failures provide no evidence of owner death and are never taken over.
 *
 * The creation grace avoids immediate takeover between creating a lock and
 * writing its metadata. Age is a recovery heuristic, not proof of owner death:
 * a holder paused before recording its identity can still outlive the grace.
 */
export function isLockStale(lockPath: string, now: number = Date.now()): StaleLockTakeover | undefined {
  let owner: { readonly pid?: number; readonly hostname?: string; readonly createdAt?: string } | undefined;
  try {
    const raw = fs.readFileSync(lockPath, "utf8");
    owner = JSON.parse(raw) as typeof owner;
  } catch (error) {
    if (!(error instanceof SyntaxError)) return undefined;
    // Empty/partial metadata can be a crash between create and write. The grace
    // is shorter than acquisition timeout, but still avoids immediate takeover
    // during ordinary creation. It cannot identify an owner paused before its
    // metadata was written; this remains an unfenced recovery heuristic.
    try {
      const stat = fs.statSync(lockPath);
      if (now - stat.mtimeMs >= INCOMPLETE_LOCK_AGE_MS) {
        return { reason: "lock-unreadable", hostname: os.hostname(), at: new Date(now).toISOString() };
      }
    } catch {
      // The file vanished between the read and here, which means it was released.
    }
    return undefined;
  }

  if (typeof owner?.pid === "number" && Number.isInteger(owner.pid) && owner.pid > 0 && owner.pid <= 2 ** 31 - 1 && owner.hostname === os.hostname()) {
    try {
      process.kill(owner.pid, 0);
      // Synchronous critical sections cannot run a timer heartbeat. A live
      // local owner therefore remains protected even when it is paused.
      return undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") return undefined;
      return {
        reason: "owner-dead",
        previousPid: owner.pid,
        hostname: os.hostname(),
        at: new Date(now).toISOString(),
      };
    }
  }

  if (typeof owner?.createdAt === "string") {
    const created = Date.parse(owner.createdAt);
    if (Number.isFinite(created) && now - created >= STALE_LOCK_AGE_MS) {
      return {
        reason: "lock-expired",
        ...(typeof owner.pid === "number" ? { previousPid: owner.pid } : {}),
        hostname: os.hostname(),
        at: new Date(now).toISOString(),
      };
    }
  }

  // A lock with no readable owner record and no age to judge by: old enough to
  // predate the record format, or written by something that did not include
  // one. Either way there is nothing to wait for.
  try {
    const stat = fs.statSync(lockPath);
    if (now - stat.mtimeMs >= STALE_LOCK_AGE_MS) {
      return { reason: "lock-expired", hostname: os.hostname(), at: new Date(now).toISOString() };
    }
  } catch {
    // The file vanished between the read and here, which means it was released.
  }
  return undefined;
}

/**
 * Take a stale lock over, once.
 *
 * The claim is made with a directory rather than a check, because two processes
 * can both judge the same lock stale at the same moment: whichever `mkdir`
 * succeeds is the only one that removes the lock, which is what stops a
 * takeover from racing itself.
 */
export function takeOverStaleLock(lockPath: string): boolean {
  const claim = `${lockPath}.takeover`;
  try {
    fs.mkdirSync(claim);
  } catch {
    // Another process is already taking over. It will remove the lock or leave
    // it; either way this caller should go back to waiting.
    return false;
  }
  try {
    // The file may have changed after the caller observed an expired owner.
    if (!isLockStale(lockPath)) return false;
    fs.rmSync(lockPath, { force: true });
    return true;
  } finally {
    try {
      fs.rmSync(claim, { recursive: true, force: true });
    } catch {
      // The claim is cleaned up best-effort; a leftover directory delays the
      // next takeover attempt rather than preventing it.
    }
  }
}
