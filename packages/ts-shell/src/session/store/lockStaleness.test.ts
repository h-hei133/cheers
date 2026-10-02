import fs from "node:fs";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});
import { withFileLock, writeJsonFileAtomic } from "./sessionFileStore.js";
import {
  STALE_LOCK_AGE_MS,
  INCOMPLETE_LOCK_AGE_MS,
  isLockStale,
  takeOverStaleLock,
} from "./lockStaleness.js";

/**
 * A lock nobody can release blocks every later write to that session. What is
 * checked here is the recovery: a stale lock is detected, taken over exactly
 * by one contender at a time without leaving an unused notification sidecar.
 *
 * Local liveness protects synchronous critical sections beyond the age limit.
 * Foreign-owner recovery is still heuristic and is not a fencing guarantee.
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

  it("does not expire a live local owner while its event loop cannot renew", () => {
    const root = tempDir("stale-lock-age-");
    try {
      const lockPath = path.join(root, "state.lock");
      const old = Date.now() - STALE_LOCK_AGE_MS - 5_000;
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: process.pid, hostname: os.hostname(), createdAt: new Date(old).toISOString() }),
      );

      expect(isLockStale(lockPath)).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("retains age recovery for a foreign owner and waits on uncertain local liveness", () => {
    const root = tempDir("lock-owner-");
    const lockPath = path.join(root, "state.lock");
    const createdAt = new Date(Date.now() - STALE_LOCK_AGE_MS - 1_000).toISOString();
    try {
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, hostname: "another-host", createdAt }));
      expect(isLockStale(lockPath)?.reason).toBe("lock-expired");
      fs.writeFileSync(lockPath, JSON.stringify({ pid: 2 ** 40, hostname: os.hostname(), createdAt }));
      expect(isLockStale(lockPath)?.reason).toBe("lock-expired");
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, hostname: os.hostname(), createdAt }));
      const probe = vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("not permitted"), { code: "EPERM" }); });
      try { expect(isLockStale(lockPath)).toBeUndefined(); } finally { probe.mockRestore(); }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("rechecks ownership after an earlier stale observation", () => {
    const root = tempDir("lock-race-");
    const lockPath = path.join(root, "state.lock");
    try {
      fs.writeFileSync(lockPath, JSON.stringify({ pid: 2 ** 31 - 1, hostname: os.hostname() }));
      expect(isLockStale(lockPath)).toBeDefined();
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, hostname: os.hostname() }));
      expect(takeOverStaleLock(lockPath)).toBe(false);
      expect(fs.existsSync(lockPath)).toBe(true);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
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
  it.each(["EACCES", "EIO"])("does not infer dead ownership from %s on an old lock", (code) => {
    const root = tempDir("unreadable-lock-");
    const lockPath = path.join(root, "state.lock");
    try {
      fs.writeFileSync(lockPath, "{}");
      const old = new Date(Date.now() - STALE_LOCK_AGE_MS * 2);
      fs.utimesSync(lockPath, old, old);
      vi.mocked(readFileSync).mockImplementationOnce(() => { throw Object.assign(new Error("read failed"), { code }); });
      expect(isLockStale(lockPath)).toBeUndefined();
      expect(fs.existsSync(lockPath)).toBe(true);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it.each(["", '{"pid":'])("recovers incomplete metadata within acquisition timeout: %j", (content) => {
    const root = tempDir("incomplete-lock-");
    const lockPath = path.join(root, "state.lock");
    try {
      fs.writeFileSync(lockPath, content);
      const modified = fs.statSync(lockPath).mtimeMs;
      expect(isLockStale(lockPath, modified + INCOMPLETE_LOCK_AGE_MS - 1)).toBeUndefined();
      expect(isLockStale(lockPath, modified + INCOMPLETE_LOCK_AGE_MS)?.reason).toBe("lock-unreadable");
      expect(withFileLock(lockPath, () => "recovered")).toBe("recovered");
      expect(fs.readdirSync(root)).toEqual([]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("is not stale while it is still being written", () => {
    // The holder creates the file and then writes its record into it. In that
    // window the file exists, is empty, and cannot be parsed — and a reader that
    // treated that as proof of a dead owner would take the lock away from a
    // process midway through acquiring it, leaving two writers on one state
    // file. A short grace protects ordinary acquisition, without claiming to
    // distinguish a crash from an arbitrarily paused, unidentified owner.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-lock-"));
    const lockPath = path.join(directory, "state.lock");

    fs.writeFileSync(lockPath, "");
    expect(isLockStale(lockPath)).toBeUndefined();

    fs.writeFileSync(lockPath, '{"pid":');
    expect(isLockStale(lockPath)).toBeUndefined();

    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("recovers old incomplete metadata using the creation grace", () => {
    // Recover common crash residue; age alone does not prove nobody is writing.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-lock-"));
    const lockPath = path.join(directory, "state.lock");
    fs.writeFileSync(lockPath, "");
    const past = new Date(Date.now() - 120_000);
    fs.utimesSync(lockPath, past, past);

    expect(isLockStale(lockPath)?.reason).toBe("lock-unreadable");

    fs.rmSync(directory, { recursive: true, force: true });
  });
});
