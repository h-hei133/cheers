import { afterEach, beforeEach, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runReviewCommand } from "./reviewCommandRuntime.js";
import { gitCommandContext } from "../../test-utils/git.js";
import { routeSlashCommand } from "./slashRouter.js";

let root: string;
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "review-test-"));
  git("init", "--quiet");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

it("reviews staged changes in a repository without a first commit", async () => {
  await fs.writeFile(path.join(root, "new.txt"), "staged evidence\n");
  git("add", "new.txt");
  const result = await runReviewCommand(["focus on data loss"], gitCommandContext(root));
  if (result.kind !== "prompt") throw new Error("Expected review prompt");
  expect(result.prompt).toContain("+staged evidence");
  expect(result.prompt).toContain("User focus: focus on data loss");
  expect(result.notice).toContain("Starting model review");
  expect(result).not.toHaveProperty("output");
});

it("preserves quoted and multiline review focus through the alias router", async () => {
  await fs.writeFile(path.join(root, "new.txt"), "untracked content");
  const focus = "  don't rewrite 'a  b' or C:\\tmp\\file\n\t--keep-this  ";
  const result = await routeSlashCommand("/audit " + focus, gitCommandContext(root));
  expect(result).toMatchObject({ kind: "prompt", prompt: expect.stringContaining("User focus: " + focus + "\n") });
  expect(git("status", "--short")).toBe("?? new.txt\n");
});

it("retains staged and unstaged changes even when they cancel in diff HEAD", async () => {
  const file = path.join(root, "tracked.txt");
  await fs.writeFile(file, "original\n");
  git("add", "."); git("commit", "-qm", "initial");
  await fs.writeFile(file, "staged change\n"); git("add", ".");
  await fs.writeFile(file, "original\n");
  expect(git("diff", "HEAD")).toBe("");
  const before = git("status", "--short");
  const result = await runReviewCommand([], gitCommandContext(root));
  if (result.kind !== "prompt") throw new Error("Expected review prompt");
  expect(result.prompt).toContain("+staged change");
  expect(result.prompt).toContain("-staged change");
  expect(result.prompt).toContain("Review only; do not edit, stage, commit, or push");
  expect(git("status", "--short")).toBe(before);
  expect(await fs.readFile(file, "utf8")).toBe("original\n");
});

it.each(["review", "audit", "check"])("routes /%s with untracked files into a prompt", async (name) => {
  await fs.writeFile(path.join(root, "new.txt"), "untracked content");
  const result = await routeSlashCommand(`/${name}`, gitCommandContext(root));
  if (result?.kind !== "prompt") throw new Error("Expected prompt");
  expect(result.prompt).toContain("?? new.txt");
  expect(result.prompt).toContain("Read untracked files");
  expect(result.prompt).toContain("contents are not included in Git diffs");
});

it("keeps Git failures distinct from a clean tree", async () => {
  const result = await runReviewCommand([], gitCommandContext(path.join(root, "missing")));
  expect(result).toMatchObject({ kind: "local", output: expect.stringContaining("Git unavailable or refused") });
  await fs.writeFile(path.join(root, "new.txt"), "new content\n"); git("add", ".");
  const blob = git("rev-parse", ":new.txt").trim();
  await fs.unlink(path.join(root, ".git", "objects", blob.slice(0, 2), blob.slice(2)));
  await fs.unlink(path.join(root, "new.txt"));
  expect(git("status", "--short")).toContain("new.txt");
  const failed = await runReviewCommand([], gitCommandContext(root));
  expect(failed).toMatchObject({ kind: "local", output: expect.stringContaining("Git unavailable or refused") });
});

it("marks clipped diff context incomplete and asks the model to retrieve it", async () => {
  await fs.writeFile(path.join(root, "large.txt"), "x".repeat(25000)); git("add", ".");
  const result = await runReviewCommand([], gitCommandContext(root));
  if (result.kind !== "prompt") throw new Error("Expected prompt");
  expect(result.prompt).toContain("Truncated at 24000 characters");
  expect(result.prompt).toContain("retrieve the remainder before reviewing");
  expect(result.prompt.length).toBeLessThan(28000);
});
