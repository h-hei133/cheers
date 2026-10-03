import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { Writable } from "node:stream";
import os from "node:os";
import path from "node:path";
import { createOutputSink } from "./output.js";

const { openStream } = vi.hoisted(() => ({ openStream: vi.fn() }));
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  openStream.mockImplementation(actual.createWriteStream);
  return { ...actual, createWriteStream: openStream };
});

const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  openStream.mockReset().mockImplementation(fs.createWriteStream);
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function tempDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-output-"));
  directories.push(directory);
  return directory;
}

describe("output that outgrows the limit", () => {
  it("bounds UTF-8 bytes without splitting the leading character", async () => {
    const sink = createOutputSink({ limitBytes: 5, label: "bytes" });
    sink.append("prefix中文🙂");
    expect(sink.tail).toBe("🙂");
    expect(Buffer.byteLength(sink.tail)).toBeLessThanOrEqual(5);
    expect(sink.truncated).toBe(true);
    await sink.close();
  });

  it("does not reopen a failed spill and misrepresent a suffix as the whole output", async () => {
    const directory = tempDirectory();
    const target = path.join(directory, "blocked");
    fs.writeFileSync(target, "not a directory");
    const sink = createOutputSink({ limitBytes: 4, spillDirectory: target, label: "failed" });
    sink.append("lost-prefix");
    fs.unlinkSync(target);
    fs.mkdirSync(target);
    sink.append("new-suffix");
    await sink.close();
    expect(sink.spillPath).toBeUndefined();
    expect(fs.readdirSync(target)).toEqual([]);
    expect(sink.tail).toBe("ffix");
  });

  it("returns backpressure until the slow writer drains and closes only after flushing", async () => {
    let flush: (() => void) | undefined;
    const stream = new Writable({ highWaterMark: 1, write(_chunk, _encoding, callback) { flush = callback; } });
    openStream.mockReturnValue(stream as fs.WriteStream);
    const sink = createOutputSink({ limitBytes: 2, spillDirectory: tempDirectory(), label: "slow" });
    const pending = sink.append("prefix-tail");
    expect(pending).toBeInstanceOf(Promise);
    let drained = false;
    void pending?.then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    let closed = false;
    const closing = sink.close().then(() => { closed = true; });
    await Promise.resolve();
    expect(closed).toBe(false);
    flush!();
    await pending;
    await closing;
    expect(drained).toBe(true);
    expect(stream.closed).toBe(true);
    expect(() => sink.append("after-close")).toThrow(/closed/);
  });

  it("settles an errored writer and removes its previously visible path", async () => {
    let fail: ((error: Error) => void) | undefined;
    const stream = new Writable({ highWaterMark: 1, write(_chunk, _encoding, callback) { fail = callback; } });
    const open = openStream.mockReturnValue(stream as fs.WriteStream);
    const sink = createOutputSink({ limitBytes: 2, spillDirectory: tempDirectory(), label: "error" });
    const pending = sink.append("prefix");
    stream.emit("open", 99);
    expect(sink.spillPath).toBeDefined();
    const closing = sink.close();
    fail!(new Error("disk full"));
    await pending;
    await closing;
    expect(sink.spillPath).toBeUndefined();
    expect(open).toHaveBeenCalledTimes(1);
    expect(sink.tail).toBe("ix");
  });

  /**
   * The whole of it is kept, not just the part that fit.
   *
   * Dropping the excess would leave a reader unable to tell a clean run from a
   * buried failure: the beginning of a long output is where the reason for it
   * usually is, and the end alone does not say. So the end stays in memory for
   * the notice and everything goes to a file.
   */
  it("is written out whole, beginning included", async () => {
    const directory = tempDirectory();
    const sink = createOutputSink({ limitBytes: 10, spillDirectory: directory, label: "bg_1" });

    sink.append("FIRST\n");
    sink.append("SECOND\n");
    sink.append("THIRD\n");
    await sink.close();

    expect(sink.truncated).toBe(true);
    expect(sink.spillPath).toBeDefined();
    const written = fs.readFileSync(sink.spillPath!, "utf8");
    // The beginning is the point: it is what a tail cannot show.
    expect(written).toContain("FIRST");
    expect(written).toContain("THIRD");
  });

  it("keeps the end in memory, which is where a failure speaks", async () => {
    const directory = tempDirectory();
    const sink = createOutputSink({ limitBytes: 20, spillDirectory: directory, label: "bg_2" });

    sink.append("aaaaaaaaaaaaaaaaaaaa");
    sink.append("LAST_LINE");
    await sink.close();

    expect(sink.tail).toContain("LAST_LINE");
    expect(sink.tail.length).toBeLessThanOrEqual(20);
  });

  /**
   * Nothing is written until there is something to write.
   *
   * Most commands print a few lines. Creating a file for every one of them would
   * litter a directory with empty logs and cost a write each time, for output
   * that already fits in memory.
   */
  it("creates no file when the output fits", async () => {
    const directory = tempDirectory();
    const sink = createOutputSink({ limitBytes: 1_024, spillDirectory: directory, label: "bg_3" });

    sink.append("short output\n");
    await sink.close();

    expect(sink.truncated).toBe(false);
    expect(sink.spillPath).toBeUndefined();
    expect(fs.readdirSync(directory)).toEqual([]);
  });

  it("still bounds memory with nowhere to spill", async () => {
    const sink = createOutputSink({ limitBytes: 10, label: "bg_4" });

    sink.append("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    await sink.close();

    // Still bounded and still disclosed; there is simply nowhere to recover from.
    expect(sink.truncated).toBe(true);
    expect(sink.tail.length).toBeLessThanOrEqual(10);
    expect(sink.spillPath).toBeUndefined();
  });

  it("can be closed more than once", async () => {
    const sink = createOutputSink({ limitBytes: 4, spillDirectory: tempDirectory(), label: "bg_5" });
    sink.append("aaaaaaaa");

    await sink.close();
    await expect(sink.close()).resolves.toBeUndefined();
  });
});
