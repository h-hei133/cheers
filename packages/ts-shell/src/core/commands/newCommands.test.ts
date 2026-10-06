import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runToolsCommand } from "./toolsCommandRuntime.js";
import { runCommitCommand } from "./commitCommandRuntime.js";
import { runThinkingCommand } from "./thinkingCommandRuntime.js";
import { SessionManager } from "../../session/SessionManager.js";
import { readSessionModel } from "../../session/model/state.js";
import { getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from "../../config/runtimeConfig.js";

describe("/tools", () => {
  it("uses the supplied pool for details and preserves case-sensitive MCP names", async () => {
    const tool = { name: "mcp__notes__Read", description: "Read a note.", argsSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      mcpAnnotations: { readOnlyHint: true }, execute: async () => ({ success: true }) };
    const context = { cwd: process.cwd(), getToolPool: async () => new Map([[tool.name, tool]]) };
    const detail = await runToolsCommand([tool.name], context);
    expect(detail.output).toContain("### mcp__notes__Read");
    expect(detail.output).toContain("| id | string | yes |");
    expect(detail.output).toContain("Plan mode: allowed");
    expect((await runToolsCommand(["write"], context)).output).toContain("No tool named");
  });
  it("lists the registry rather than a hand-kept list of names", async () => {
    const result = await runToolsCommand([], { cwd: process.cwd() });

    expect(result.output).toMatch(/### Tools \(\d+\)/);
    for (const name of ["bash", "read", "write", "edit", "glob", "grep"]) {
      expect(result.output).toContain(`| ${name} |`);
    }
  });

  it("says which tools plan mode blocks, per tool rather than in prose", async () => {
    const result = await runToolsCommand([], { cwd: process.cwd() });
    const row = (name: string) => result.output.split("\n").find((line) => line.startsWith(`| ${name} |`)) ?? "";

    expect(row("write")).toContain("blocked");
    expect(row("read")).toContain("allowed");
    expect(row("bash")).toContain("read-only");
  });

  it("shows one tool's arguments and which are required", async () => {
    const result = await runToolsCommand(["bash"], { cwd: process.cwd() });

    expect(result.output).toContain("### bash");
    expect(result.output).toContain("| command | string | yes |");
  });

  it("does not cut a description at an abbreviation's full stop", async () => {
    const result = await runToolsCommand([], { cwd: process.cwd() });

    expect(result.output).not.toMatch(/\(e\.g\. \|/);
  });

  it("says so when asked about a tool that does not exist", async () => {
    const result = await runToolsCommand(["invented"], { cwd: process.cwd() });

    expect(result.output).toContain("No tool named `invented`");
  });
});

describe("/commit", () => {
  let repo: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "commit-cmd-"));
    execFileSync("git", ["init", "-q", "."], { cwd: repo });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("reports a clean tree instead of asking for a message", async () => {
    const result = await runCommitCommand([], { cwd: repo });

    expect(result.kind).toBe("local");
    if (result.kind === "local") expect(result.output).toContain("the tree is clean");
  });

  it("refuses to guess which files belong in the commit", async () => {
    fs.writeFileSync(path.join(repo, "a.txt"), "one\n", "utf8");
    const result = await runCommitCommand([], { cwd: repo });

    expect(result.kind).toBe("local");
    if (result.kind === "local") {
      expect(result.output).toContain("Nothing is staged");
      expect(result.output).toContain("a.txt");
    }
  });

  it("puts the staged diff in the prompt so the message describes the change", async () => {
    fs.writeFileSync(path.join(repo, "a.txt"), "hello world\n", "utf8");
    execFileSync("git", ["add", "a.txt"], { cwd: repo });
    const result = await runCommitCommand([], { cwd: repo });

    expect(result.kind).toBe("prompt");
    if (result.kind === "prompt") {
      expect(result.prompt).toContain("hello world");
      expect(result.prompt).toContain("```diff");
      expect(result.prompt).toMatch(/git log --oneline/);
      expect(result.prompt).toMatch(/do not amend/i);
      expect(result.prompt).toMatch(/Do not push/i);
    }
  });

  it("says what it read instead of printing the whole diff into the transcript", async () => {
    fs.writeFileSync(path.join(repo, "a.txt"), "x\n", "utf8");
    execFileSync("git", ["add", "a.txt"], { cwd: repo });
    const result = await runCommitCommand([], { cwd: repo });

    expect(result.kind).toBe("prompt");
    if (result.kind === "prompt") {
      expect(result.notice).toContain("Read the staged diff");
      // The prompt carries the diff; the notice must not, or the transcript shows
      // the whole change above the answer that was asked for.
      expect(result.notice).not.toContain("+x");
    }
  });

  it("carries what the user said about the commit into the prompt", async () => {
    fs.writeFileSync(path.join(repo, "a.txt"), "x\n", "utf8");
    execFileSync("git", ["add", "a.txt"], { cwd: repo });
    const result = await runCommitCommand(["this", "closes", "the", "leak"], { cwd: repo });

    if (result.kind === "prompt") expect(result.prompt).toContain("this closes the leak");
  });

  it("says it is not a repository rather than failing obscurely", async () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), "not-a-repo-"));
    const result = await runCommitCommand([], { cwd: bare });

    expect(result.kind).toBe("local");
    if (result.kind === "local") expect(result.output).toContain("Not a git repository");
    fs.rmSync(bare, { recursive: true, force: true });
  });
});

