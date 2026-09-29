import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withFileLock, writeJsonFileAtomic } from "./sessionFileStore.js";
import {
  STALE_LOCK_AGE_MS,
  clearTakeoverNotice,
  isLockStale,
  readTakeoverNotice,
  takeOverStaleLock,
} from "./lockStaleness.js";

/**
 * A lock nobody can release blocks every later write to that session. What is
 * checked here is the recovery: a stale lock is detected, taken over exactly
 * once by exactly one contender, and reported rather than silently replaced.
 *
 * Equally, what is deliberately not claimed here: a lock whose owner is merely
 * paused past the age threshold is still declared stale, and the takeover
 * leaves two writers. That is recorded in the module, not contradicted by a
 * test that would have to assert mutual exclusion the design does not provide.
 */

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("a lock whose owner is gone", () => {
  it("reports a stale lock when the pid no longer answers on this host", () => {
    const root = tempDir("stale-lock-");
    try {
      const lockPath = path.join(root, "state.lock");
      // A pid that cannot be delivered to. The signal number is 0 — a liveness
      // probe — and the pid chosen is one no process can hold here.
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: 2 ** 31 - 1, hostname: os.hostname(), createdAt: new Date().toISOString() }),
      );

      const stale = isLockStale(lockPath);
      expect(stale?.reason).toBe("owner-dead");
      expect(stale?.previousPid).toBe(2 ** 31 - 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports a stale lock that predates the timeout by its age", () => {
    const root = tempDir("stale-lock-age-");
    try {
      const lockPath = path.join(root, "state.lock");
      const old = Date.now() - STALE_LOCK_AGE_MS - 5_000;
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: process.pid, hostname: os.hostname(), createdAt: new Date(old).toISOString() }),
      );

      // The owner is this process and very much alive, which is exactly the
      // case the age exists for: a paused owner cannot answer, and waiting
      // past the threshold is a decision the threshold makes.
      expect(isLockStale(lockPath)?.reason).toBe("lock-expired");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves a live lock alone, whichever way it answers", () => {
    const root = tempDir("live-lock-");
    try {
      const lockPath = path.join(root, "state.lock");
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: process.pid, hostname: os.hostname(), createdAt: new Date().toISOString() }),
      );

      expect(isLockStale(lockPath)).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("takes a lock over once, and only one contender succeeds", () => {
    const root = tempDir("takeover-");
    try {
      const lockPath = path.join(root, "state.lock");
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: 2 ** 31 - 1, hostname: os.hostname(), createdAt: new Date().toISOString() }),
      );

      const stale = isLockStale(lockPath);
      expect(stale).toBeDefined();
      if (!stale) throw new Error("unreachable");

      // The directory claim is what makes this once: a second takeover of the
      // same lock fails because the claim already exists.
      const claim = `${lockPath}.takeover`;
      fs.mkdirSync(claim);
      try {
        expect(takeOverStaleLock(lockPath, stale)).toBe(false);
      } finally {
        fs.rmSync(claim, { recursive: true, force: true });
      }

      expect(takeOverStaleLock(lockPath, stale)).toBe(true);
      expect(fs.existsSync(lockPath)).toBe(false);

      const notice = readTakeoverNotice(lockPath);
      expect(notice?.reason).toBe("owner-dead");
      expect(notice?.previousPid).toBe(2 ** 31 - 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("clears the notice on release, so a clean lock leaves no residue", () => {
    const root = tempDir("notice-");
    try {
      const lockPath = path.join(root, "state.lock");
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: 2 ** 31 - 1, hostname: os.hostname(), createdAt: new Date().toISOString() }),
      );
      const stale = isLockStale(lockPath);
      if (!stale) throw new Error("unreachable");
      takeOverStaleLock(lockPath, stale);
      expect(readTakeoverNotice(lockPath)).toBeDefined();

      clearTakeoverNotice(lockPath);
      expect(readTakeoverNotice(lockPath)).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("withFileLock with a stale lock on disk", () => {
  it("recovers and runs the action instead of timing out", () => {
    const root = tempDir("recover-");
    try {
      const lockPath = path.join(root, "state.lock");
      const statePath = path.join(root, "state.json");
      // A lock left by a process that is gone, which before the recovery held
      // the session until the timeout on every write.
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: 2 ** 31 - 1, hostname: os.hostname(), createdAt: new Date().toISOString() }),
      );

      // Through the lock that guards the write, which is the path production
      // takes: `writeSessionState` calls `withFileLock` and then writes.
      const written = withFileLock(lockPath, () => {
        writeJsonFileAtomic(statePath, { status: "written-through-a-recovered-lock" });
        return true;
      });
      expect(written).toBe(true);
      expect(fs.readFileSync(statePath, "utf8")).toContain("written-through-a-recovered-lock");
      // The takeover is reported, not silent.
      expect(readTakeoverNotice(lockPath)?.reason).toBe("owner-dead");
      // And the lock itself is gone, so the next write is not held up either.
      expect(fs.existsSync(lockPath)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("still blocks when the owner is alive, and still times out", () => {
    const root = tempDir("blocked-");
    try {
      const lockPath = path.join(root, "state.lock");
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: process.pid, hostname: os.hostname(), createdAt: new Date().toISOString() }),
      );

      expect(() => withFileLock(lockPath, () => "unreachable")).toThrow(/lock timeout/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
