import { promises as fs } from "node:fs";
import os from "node:os";
import process from "node:process";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeRemoveDir } from "../test-utils/cleanup.js";
import { printCliDoctor } from "./cliDoctor.js";

describe("printCliDoctor", () => {
  let workspaceRoot = "";

  afterEach(async () => {
    vi.restoreAllMocks();
    if (workspaceRoot) {
      await safeRemoveDir(workspaceRoot);
    }
  });

  it("renders CLI doctor diagnostics without changing runtime truthfulness", async () => {
    workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "cheers-cli-doctor-"),
    );
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => {
      lines.push(String(line));
    });

    printCliDoctor(workspaceRoot, "/tmp/launch");

    expect(lines).toEqual(
      expect.arrayContaining([
        "Cheers CLI Doctor",
        `Launch directory: /tmp/launch`,
        `Target workspace: ${workspaceRoot}`,
        "Tip: run `npm run doctor` from the repo root for full environment diagnostics.",
      ]),
    );
    expect(lines.some((line) => line.startsWith("Execution path: "))).toBe(
      true,
    );
    expect(lines.some((line) => line.startsWith("Provider: "))).toBe(true);
    expect(lines.some((line) => line.startsWith("Max turns: "))).toBe(true);
  });

  it("reports a configuration that cannot serve requests", async () => {
    // Doctor used to read only the loader's own diagnostics, so a constraint
    // the runtime refuses to run on — the reason a start fails — never appeared
    // here. The one tool a blocked user can run reported nothing wrong.
    //
    // The value lives in the user file, not the project file: a project value
    // is ignored until that project is trusted, which is a different report and
    // would leave this case asserting nothing.
    const previous = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
    workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "cheers-cli-doctor-"),
    );
    await fs.mkdir(path.join(workspaceRoot, ".cheers"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, ".cheers", "config.json"),
      JSON.stringify({ retryBaseDelayMs: 60_000, retryMaxDelayMs: 1_000 }),
    );
    process.env.HOME = workspaceRoot;
    process.env.USERPROFILE = workspaceRoot;
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => {
      lines.push(String(line));
    });

    try {
      printCliDoctor(workspaceRoot, "/tmp/launch");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }

    expect(lines).toContain("Config usable for requests: no");
    expect(lines.some((line) =>
      line.includes("retryBaseDelayMs must not exceed retryMaxDelayMs"))).toBe(true);
  });

  it("says a valid configuration can serve requests", async () => {
    workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "cheers-cli-doctor-"),
    );
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => {
      lines.push(String(line));
    });

    printCliDoctor(workspaceRoot, "/tmp/launch");

    expect(lines).toContain("Config usable for requests: yes");
  });
});
