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

  it("/clear resets conversation state cleanly", async () => {
    const result = await runClearCommand([], { cwd: tempDir, sessionId: "sess_1" });
    expect(result.kind).toBe("local");
    expect(result.output).toContain("Session conversation cleared");
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

  it("/cost displays session token consumption breakdown", async () => {
    const result = await runCostCommand([], { cwd: tempDir, sessionId: "sess_1" });
    expect(result.kind).toBe("local");
    expect(result.output).toContain("Session Token Usage & Cost Estimation");
    expect(result.output).toContain("64,000 Tokens");
  });

  it("/undo provides rollback and git revert guidance", async () => {
    const result = await runUndoCommand([], { cwd: tempDir, sessionId: "sess_1" });
    expect(result.kind).toBe("local");
    expect(result.output).toContain("Action Undo & Revert Guidance");
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
    expect(clearRoute?.kind).toBe("local");

    const costRoute = await routeSlashCommand("/cost", { cwd: tempDir });
    expect(costRoute?.kind).toBe("local");

    const initRoute = await routeSlashCommand("/init", { cwd: tempDir });
    expect(initRoute?.kind).toBe("local");

    const copyRoute = await routeSlashCommand("/copy hello world", { cwd: tempDir });
    expect(copyRoute?.kind).toBe("local");
  });
});
