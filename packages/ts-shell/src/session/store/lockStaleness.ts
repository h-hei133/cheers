import * as fs from "node:fs";
import os from "node:os";

/**
 * Recovering a lock its owner cannot release.
 *
 * A crashed process leaves its lock file behind, and a lock nobody can take
 * blocks every later write to that session. This module answers two questions:
 * whether the lock is stale, and who took it over when it was.
 *
 * What this does and does not achieve, stated so the next reader does not
 * over-trust it: it removes the common failure — a dead process blocking
 * forever. It is not mutual exclusion under arbitrary pause. A process frozen
 * past the age threshold (SIGSTOP, a VM pause, a long GC) is declared stale
 * while it still considers itself the owner, and a takeover then has two
 * writers on one state file. There is no fencing token to stop the first from
 * overwriting the second, which is why the writers that care compare the
 * content they read against what is on disk before replacing it.
 *
 * The checks are heuristics rather than proofs, and the liveness one is the
 * weakest. A PID can be reused by an unrelated process, so `kill(pid, 0)` can
 * report a live owner that has nothing to do with the lock. Two conditions are
 * required together — the hostname must match, and the lock must be old — and
 * when the answer is uncertain the caller waits rather than takes over: a
 * wrong wait is slow, a wrong takeover is data loss.
 */

/** How old a lock must be before its owner is presumed gone. */
export const STALE_LOCK_AGE_MS = 60_000;

/** A lock that was taken over, recorded where the next reader will find it. */
export interface StaleLockTakeover {
  readonly reason: "owner-dead" | "lock-expired" | "lock-unreadable";
  /** The pid recorded in the lock that was removed. */
  readonly previousPid?: number;
  readonly hostname: string;
  readonly at: string;
}

/** The path a takeover is reported at, beside the lock it concerns. */
export function takeoverNoticePath(lockPath: string): string {
  return `${lockPath}.stale`;
}

/**
 * Read the takeover notice a lock carries, when it carries one.
 *
 * A notice is not an error and does not block anything; it is the record that
 * the lock now in place was not the first. `writeSessionState` reads it on
 * every write because the caller that wants to know cannot have been watching
 * at the moment it happened.
 */
export function readTakeoverNotice(lockPath: string): StaleLockTakeover | undefined {
  try {
    const raw = fs.readFileSync(takeoverNoticePath(lockPath), "utf8");
    const parsed = JSON.parse(raw) as StaleLockTakeover;
    if (!parsed || typeof parsed !== "object" || !parsed.reason) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/** Write the takeover notice, replacing any earlier one for the same lock. */
export function writeTakeoverNotice(lockPath: string, notice: StaleLockTakeover): void {
  try {
    fs.writeFileSync(takeoverNoticePath(lockPath), JSON.stringify(notice, null, 2), "utf8");
  } catch {
    // The notice is a record, not a requirement: a lock whose notice cannot be
    // written is still taken over, and the write that proceeds is unaffected.
  }
}

/** Remove the notice, for the owner that released cleanly and wants no residue. */
export function clearTakeoverNotice(lockPath: string): void {
  try {
    fs.rmSync(takeoverNoticePath(lockPath), { force: true });
  } catch {
    // Same reasoning as the write: best effort.
  }
}

/**
 * Whether the lock at `lockPath` is stale and may be taken over.
 *
 * Three readings, in the order that costs least to trust:
 * a lock whose owner's pid is gone (checked only when it was written on this
 * host — a pid from another machine names a process this one cannot ask
 * about); a lock older than the age threshold regardless of what its pid
 * says; and a lock that cannot be read at all, which is a file nobody is
 * maintaining. A lock that fails none of these is left alone, and the caller
 * keeps waiting.
 */
export function isLockStale(lockPath: string, now: number = Date.now()): StaleLockTakeover | undefined {
  let owner: { readonly pid?: number; readonly hostname?: string; readonly createdAt?: string } | undefined;
  try {
    const raw = fs.readFileSync(lockPath, "utf8");
    owner = JSON.parse(raw) as typeof owner;
  } catch {
    // Unreadable is a distinct case from missing: missing means nobody holds
    // the lock, unreadable means somebody wrote something the format does not
    // recognize. Both are resolved by taking over, but for different reasons.
    return { reason: "lock-unreadable", hostname: os.hostname(), at: new Date(now).toISOString() };
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

  if (typeof owner?.pid === "number" && owner.hostname === os.hostname()) {
    try {
      process.kill(owner.pid, 0);
      // The owner answered, so the lock is live.
      return undefined;
    } catch {
      return {
        reason: "owner-dead",
        previousPid: owner.pid,
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
export function takeOverStaleLock(lockPath: string, stale: StaleLockTakeover): boolean {
  const claim = `${lockPath}.takeover`;
  try {
    fs.mkdirSync(claim);
  } catch {
    // Another process is already taking over. It will remove the lock or leave
    // it; either way this caller should go back to waiting.
    return false;
  }
  try {
    fs.rmSync(lockPath, { force: true });
    writeTakeoverNotice(lockPath, stale);
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
