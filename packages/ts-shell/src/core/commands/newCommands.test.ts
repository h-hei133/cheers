import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runToolsCommand } from "./toolsCommandRuntime.js";
import { runCommitCommand } from "./commitCommandRuntime.js";
import { runThinkingCommand, getThinkingEffort } from "./thinkingCommandRuntime.js";

describe("/tools", () => {
  it("lists the registry rather than a hand-kept list of names", async () => {
    const result = await runToolsCommand([], { cwd: process.cwd() });

    expect(result.output).toMatch(/### Tools \(\d+\)/);
    for (const name of ["bash", "read", "write", "edit", "glob", "grep"]) {
      expect(result.output).toContain(`\`${name}\``);
    }
  });

  it("says which tools plan mode blocks, per tool rather than in prose", async () => {
    const result = await runToolsCommand([], { cwd: process.cwd() });
    const row = (name: string) => result.output.split("\n").find((line) => line.startsWith(`| \`${name}\``)) ?? "";

    expect(row("write")).toContain("blocked");
    expect(row("read")).toContain("allowed");
    expect(row("bash")).toContain("read-only");
  });

  it("shows one tool's arguments and which are required", async () => {
    const result = await runToolsCommand(["bash"], { cwd: process.cwd() });

    expect(result.output).toContain("### `bash`");
    expect(result.output).toContain("| `command` | string | yes |");
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

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "thinking-home-"));
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "thinking-work-"));
    realHome = process.env.HOME;
    realProfile = process.env.USERPROFILE;
    process.env.HOME = home;
    delete process.env.USERPROFILE;
  });

  afterEach(() => {
    if (realHome === undefined) delete process.env.HOME;
    else process.env.HOME = realHome;
    if (realProfile !== undefined) process.env.USERPROFILE = realProfile;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("keeps the level across a restart, since it belongs to the work", async () => {
    await runThinkingCommand(["high"], { cwd: workspace });

    expect(getThinkingEffort(workspace)).toBe("high");
  });

  it("reports what it asks for without claiming a token budget", async () => {
    await runThinkingCommand(["low"], { cwd: workspace });
    const shown = await runThinkingCommand([], { cwd: workspace });

    expect(shown.output).toContain("`low` reasoning effort");
    expect(shown.output).toContain("Providers that do not implement the field ignore it");
    expect(shown.output).not.toMatch(/budget of \d/);
  });

  it("goes back to letting the provider decide", async () => {
    await runThinkingCommand(["medium"], { cwd: workspace });
    await runThinkingCommand(["off"], { cwd: workspace });

    expect(getThinkingEffort(workspace)).toBeUndefined();
  });

  it("refuses a level it does not have", async () => {
    const result = await runThinkingCommand(["maximum"], { cwd: workspace });

    expect(result.output).toContain("`maximum` is not a level");
    expect(getThinkingEffort(workspace)).toBeUndefined();
  });
});
