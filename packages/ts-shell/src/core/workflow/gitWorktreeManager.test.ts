import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitWorktreeManager } from "./gitWorktreeManager.js";
import { createDefaultExecutionService } from "../../runtime/execution/service.js";

/**
 * What happens to a subagent's worktree when it is released.
 *
 * The decision this pins is the one that used to go the other way: a release
 * merged the branch into the working tree and then deleted both. That put a
 * subagent's edits where nobody had read them, and a conflicting merge failed
 * silently, so the caller was told nothing about work that had not arrived.
 */

let root: string;

function git(command: string, cwd: string): string {
  return execSync(command, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worktree-release-"));
  git("git init -q", root);
  git("git config user.email test@example.test", root);
  git("git config user.name Test", root);
  fs.writeFileSync(path.join(root, "tracked.txt"), "original\n");
  git("git add -A", root);
  git("git commit -qm initial", root);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("releasing a worktree", () => {
  it("removes one that was never used", async () => {
    // An allocation nothing wrote to is a directory nobody needs, and keeping
    // it would leave the repository growing one per call.
    const manager = new GitWorktreeManager(root);
    const allocation = await manager.allocateWorktree("untouched");

    const release = await manager.releaseWorktree("untouched");

    expect(release.outcome).toBe("removed");
    expect(fs.existsSync(allocation.worktreePath)).toBe(false);
  });

  it("keeps one holding uncommitted edits, and does not put them in the working tree", async () => {
    // The property that matters: the edits survive and the main tree does not
    // silently acquire them. A caller has to be told where they are, because
    // the path is the only way back to them.
    const manager = new GitWorktreeManager(root);
    const allocation = await manager.allocateWorktree("edited");
    fs.writeFileSync(path.join(allocation.worktreePath, "tracked.txt"), "edited in the worktree\n");

    const release = await manager.releaseWorktree("edited");

    expect(release.outcome).toBe("kept");
    expect(release.outcome === "kept" && release.worktreePath).toBe(allocation.worktreePath);
    expect(fs.existsSync(allocation.worktreePath)).toBe(true);
    expect(fs.readFileSync(path.join(root, "tracked.txt"), "utf8")).toBe("original\n");
  });

  it("keeps one holding a commit", async () => {
    // An agent that commits and stops leaves nothing uncommitted, so a check for
    // working-tree changes alone would call this empty and delete the work.
    const manager = new GitWorktreeManager(root);
    const allocation = await manager.allocateWorktree("committed");
    fs.writeFileSync(path.join(allocation.worktreePath, "added.txt"), "new file\n");
    git("git add -A", allocation.worktreePath);
    git("git commit -qm add-file", allocation.worktreePath);

    const release = await manager.releaseWorktree("committed");

    expect(release.outcome).toBe("kept");
    expect(fs.existsSync(path.join(allocation.worktreePath, "added.txt"))).toBe(true);
  });

  it("reports the branch a kept worktree is on", async () => {
    // The branch is how the work is found after the directory is gone, so it has
    // to be named rather than left for the caller to guess from the id.
    const manager = new GitWorktreeManager(root);
    const allocation = await manager.allocateWorktree("branched");
    fs.writeFileSync(path.join(allocation.worktreePath, "tracked.txt"), "changed\n");

    const release = await manager.releaseWorktree("branched");

    expect(release.outcome === "kept" && release.branch).toBe(allocation.branch);
    expect(git("git branch --list 'subagent/*'", root)).toContain(allocation.branch);
  });

  it("does not claim removal for an allocation it does not know", async () => {
    const manager = new GitWorktreeManager(root);

    await expect(manager.releaseWorktree("never-allocated")).resolves.toMatchObject({
      outcome: "unverified", worktreeStatus: "unknown", branchStatus: "unknown",
    });
  });

  it("forgets the allocation it released, so a second release is a no-op", async () => {
    const manager = new GitWorktreeManager(root);
    await manager.allocateWorktree("once");
    await manager.releaseWorktree("once");

    expect(manager.getActiveAllocations()).toHaveLength(0);
    await expect(manager.releaseWorktree("once")).resolves.toEqual({ outcome: "removed" });
  });
});

describe("allocating a worktree", () => {
  it("rejects a redirected container before creating a checkout or branch", async () => {
    const outside = path.join(root, "outside");
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(root, ".git", "agent-worktrees"), "dir");
    const manager = new GitWorktreeManager(root);
    await expect(manager.allocateWorktree("redirected-container")).rejects.toThrow(/container is redirected/);
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(git("git branch --list subagent/redirected-container", root).trim()).toBe("");
    expect(manager.getActiveAllocations()).toEqual([]);
  });

  it.each(["non-git", "unborn", "bare"])("refuses %s without inventing an isolated workspace", async (kind) => {
    fs.rmSync(path.join(root, ".git"), { recursive: true, force: true });
    if (kind === "unborn") git("git init -q", root);
    if (kind === "bare") git("git init --bare -q", root);
    const manager = new GitWorktreeManager(root);
    await expect(manager.allocateWorktree("refused")).rejects.toThrow();
    expect(manager.getActiveAllocations()).toEqual([]);
  });

  it("supports a linked worktree whose .git is a file", async () => {
    const linked = path.join(root, "linked");
    git(`git worktree add -qb linked '${linked}'`, root);
    expect(fs.statSync(path.join(linked, ".git")).isFile()).toBe(true);
    const manager = new GitWorktreeManager(linked);
    const allocation = await manager.allocateWorktree("from-linked");
    expect(allocation.workspaceRoot).toBe(linked);
    expect(fs.readFileSync(path.join(allocation.workingDirectory, "tracked.txt"), "utf8")).toBe("original\n");
    expect((await manager.releaseWorktree("from-linked")).outcome).toBe("removed");
  });

  it("keeps the selected subdirectory as the child's workspace", async () => {
    fs.mkdirSync(path.join(root, "nested"));
    fs.writeFileSync(path.join(root, "nested", "inside.txt"), "inside");
    git("git add -A", root);
    git("git commit -qm nested", root);
    const manager = new GitWorktreeManager(path.join(root, "nested"));
    const allocation = await manager.allocateWorktree("subdirectory");
    expect(allocation.workingDirectory).toBe(path.join(allocation.worktreePath, "nested"));
    expect(fs.readFileSync(path.join(allocation.workingDirectory, "inside.txt"), "utf8")).toBe("inside");
    expect((await manager.releaseWorktree("subdirectory")).outcome).toBe("removed");
  });

  it("does not overwrite a colliding branch or directory", async () => {
    const existing = path.join(root, ".git", "agent-worktrees", "collision");
    fs.mkdirSync(existing, { recursive: true });
    fs.writeFileSync(path.join(existing, "sentinel"), "keep");
    git("git branch subagent/collision", root);
    await expect(new GitWorktreeManager(root).allocateWorktree("collision")).rejects.toThrow(/could not be confirmed/);
    expect(fs.readFileSync(path.join(existing, "sentinel"), "utf8")).toBe("keep");
    expect(git("git branch --list subagent/collision", root)).toContain("subagent/collision");
  });

  it("rejects a child workspace redirected outside its new checkout", async () => {
    fs.mkdirSync(path.join(root, "nested"));
    fs.writeFileSync(path.join(root, "nested", "inside.txt"), "keep parent");
    git("git add -A", root);
    git("git commit -qm nested", root);
    const execution = createDefaultExecutionService();
    const manager = new GitWorktreeManager(path.join(root, "nested"), { runCommand: async (request) => {
      const result = await execution.runCommand(request);
      if (request.args[0] === "worktree" && request.args[1] === "add") {
        const nested = path.join(request.args[4], "nested");
        fs.rmSync(nested, { recursive: true, force: true });
        fs.symlinkSync(path.join(root, "nested"), nested, "dir");
      }
      return result;
    } });
    await expect(manager.allocateWorktree("redirected")).rejects.toThrow(/escapes its worktree/);
    expect(manager.getActiveAllocations()).toEqual([]);
    expect(fs.readFileSync(path.join(root, "nested", "inside.txt"), "utf8")).toBe("keep parent");
  });

  it("reports possibly created resources when creation fails after Git ran", async () => {
    const execution = createDefaultExecutionService();
    const manager = new GitWorktreeManager(root, { runCommand: async (request) => {
      const result = await execution.runCommand(request);
      if (request.args[0] === "worktree" && request.args[1] === "add") throw new Error("lost creation result");
      return result;
    } });
    await expect(manager.allocateWorktree("partial")).rejects.toThrow(/Inspect .*partial.*subagent\/partial/);
    expect(fs.existsSync(path.join(root, ".git", "agent-worktrees", "partial"))).toBe(true);
    expect(manager.getActiveAllocations()).toEqual([]);
  });

  it("rejects an already cancelled allocation without executing Git", async () => {
    let calls = 0;
    const execution = createDefaultExecutionService();
    const manager = new GitWorktreeManager(root, { runCommand: async (request) => { calls++; return execution.runCommand(request); } });
    const controller = new AbortController();
    controller.abort();
    await expect(manager.allocateWorktree("cancelled", controller.signal)).rejects.toThrow(/cancelled/);
    expect(calls).toBe(0);
  });
});

describe("release evidence", () => {
  it("shares cleanup and its final evidence across concurrent releases", async () => {
    const execution = createDefaultExecutionService();
    let removals = 0;
    const manager = new GitWorktreeManager(root, { runCommand: async (request) => {
      if (request.args[0] === "worktree" && request.args[1] === "remove") removals++;
      return execution.runCommand(request);
    } });
    const allocation = await manager.allocateWorktree("concurrent");
    const results = await Promise.all([manager.releaseWorktree("concurrent"), manager.releaseWorktree("concurrent")]);
    expect(results).toEqual([{ outcome: "removed" }, { outcome: "removed" }]);
    expect(await manager.releaseWorktree("concurrent")).toEqual(results[0]);
    expect(removals).toBe(1);
    expect(fs.existsSync(allocation.worktreePath)).toBe(false);
  });

  it("keeps ignored output and repeats the same retained-work evidence", async () => {
    fs.writeFileSync(path.join(root, ".gitignore"), "generated.txt\n");
    git("git add .gitignore", root);
    git("git commit -qm ignore", root);
    const manager = new GitWorktreeManager(root);
    const allocation = await manager.allocateWorktree("ignored");
    fs.writeFileSync(path.join(allocation.worktreePath, "generated.txt"), "valuable output");
    const result = await manager.releaseWorktree("ignored");
    expect(result.outcome).toBe("kept");
    expect(await manager.releaseWorktree("ignored")).toEqual(result);
    expect(fs.readFileSync(path.join(allocation.worktreePath, "generated.txt"), "utf8")).toBe("valuable output");
  });

  it("keeps an ancestor reset even with no working tree diff or ahead commits", async () => {
    fs.writeFileSync(path.join(root, "tracked.txt"), "second commit\n");
    git("git add tracked.txt", root);
    git("git commit -qm second", root);
    const manager = new GitWorktreeManager(root);
    const allocation = await manager.allocateWorktree("reset");
    git("git reset --hard HEAD~", allocation.worktreePath);
    expect((await manager.releaseWorktree("reset")).outcome).toBe("kept");
    expect(fs.readFileSync(path.join(root, "tracked.txt"), "utf8")).toBe("second commit\n");
  });

  it("reports the actual checkout when a child switches branches", async () => {
    const manager = new GitWorktreeManager(root);
    const allocation = await manager.allocateWorktree("switch");
    git("git checkout -qb changed", allocation.worktreePath);
    expect(await manager.releaseWorktree("switch")).toMatchObject({ outcome: "kept", currentBranch: "changed" });
    expect(fs.existsSync(allocation.worktreePath)).toBe(true);
  });

  it("leaves a locked worktree and reports cleanup as unverified", async () => {
    const manager = new GitWorktreeManager(root);
    const allocation = await manager.allocateWorktree("locked");
    git(`git worktree lock '${allocation.worktreePath}'`, root);
    const result = await manager.releaseWorktree("locked");
    expect(result).toMatchObject({ outcome: "unverified", worktreeStatus: "present", branchStatus: "present" });
    expect(await manager.releaseWorktree("locked")).toEqual(result);
    expect(fs.existsSync(allocation.worktreePath)).toBe(true);
  });

  it("reports directory removal and a retained branch as partial cleanup", async () => {
    const execution = createDefaultExecutionService();
    const manager = new GitWorktreeManager(root, { runCommand: async (request) => {
      if (request.args[0] === "branch" && request.args[1] === "-d") throw new Error("branch deletion failed");
      return execution.runCommand(request);
    } });
    const allocation = await manager.allocateWorktree("partial-cleanup");
    expect(await manager.releaseWorktree("partial-cleanup")).toMatchObject({
      outcome: "unverified", worktreeStatus: "removed", branchStatus: "present", reason: "branch deletion failed",
    });
    expect(fs.existsSync(allocation.worktreePath)).toBe(false);
    expect(git("git branch --list subagent/partial-cleanup", root)).toContain("subagent/partial-cleanup");
  });

  it("does not remove a worktree whose contents cannot be inspected", async () => {
    const execution = createDefaultExecutionService();
    let removals = 0;
    const manager = new GitWorktreeManager(root, { runCommand: async (request) => {
      if (request.args[0] === "status") throw new Error("inspection unavailable");
      if (request.args[0] === "worktree" && request.args[1] === "remove") removals++;
      return execution.runCommand(request);
    } });
    const allocation = await manager.allocateWorktree("unreadable");
    expect(await manager.releaseWorktree("unreadable")).toMatchObject({ outcome: "unverified", worktreeStatus: "present" });
    expect(removals).toBe(0);
    expect(fs.existsSync(allocation.worktreePath)).toBe(true);
  });
});
