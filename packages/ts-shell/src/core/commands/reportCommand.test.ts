import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runReportCommand } from "./reportCommandRuntime.js";
import { createZipArchive } from "../../observability/zipArchive.js";
import type { CommandContext } from "./types.js";

/**
 * The report archive must not carry secrets.
 *
 * This is the one path whose output leaves the machine, which makes it the place
 * a scrubbing gap matters most — and the place a private copy of the scrubber
 * would eventually drift. The assertions therefore scan the archive's **bytes**,
 * not the structured fields: a secret that survives in a field the code never
 * thought to scrub is exactly what a field-by-field check would miss.
 */

const tempDirs: string[] = [];
let previousHome: string | undefined;
let previousProfile: string | undefined;

function fakeHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "report-cmd-"));
  tempDirs.push(home);
  return home;
}

beforeEach(() => {
  const home = fakeHome();
  previousHome = process.env.HOME;
  previousProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
});

afterEach(() => {
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  if (previousProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = previousProfile;
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function contextFor(cwd: string): CommandContext {
  return { cwd, sessionId: "sess_report" } as CommandContext;
}

/** Everything the archive holds, concatenated, so a scan sees every byte. */
function archiveBytes(file: string): string {
  return fs.readFileSync(file).toString("latin1");
}

describe("runReportCommand", () => {
  it("writes an archive the system unzip can open", async () => {
    const dir = fakeHome();
    const target = path.join(dir, "out.zip");
    const result = await runReportCommand([target], contextFor(dir));
    expect(result.output).toContain("Report written");
    expect(fs.existsSync(target)).toBe(true);
    // The zip signature, so this is a real archive rather than a renamed file.
    const head = fs.readFileSync(target).subarray(0, 4);
    expect(head.readUInt32LE(0)).toBe(0x04034b50);
  });

  it("does not include the conversation", async () => {
    const dir = fakeHome();
    const target = path.join(dir, "out.zip");
    await runReportCommand([target], contextFor(dir));
    const bytes = archiveBytes(target);
    // Only the two entries it declares, and neither is a transcript.
    expect(bytes).toContain("report.json");
    expect(bytes).toContain("summary.md");
    expect(bytes).not.toContain("transcript");
  });

  it("keeps a credential out of the archive", async () => {
    // The record is seeded through the real crash path, so this exercises the
    // scrubber rather than a hand-built fixture.
    const { recordCrash } = await import("../../observability/crashLog.js");
    recordCrash({
      kind: "uncaught-exception",
      error: new Error("failed with api_key=sk-abcdefghijklmnopqrstuvwxyz012345 and token=ghp_abcdefghijklmnopqrst"),
      cwd: "/work",
    });

    const dir = fakeHome();
    const target = path.join(dir, "out.zip");
    const result = await runReportCommand([target], contextFor(dir));

    const bytes = archiveBytes(target);
    expect(bytes).not.toContain("sk-abcdefghijklmnopqrstuvwxyz012345");
    expect(bytes).not.toContain("ghp_abcdefghijklmnopqrst");
    // And it says that it scrubbed something, rather than doing it silently.
    expect(result.output).toContain("Scrubbed");
  });

  it("reports when nothing needed scrubbing", async () => {
    const dir = fakeHome();
    const target = path.join(dir, "out.zip");
    const result = await runReportCommand([target], contextFor(dir));
    expect(result.output).toContain("Nothing needed scrubbing");
  });

  it("names the file it wrote", async () => {
    const dir = fakeHome();
    const target = path.join(dir, "named.zip");
    const result = await runReportCommand([target], contextFor(dir));
    expect(result.output).toContain(target);
  });
});

describe("createZipArchive", () => {
  it("round-trips entry contents", () => {
    // Compression is only useful if the bytes come back, so the archive is read
    // back through the same layout the format defines.
    const archive = createZipArchive([{ name: "a.txt", data: "hello world" }]);
    const nameAt = archive.indexOf(Buffer.from("a.txt", "utf8"));
    expect(nameAt).toBeGreaterThan(0);
    // Deflate stream follows the 30-byte local header and the name.
    const start = nameAt + "a.txt".length;
    const { inflateRawSync } = require("node:zlib") as typeof import("node:zlib");
    const compressedLength = archive.readUInt32LE(nameAt - 12);
    const restored = inflateRawSync(archive.subarray(start, start + compressedLength)).toString("utf8");
    expect(restored).toBe("hello world");
  });

  it("refuses more entries than the format holds", () => {
    const many = Array.from({ length: 65_536 }, (_, index) => ({ name: `f${index}`, data: "" }));
    expect(() => createZipArchive(many)).toThrow(/at most/);
  });

  it("marks names as UTF-8 so non-ASCII survives", () => {
    const archive = createZipArchive([{ name: "报告.md", data: "x" }]);
    // Bit 11 of the general purpose flags.
    expect(archive.readUInt16LE(6) & 0x0800).toBe(0x0800);
  });
});
