import { promises as fs } from "node:fs";
import os from "node:os";
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
      path.join(os.tmpdir(), "private-agents-cli-doctor-"),
    );
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => {
      lines.push(String(line));
    });

    printCliDoctor(workspaceRoot, "/tmp/launch");

    expect(lines).toEqual(
      expect.arrayContaining([
        "Cheer CLI Doctor",
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
});
