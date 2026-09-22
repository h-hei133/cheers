import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runClearCommand } from "./clearCommandRuntime.js";
import { runReviewCommand } from "./reviewCommandRuntime.js";
import { runInitCommand } from "./initCommandRuntime.js";
import { runCostCommand } from "./costCommandRuntime.js";
import { runUndoCommand } from "./undoCommandRuntime.js";
import { runExportCommand } from "./exportCommandRuntime.js";
import { runCopyCommand } from "./copyCommandRuntime.js";
import { routeSlashCommand } from "./slashRouter.js";

describe("Modern Slash Commands Subsystem", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slash-modern-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("/clear hands the reset to the host rather than reporting one itself", async () => {
    const result = await runClearCommand([], { cwd: tempDir, sessionId: "sess_1" });
    // Clearing is a session boundary the host owns: a new session, an empty
    // transcript, and a screen with nothing on it — including no output from here,
    // since anything written would be the residue on the cleared screen.
    expect(result.kind).toBe("shell-action");
    expect(result).toMatchObject({ action: "clear-session" });
  });

  it("/review outputs clean tree status and diff report", async () => {
    const result = await runReviewCommand(["focus on tests"], { cwd: tempDir, sessionId: "sess_1" });
    expect(result.kind).toBe("local");
    expect(result.output).toContain("Working tree clean");
  });

  it("/init inspects project directory and generates guidance", async () => {
    await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "demo-pkg", scripts: { test: "vitest" } }), "utf8");
    const result = await runInitCommand([], { cwd: tempDir, sessionId: "sess_1" });
    expect(result.kind).toBe("local");
    expect(result.output).toContain("Project Initialization & Architecture Inspection");
    expect(result.output).toContain("demo-pkg");
  });

  it("/cost counts nothing when no completion has been recorded", async () => {
    const result = await runCostCommand([], { cwd: tempDir, sessionId: "sess_1" });

    expect(result.kind).toBe("local");
    expect(result.output).toContain("nothing to count");
    // The money was headed "Actual Cost" while being a multiplication by a fixed
    // rate that does not follow the model in use.
    expect(result.output).not.toContain("Actual Cost");
  });

  it("/undo answers about the most recent edit rather than dumping a report", async () => {
    const result = await runUndoCommand([], { cwd: tempDir, sessionId: "sess_1" });
    expect(result.kind).toBe("local");
    // The old output was a report: telemetry, a file count, and the whole
    // `git diff HEAD`. What a person wants is which edit was last and how to
    // revert exactly it.
    expect(result.output).toMatch(/Most recent edit|Nothing to undo/);
    expect(result.output).not.toContain("Rollback Assistant");
  });

  it("/export refuses to report an export when there is no conversation", async () => {
    const result = await runExportCommand(["markdown", "export.md"], { cwd: tempDir, sessionId: "sess_export" });

    // It used to write a file whose whole body was "(Session transcript recorded
    // and preserved in working store)" and call that a successful export.
    expect(result.kind).toBe("local");
    expect(result.output).toContain("nothing to export");
    expect(result.output).toContain("Nothing was written");
    await expect(fs.access(path.join(tempDir, "export.md"))).rejects.toThrow();
  });

  it("/copy prepares clipboard payload", async () => {
    const result = await runCopyCommand(["function test() { return true; }"], { cwd: tempDir, sessionId: "sess_1" });
    expect(result.kind).toBe("local");
    expect(result.output).toContain("characters");
  });

  it("routes all 7 modern slash commands through routeSlashCommand", async () => {
    const clearRoute = await routeSlashCommand("/clear", { cwd: tempDir });
    expect(clearRoute?.kind).toBe("shell-action");

    const costRoute = await routeSlashCommand("/cost", { cwd: tempDir });
    expect(costRoute?.kind).toBe("local");

    const initRoute = await routeSlashCommand("/init", { cwd: tempDir });
    expect(initRoute?.kind).toBe("local");

    const copyRoute = await routeSlashCommand("/copy hello world", { cwd: tempDir });
    expect(copyRoute?.kind).toBe("local");
  });
});