describe("/thinking", () => {
  let home: string;
  let workspace: string;
  let realHome: string | undefined;
  let realProfile: string | undefined;
  let manager: SessionManager;
  let context: { cwd: string; projectRoot: string; sessionId: string };
  let originalConfig: Buffer;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "thinking-home-"));
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "thinking-work-"));
    realHome = process.env.HOME;
    realProfile = process.env.USERPROFILE;
    process.env.HOME = home;
    delete process.env.USERPROFILE;
    fs.mkdirSync(path.join(workspace, ".agents"));
    writeUserRuntimeConfigFile({ provider: "openai", activeProviderConnectionId: "fixture", providerConnections: [{
      id: "fixture", provider: "openai", authType: "api-key", apiKey: "synthetic-key", model: "fixture-model",
      createdAt: "2026-01-01", updatedAt: "2026-01-01", status: "connected",
    }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    originalConfig = fs.readFileSync(getUserRuntimeConfigPath());
    manager = new SessionManager();
    context = { cwd: workspace, projectRoot: workspace, sessionId: manager.createNew(workspace).id };
  });

  afterEach(() => {
    if (realHome === undefined) delete process.env.HOME;
    else process.env.HOME = realHome;
    if (realProfile !== undefined) process.env.USERPROFILE = realProfile;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("keeps the level in the resumed session without changing another session or global defaults", async () => {
    expect((await runThinkingCommand(["high"], context)).output).toContain("saved for resume");
    manager.persistUserPromptBarrier(context.sessionId, "resume fixture");
    manager.saveInterrupted(context.sessionId);
    expect(new SessionManager().tryResume(context.sessionId)).toMatchObject({ ok: true });
    expect(readSessionModel(context.sessionId)?.thinkingEffort).toBe("high");
    expect((await runThinkingCommand([], context)).output).toContain("Thinking effort: high.");
    const other = manager.createNew(workspace);
    expect(readSessionModel(other.id)).toBeUndefined();
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(originalConfig);
  });

  it("reports what it asks for without claiming a token budget", async () => {
    expect((await runThinkingCommand(["low"], context)).output).toContain("Reasoning effort: low");
    const shown = await runThinkingCommand([], context);

    expect(shown.output).toContain("Thinking effort: low.");
    expect(shown.output).toContain("Explicit effort is preserved if the provider rejects it");
    expect(shown.output).not.toMatch(/budget of \d/);
  });

  it("goes back to letting the provider decide", async () => {
    await runThinkingCommand(["medium"], context);
    expect((await runThinkingCommand(["off"], context)).output).toContain("provider decides");
    expect(readSessionModel(context.sessionId)?.thinkingEffort).toBeNull();
    expect((await runThinkingCommand([], context)).output).toContain("Thinking effort: auto (provider decides).");
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(originalConfig);
  });

  it("refuses a level it does not have", async () => {
    const result = await runThinkingCommand(["maximum"], context);

    expect(result.output).toContain("Invalid /thinking arguments: Unknown action.");
    expect(result.output).toContain("/thinking low");
    expect(readSessionModel(context.sessionId)).toBeUndefined();
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(originalConfig);
  });
});
