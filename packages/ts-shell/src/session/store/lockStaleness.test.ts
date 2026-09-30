import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withFileLock, writeJsonFileAtomic } from "./sessionFileStore.js";
import {
  STALE_LOCK_AGE_MS,
  isLockStale,
  takeOverStaleLock,
} from "./lockStaleness.js";

/**
 * A lock nobody can release blocks every later write to that session. What is
 * checked here is the recovery: a stale lock is detected, taken over exactly
 * by one contender at a time without leaving an unused notification sidecar.
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
        expect(takeOverStaleLock(lockPath)).toBe(false);
      } finally {
        fs.rmSync(claim, { recursive: true, force: true });
      }

      expect(takeOverStaleLock(lockPath)).toBe(true);
      expect(fs.existsSync(lockPath)).toBe(false);

      expect(fs.readdirSync(root)).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("releases a recovered lock when its action fails without notification residue", () => {
    const root = tempDir("notice-");
    try {
      const lockPath = path.join(root, "state.lock");
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: 2 ** 31 - 1, hostname: os.hostname(), createdAt: new Date().toISOString() }),
      );
      const stale = isLockStale(lockPath);
      if (!stale) throw new Error("unreachable");
      expect(() => withFileLock(lockPath, () => { throw new Error("action failed"); })).toThrow("action failed");
      expect(fs.readdirSync(root)).toEqual([]);
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
      expect(fs.existsSync(`${lockPath}.stale`)).toBe(false);
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

describe("a lock that is being acquired", () => {
  it("is not stale while it is still being written", () => {
    // The holder creates the file and then writes its record into it. In that
    // window the file exists, is empty, and cannot be parsed — and a reader that
    // treated that as proof of a dead owner would take the lock away from a
    // process midway through acquiring it, leaving two writers on one state
    // file. The window is microseconds; requiring age is what makes it matter
    // not at all.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-lock-"));
    const lockPath = path.join(directory, "state.lock");

    fs.writeFileSync(lockPath, "");
    expect(isLockStale(lockPath)).toBeUndefined();

    fs.writeFileSync(lockPath, '{"pid":');
    expect(isLockStale(lockPath)).toBeUndefined();

    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("is recovered once it is old, because then nobody is writing it", () => {
    // The other half: an unreadable lock that has been sitting there is a file
    // nobody is maintaining, and refusing to take it over would block the
    // session forever — which is the failure the takeover exists to remove.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-lock-"));
    const lockPath = path.join(directory, "state.lock");
    fs.writeFileSync(lockPath, "");
    const past = new Date(Date.now() - 120_000);
    fs.utimesSync(lockPath, past, past);

    expect(isLockStale(lockPath)?.reason).toBe("lock-unreadable");

    fs.rmSync(directory, { recursive: true, force: true });
  });
});
