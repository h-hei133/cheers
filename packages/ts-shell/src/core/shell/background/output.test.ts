import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createOutputSink } from "./output.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function tempDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-output-"));
  directories.push(directory);
  return directory;
}

describe("output that outgrows the limit", () => {
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
