import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCrashCommand } from "./crashCommandRuntime.js";
import { runTimingsCommand } from "./timingsCommandRuntime.js";
import { recordCrash } from "../../observability/crashLog.js";
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

  it("shows the stacks when the flag is present, wherever it appears", async () => {
    // The flag was read positionally, so `/crash --stack extra` printed no
    // stacks while also suppressing the hint that says how to get them: the
    // reader got neither the trace nor the way to ask for it.
    recordCrash({ kind: "uncaught-exception", error: new Error("boom"), cwd: "/work" });

    const result = await runCrashCommand(["extra", "--stack"], context);
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
