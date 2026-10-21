import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_CRASH_AGE_MS, MAX_CRASH_RECORDS, crashLogPath, inspectCrashLog, installCrashRecorder, readCrashLog, readRecentCrashes, recordCrash } from "./crashLog.js";

/**
 * A crash tears the terminal down as it goes, so the message scrolls away with
 * it. What is tested here is that a record survives, that it cannot itself throw
 * while the process is failing, and that the file does not grow without bound.
 */

const tempDirs: string[] = [];

function tempFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crash-log-"));
  tempDirs.push(dir);
  return path.join(dir, "crashes.json");
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('diagnostic crash inspection', () => {
  it('distinguishes missing, invalid and mixed-validity sources without rewriting them', () => {
    const file = tempFile();
    expect(inspectCrashLog(file)).toMatchObject({ records: [], status: 'reported', reason: 'missing' });
    for (const raw of ['{ not json', '{}']) {
      fs.writeFileSync(file, raw);
      expect(inspectCrashLog(file)).toMatchObject({ records: [], status: 'unavailable', reason: 'invalid' });
      expect(fs.readFileSync(file, 'utf8')).toBe(raw);
    }
    const raw = JSON.stringify([{ nope: true }, { timestamp: 't', message: 'm', cwd: '/w', kind: 'uncaught-exception' }]);
    fs.writeFileSync(file, raw);
    expect(inspectCrashLog(file)).toMatchObject({ status: 'partial', invalidRecords: 1, records: [{ message: 'm' }] });
    expect(fs.readFileSync(file, 'utf8')).toBe(raw);
  });

  it('refuses an oversized diagnostic source before reading, preserving the compatibility reader', () => {
    const file = tempFile();
    const raw = JSON.stringify([{ timestamp: 't', message: 'm'.repeat(1024), cwd: '/w', kind: 'uncaught-exception' }]);
    fs.writeFileSync(file, raw);
    const read = vi.spyOn(fs, 'readSync');
    expect(inspectCrashLog(file, undefined, 100)).toMatchObject({ status: 'unavailable', reason: 'over-limit', records: [] });
    expect(read).not.toHaveBeenCalled();
    expect(readCrashLog(file)).toHaveLength(1);
    expect(fs.readFileSync(file, 'utf8')).toBe(raw);
  });

  it('handles short reads and releases its descriptor on both valid and invalid JSON', () => {
    const file = tempFile();
    const raw = JSON.stringify([{ timestamp: 't', message: 'm', cwd: '/w', kind: 'uncaught-exception' }]);
    fs.writeFileSync(file, raw);
    const original = fs.readSync;
    const close = vi.spyOn(fs, 'closeSync');
    vi.spyOn(fs, 'readSync').mockImplementation(((fd: number, buffer: Buffer, offset: number, length: number, position: number | null) =>
      original(fd, buffer, offset, Math.min(length, 3), position)) as typeof fs.readSync);
    expect(inspectCrashLog(file)).toMatchObject({ status: 'reported', records: [{ message: 'm' }] });
    expect(close).toHaveBeenCalledTimes(1);
    fs.writeFileSync(file, '{bad');
    close.mockClear();
    expect(inspectCrashLog(file).status).toBe('unavailable');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('preserves unreadable status and keeps raw storage errors out of diagnostics', () => {
    const file = tempFile();
    vi.spyOn(fs, 'openSync').mockImplementation(() => { throw Object.assign(new Error('raw private details'), { code: 'EACCES' }); });
    expect(inspectCrashLog(file)).toEqual({ records: [], status: 'unavailable', reason: 'unreadable', invalidRecords: 0 });
  });

  it('rejects non-file crash storage before reading from it', () => {
    const file = tempFile();
    fs.mkdirSync(file);
    const read = vi.spyOn(fs, 'readSync');
    expect(inspectCrashLog(file)).toMatchObject({ status: 'unavailable', reason: 'unreadable' });
    expect(read).not.toHaveBeenCalled();
  });
});

describe("recordCrash", () => {
  it("writes what the failure was and where", () => {
    const file = tempFile();
    const record = recordCrash(
      { kind: "uncaught-exception", error: new Error("boom"), cwd: "/work", sessionId: "s1" },
      file,
    );

    expect(record?.message).toBe("boom");
    const read = readCrashLog(file);
    expect(read).toHaveLength(1);
    expect(read[0]?.cwd).toBe("/work");
    expect(read[0]?.sessionId).toBe("s1");
  });

  it("keeps the most recent few rather than growing forever", () => {
    const file = tempFile();
    for (let index = 0; index < MAX_CRASH_RECORDS + 3; index += 1) {
      recordCrash({ kind: "uncaught-exception", error: new Error(`failure ${index}`), cwd: "/w" }, file);
    }

    const read = readCrashLog(file);
    expect(read).toHaveLength(MAX_CRASH_RECORDS);
    // The newest are the ones kept, which is what "what has been going wrong
    // lately" needs.
    expect(read.at(-1)?.message).toBe(`failure ${MAX_CRASH_RECORDS + 2}`);
  });

  it("describes a thrown value that is not an Error", () => {
    const file = tempFile();
    recordCrash({ kind: "unhandled-rejection", error: "just a string", cwd: "/w" }, file);
    expect(readCrashLog(file)[0]?.message).toBe("just a string");
  });

  it("does not throw when the file cannot be written", () => {
    // Recording a crash must not become a second crash. A path under a file
    // cannot be created, so the write fails and the caller is told nothing.
    const file = tempFile();
    fs.writeFileSync(file, "not a directory", "utf8");
    const result = recordCrash(
      { kind: "uncaught-exception", error: new Error("boom"), cwd: "/w" },
      path.join(file, "nested", "crashes.json"),
    );
    expect(result).toBeUndefined();
  });

  it("reads an unreadable file as no crashes", () => {
    const file = tempFile();
    fs.writeFileSync(file, "{ not json", "utf8");
    expect(readCrashLog(file)).toEqual([]);
  });

  it("ignores entries that are not crash records", () => {
    const file = tempFile();
    fs.writeFileSync(file, JSON.stringify([{ nope: true }, { timestamp: "t", message: "m", cwd: "/w", kind: "uncaught-exception" }]), "utf8");
    expect(readCrashLog(file)).toHaveLength(1);
  });
});

describe("crashLogPath", () => {
  it("lives with the rest of the user's data", () => {
    expect(crashLogPath()).toContain("crashes.json");
  });
});

describe("readRecentCrashes", () => {
  const NOW = Date.parse("2026-09-25T12:00:00.000Z");
  const daysAgo = (days: number): string => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

  function writeRecords(file: string, timestamps: readonly string[]): void {
    fs.writeFileSync(
      file,
      JSON.stringify(
        timestamps.map((timestamp, index) => ({
          timestamp,
          kind: "uncaught-exception",
          message: `crash ${index}`,
          cwd: "/w",
        })),
      ),
      "utf8",
    );
  }

  it("leaves out a record older than the limit and keeps a newer one", () => {
    const file = tempFile();
    writeRecords(file, [daysAgo(8), daysAgo(1)]);

    const recent = readRecentCrashes(file, NOW);
    expect(recent.map((record) => record.message)).toEqual(["crash 1"]);
  });

  it("keeps a record inside the limit", () => {
    const file = tempFile();
    writeRecords(file, [daysAgo(6)]);
    expect(readRecentCrashes(file, NOW)).toHaveLength(1);
  });

  it("treats the limit itself as recent", () => {
    // The boundary is inclusive: a record written exactly at the limit is not yet
    // old, and an off-by-one here would be invisible except at this instant.
    const file = tempFile();
    writeRecords(file, [new Date(NOW - MAX_CRASH_AGE_MS).toISOString()]);
    expect(readRecentCrashes(file, NOW)).toHaveLength(1);
  });

  it("leaves out a record whose timestamp cannot be read", () => {
    // Keeping it would put a crash into the list with no way to show that it is
    // recent, which is the one thing this reader is for.
    const file = tempFile();
    writeRecords(file, ["not a date"]);
    expect(readRecentCrashes(file, NOW)).toEqual([]);
  });

  /**
   * The point of a second reader rather than a flag: filtering must not reach the
   * path that writes. The writer reads the file and rewrites it whole, so a
   * filter that the writer went through would silently drop the old records on
   * the next crash — which is the opposite of what the age limit is for.
   */
  it("does not cause an old record to be dropped when the next crash is recorded", () => {
    const file = tempFile();
    writeRecords(file, [daysAgo(30)]);
    // Showing it is filtered; keeping it is not.
    expect(readRecentCrashes(file, NOW)).toEqual([]);

    recordCrash({ kind: "uncaught-exception", error: new Error("newer"), cwd: "/w" }, file);

    const onDisk = readCrashLog(file);
    expect(onDisk).toHaveLength(2);
    expect(onDisk.map((record) => record.message)).toContain("crash 0");
  });
});

describe("installCrashRecorder", () => {
  it("records an uncaught exception and can be removed again", () => {
    const file = tempFile();
    const stop = installCrashRecorder({ cwd: "/work", filePath: file });
    try {
      // The listener is invoked directly rather than emitted: emitting an
      // uncaught exception is reported by the test runner as a real one, which
      // would drown the assertion being made. It rethrows on purpose, so the
      // throw is what says the handler ran.
      const handler = process.listeners("uncaughtException").at(0) as (error: unknown) => void;
      expect(() => handler(new Error("from the process"))).toThrow("from the process");
      expect(readCrashLog(file).some((record) => record.message === "from the process")).toBe(true);
    } finally {
      stop();
    }
  });

  it("registers first, so another listener cannot exit before the record is written", () => {
    // A handler registered later runs later. A crash that exits the process
    // before this one runs takes the record with it.
    const file = tempFile();
    const stop = installCrashRecorder({ cwd: "/work", filePath: file });
    try {
      const first = process.listeners("uncaughtException")[0];
      expect(first).toBeTypeOf("function");
    } finally {
      stop();
    }
  });

  it("stops recording once removed", () => {
    const file = tempFile();
    const stop = installCrashRecorder({ cwd: "/work", filePath: file });
    const before = process.listeners("uncaughtException").length;
    stop();
    expect(process.listeners("uncaughtException").length).toBe(before - 1);
    expect(readCrashLog(file)).toEqual([]);
  });

  /**
   * The three cases above call the handler directly, which cannot show whether
   * the process still dies. Registering any `uncaughtException` listener
   * replaces Node's default of terminating, so a recorder that only writes a
   * file converts every fatal crash into a process that carries on — and no
   * amount of calling the handler in-process can reveal that. These run a real
   * child process instead, which is the only way to observe the exit.
   */
  describe("what the process does after a crash", () => {
    function runFixture(mode: string, file: string): { status: number | null } {
      const repoRoot = path.resolve(process.cwd(), "../..");
      const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
      const fixturePath = path.join(process.cwd(), "src", "test-utils", "crashRecorderProcess.ts");
      const result = spawnSync(process.execPath, [tsxCli, fixturePath, mode, file], {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 30_000,
      });
      return { status: result.status };
    }

    it("still terminates on an uncaught exception, and records it first", () => {
      const file = tempFile();
      const { status } = runFixture("throw", file);

      // Not 99: the process did not reach the line after the failure.
      expect(status).not.toBe(99);
      expect(status).not.toBe(0);
      // And the record was written before it died.
      expect(readCrashLog(file).map((record) => record.message)).toContain("fatal from a timer");
    });

    it("keeps running after an unhandled rejection, and records it", () => {
      const file = tempFile();
      const { status } = runFixture("reject", file);

      // 99 is the line after the failure, so the process survived by design.
      expect(status).toBe(99);
      expect(readCrashLog(file).map((record) => record.kind)).toContain("unhandled-rejection");
    });
  });
});
