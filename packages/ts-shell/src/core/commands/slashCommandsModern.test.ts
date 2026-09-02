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

  it("/cost displays real-time session token consumption and accounting", async () => {
    const result = await runCostCommand([], { cwd: tempDir, sessionId: "sess_1" });
    expect(result.kind).toBe("local");
    expect(result.output).toContain("Session Live Token Usage & Cost Accounting");
    expect(result.output).toContain("Prompt (Input)");
    expect(result.output).toContain("Completion (Output)");
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

  it("/export saves session history as markdown and jsonl files", async () => {
    const mdResult = await runExportCommand(["markdown", "export.md"], { cwd: tempDir, sessionId: "sess_export" });
    expect(mdResult.kind).toBe("local");
    expect(mdResult.output).toContain("Session history successfully exported to: `export.md`");
    expect(await fs.readFile(path.join(tempDir, "export.md"), "utf8")).toContain("# Session Conversation Export");

    const jsonlResult = await runExportCommand(["jsonl", "export.jsonl"], { cwd: tempDir, sessionId: "sess_export" });
    expect(jsonlResult.kind).toBe("local");
    expect(jsonlResult.output).toContain("Session history successfully exported to: `export.jsonl`");
    expect(await fs.readFile(path.join(tempDir, "export.jsonl"), "utf8")).toContain("session-export");
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
