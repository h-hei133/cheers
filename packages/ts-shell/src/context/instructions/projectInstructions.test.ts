import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadInstructionFiles } from "./projectInstructions.js";

/** A temporary tree with the given files written relative to its root. */
async function makeTree(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "instructions-"));
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(dir, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  }
  return dir;
}

describe("instruction file discovery", () => {
  it("collects instruction files from every ancestor down to the working directory", async () => {
    const root = await makeTree({
      ".git/HEAD": "ref: refs/heads/main\n",
      "AGENTS.md": "root rules",
      "packages/AGENTS.md": "package rules",
      "packages/app/AGENTS.md": "app rules",
    });

    const loaded = loadInstructionFiles({
      cwd: path.join(root, "packages", "app"),
      homeDir: path.join(root, "no-home"),
    });

    expect(loaded.files.map((file) => file.content)).toEqual([
      "root rules",
      "package rules",
      "app rules",
    ]);
  });

  it("stops walking at the project root rather than the filesystem root", async () => {
    const outer = await makeTree({
      "AGENTS.md": "outside the project",
      "project/.git/HEAD": "ref: refs/heads/main\n",
      "project/AGENTS.md": "inside the project",
    });

    const loaded = loadInstructionFiles({
      cwd: path.join(outer, "project"),
      homeDir: path.join(outer, "no-home"),
    });

    expect(loaded.files.map((file) => file.content)).toEqual(["inside the project"]);
  });

  it("uses only the working directory when there is no project root marker", async () => {
    const outer = await makeTree({
      "AGENTS.md": "above the project",
      "loose/AGENTS.md": "the loose directory",
    });

    const loaded = loadInstructionFiles({
      cwd: path.join(outer, "loose"),
      homeDir: path.join(outer, "no-home"),
    });

    expect(loaded.files.map((file) => file.content)).toEqual(["the loose directory"]);
  });

  it("takes the first candidate present in a directory, in priority order", async () => {
    const root = await makeTree({
      ".git/HEAD": "ref: refs/heads/main\n",
      "AGENTS.md": "the ordinary file",
      "AGENTS.override.md": "the override",
    });

    const loaded = loadInstructionFiles({ cwd: root, homeDir: path.join(root, "no-home") });

    expect(loaded.files.map((file) => file.content)).toEqual(["the override"]);
  });

  it("keeps looking when a candidate is a directory rather than a file", async () => {
    // A directory named `AGENTS.md` is not instructions, but the user may well
    // have written a lower-priority file too.
    const root = await makeTree({
      ".git/HEAD": "ref: refs/heads/main\n",
      "AGENTS.md/placeholder.txt": "not instructions",
      "CLAUDE.md": "the real instructions",
    });

    const loaded = loadInstructionFiles({ cwd: root, homeDir: path.join(root, "no-home") });

    expect(loaded.files.map((file) => file.content)).toEqual(["the real instructions"]);
  });

  it("puts the user-level file before the project ones", async () => {
    const root = await makeTree({
      ".git/HEAD": "ref: refs/heads/main\n",
      "AGENTS.md": "project rules",
      "home/.private-agents/AGENTS.md": "user rules",
    });

    const loaded = loadInstructionFiles({
      cwd: root,
      homeDir: path.join(root, "home"),
    });

    expect(loaded.files.map((file) => file.content)).toEqual(["user rules", "project rules"]);
  });

  it("strips a byte order mark so it never reaches the prompt", async () => {
    const root = await makeTree({
      ".git/HEAD": "ref: refs/heads/main\n",
      "AGENTS.md": "\uFEFFrules without a mark",
    });

    const loaded = loadInstructionFiles({ cwd: root, homeDir: path.join(root, "no-home") });

    expect(loaded.files[0]?.content).toBe("rules without a mark");
  });

  it("holds the total to the byte budget and reports the truncation", async () => {
    const big = "x".repeat(40 * 1024);
    const root = await makeTree({
      ".git/HEAD": "ref: refs/heads/main\n",
      "AGENTS.md": big,
    });

    const loaded = loadInstructionFiles({ cwd: root, homeDir: path.join(root, "no-home") });

    const total = loaded.files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0);
    expect(total).toBeLessThanOrEqual(32 * 1024);
    expect(loaded.truncated).toBe(true);
  });

  it("spends the budget across files rather than allowing one each", async () => {
    const root = await makeTree({
      ".git/HEAD": "ref: refs/heads/main\n",
      "AGENTS.md": "a".repeat(20 * 1024),
      "nested/AGENTS.md": "b".repeat(20 * 1024),
    });

    const loaded = loadInstructionFiles({
      cwd: path.join(root, "nested"),
      homeDir: path.join(root, "no-home"),
    });

    const total = loaded.files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0);
    expect(total).toBeLessThanOrEqual(32 * 1024);
  });

  it("loads nothing when the budget is set to zero", async () => {
    const root = await makeTree({
      ".git/HEAD": "ref: refs/heads/main\n",
      "AGENTS.md": "rules",
    });

    const loaded = loadInstructionFiles({
      cwd: root,
      homeDir: path.join(root, "no-home"),
      maxBytes: 0,
    });

    expect(loaded.files).toEqual([]);
  });

  it("skips an unreadable file and keeps the readable ones", async () => {
    const root = await makeTree({
      ".git/HEAD": "ref: refs/heads/main\n",
      "AGENTS.md": "root rules",
      "nested/AGENTS.md": "nested rules",
    });
    // A directory where the file is expected: readable by name, not by content.
    await fs.rm(path.join(root, "nested", "AGENTS.md"));
    await fs.mkdir(path.join(root, "nested", "AGENTS.md", "inner"), { recursive: true });

    const loaded = loadInstructionFiles({
      cwd: path.join(root, "nested"),
      homeDir: path.join(root, "no-home"),
    });

    expect(loaded.files.map((file) => file.content)).toContain("root rules");
  });
});
