import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCrashCommand } from "./crashCommandRuntime.js";
import { runTimingsCommand } from "./timingsCommandRuntime.js";
import { crashLogPath, recordCrash } from "../../observability/crashLog.js";
import type { CommandContext } from "./types.js";

/**
 * The two commands that report what happened to earlier runs.
 *
 * Both read state the process writes elsewhere, so the tests point them at a
 * temporary home rather than the user's own: a crash file left by a previous run
 * would otherwise decide the result.
 */

const context = { cwd: process.cwd() } as CommandContext;
const tempHomes: string[] = [];
let previousHome: string | undefined;
let previousProfile: string | undefined;

beforeEach(() => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "report-command-"));
  tempHomes.push(home);
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
  for (const home of tempHomes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
});

describe("runCrashCommand", () => {
  it("reports an oversized crash source without claiming that no crashes occurred", async () => {
    const file = crashLogPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, " ".repeat(1024 * 1024 + 1));
    const result = await runCrashCommand([], context);
    expect(result.output).toContain("over-limit");
    expect(result.output).toContain("count is unknown");
    expect(result.output).not.toContain("No crashes recorded");
  });

  it("preserves partial inspection when malformed records are skipped", async () => {
    const file = crashLogPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify([null]));
    expect((await runCrashCommand([], context)).output).toContain("Inspection status: partial");
  });

  it("says so when nothing has crashed", async () => {
    const result = await runCrashCommand([], context);
    expect(result.output).toContain("No crashes recorded");
    // The reader is told the mechanism, not just the absence.
    expect(result.output).toContain("kept here");
  });

  it("hides the stacks by default and offers them", async () => {
    recordCrash({ kind: "uncaught-exception", error: new Error("boom"), cwd: "/work" });

    const result = await runCrashCommand([], context);
    expect(result.output).toContain("boom");
    expect(result.output).not.toContain("```");
    expect(result.output).toContain("Add `--stack`");
  });

  it("shows the stacks with an explicit valid flag", async () => {
    recordCrash({ kind: "uncaught-exception", error: new Error("boom"), cwd: "/work" });

    const result = await runCrashCommand(["--stack"], context);
    expect(result.output).toContain("```");
    expect(result.output).toContain("boom");
    // And the hint is gone, because the request was already answered.
    expect(result.output).not.toContain("Add `--stack`");
  });
});

describe("runTimingsCommand", () => {
  it("explains how to turn timing on rather than reporting a zero", async () => {
    const result = await runTimingsCommand([], context);
    expect(result.output).toContain("No timing recorded");
    expect(result.output).toContain("CHEERS_TIMING=1");
  });
});
