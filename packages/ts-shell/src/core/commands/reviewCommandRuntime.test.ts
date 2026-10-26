import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { runReviewCommand } from "./reviewCommandRuntime.js";
import { gitCommandFor } from "../../cli/runtime/git.js";
import { gitCommandContext, stubGitEnvironment, gitFixture } from "../../test-utils/git.js";
import { routeSlashCommand } from "./slashRouter.js";

let root: string;
let fixture: ReturnType<typeof gitFixture>;
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
beforeEach(() => {
  fixture = gitFixture(true); root = fixture.root;
  stubGitEnvironment(fixture.home);
});
afterEach(() => { vi.unstubAllEnvs(); fixture.cleanup(); });

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

it("forwards a bare review without an empty focus argument", async () => {
  const gitCommand = vi.fn(async () => ({ kind: "local" as const, output: "reviewed" }));
  const result = await runReviewCommand([], { ...gitCommandContext(root), gitCommand });
  expect(gitCommand).toHaveBeenCalledWith(["review"], expect.anything());
  expect(result).toEqual({ kind: "local", output: "reviewed" });
});

it("restores the exact standalone slash source when native Git preparation fails", async () => {
  const gitCommand = vi.fn(async () => ({ kind: "local" as const, output: "Git unavailable or refused: review preparation changed" }));
  const result = await routeSlashCommand("/audit focus", { ...gitCommandContext(root), gitCommand });
  expect(result).toMatchObject({ kind: "local", retryDraft: "/audit focus" });
});

it("restores the exact malformed standalone review source", async () => {
  const result = await routeSlashCommand("/audit   ", gitCommandContext(root));
  expect(result).toMatchObject({ kind: "local", retryDraft: "/audit   " });
});

it("restores the draft when the interactive Git command has no bound workbench", async () => {
  const result = await routeSlashCommand("/audit focus", {
    ...gitCommandContext(root), gitCommand: gitCommandFor({} as never),
  });
  expect(result).toMatchObject({ kind: "local", retryDraft: "/audit focus" });
});

it("carries composed prose, modifiers and skill instructions into the one native review request", async () => {
  const gitCommand = vi.fn(async () => ({ kind: "prompt" as const, prompt: "prepared review",
    promptMetadata: { source: "git-review" } }));
  const input = "检查证据 /brainstorm /review /skill:review-b";
  const result = await runReviewCommand([], {
    ...gitCommandContext(root),
    gitCommand,
    composedPrompt: {
      originalInput: input,
      prose: "检查证据",
      skills: [{ name: "review-b", identity: "cli:/fixture/SKILL.md:review-b", source: "cli",
        digest: "fixture-digest", body: "Check counterexamples and report uncertainty." }],
      modifiers: [{ name: "brainstorm", instruction: "Design exploration. Compare approaches." }],
    },
  });
  const forwarded = gitCommand.mock.calls[0]?.[0];
  expect(forwarded?.[0]).toBe("review");
  expect(forwarded?.[1]).toContain('<skill name="review-b">');
  expect(forwarded?.[1]).toContain("Check counterexamples and report uncertainty.");
  expect(forwarded?.[1]).toContain('<method name="brainstorm">');
  expect(forwarded?.[1]).toContain("Design exploration. Compare approaches.");
  expect(forwarded?.[1]).toContain("检查证据");
  expect(result).toMatchObject({ kind: "prompt", prompt: "prepared review", promptMetadata: { source: "git-review" } });
});

it("combines composed methods and skills with a real native Git review snapshot", async () => {
  await fs.writeFile(path.join(root, "new.txt"), "untracked review evidence\n");
  const skill = path.join(fixture.home, "review-method.md");
  await fs.writeFile(skill, "---\nname: review-method\ndescription: Review method\n---\nCheck counterexamples and uncertainty.");
  const input = "检查证据 /brainstorm /review /skill:review-method";
  const result = await routeSlashCommand(input, {
    ...gitCommandContext(root),
    skillOptions: { skillPaths: [skill], noSkills: true },
  });
  if (result?.kind !== "prompt") throw new Error("Expected composed review prompt");
  expect(result.prompt).toContain("Review only; do not edit, stage, commit, or push");
  expect(result.prompt).toContain("?? new.txt");
  expect(result.prompt).toContain("Check counterexamples and uncertainty.");
  expect(result.prompt).toContain("Design exploration.");
  expect(result.prompt).toContain("检查证据");
  expect(result.promptMetadata).toMatchObject({
    source: "git-review",
    originalInput: input,
    skills: [{ name: "review-method" }],
    methods: [{ name: "brainstorm" }, { name: "review" }],
  });
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
