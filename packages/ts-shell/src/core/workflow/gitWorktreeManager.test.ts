import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitWorktreeManager } from "./gitWorktreeManager.js";

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

  it("releases an id it does not know without failing", async () => {
    const manager = new GitWorktreeManager(root);

    await expect(manager.releaseWorktree("never-allocated")).resolves.toEqual({ outcome: "removed" });
  });

  it("forgets the allocation it released, so a second release is a no-op", async () => {
    const manager = new GitWorktreeManager(root);
    await manager.allocateWorktree("once");
    await manager.releaseWorktree("once");

    expect(manager.getActiveAllocations()).toHaveLength(0);
    await expect(manager.releaseWorktree("once")).resolves.toEqual({ outcome: "removed" });
  });
});
