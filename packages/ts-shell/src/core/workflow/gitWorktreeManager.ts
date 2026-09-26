import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface WorktreeAllocation {
  readonly worktreeId: string;
  readonly branch: string;
  readonly worktreePath: string;
  readonly workspaceRoot: string;
  readonly isIsolated: boolean;
  /**
   * The commit the worktree was made at.
   *
   * Recorded here because it is the only thing a later comparison can be
   * against: asking git what changed since "wherever this branch started"
   * after the branch exists gives the whole history when there is no remote
   * to exclude, which reads as "everything changed".
   */
  readonly headCommit?: string;
}

/**
 * Worktrees for parallel subagents.
 *
 * Each allocation is a real `git worktree` on its own branch, so two agents
 * editing at once cannot collide in the index. A release does not merge: work
 * that changed is kept and reported, work that did not is removed. Merging here
 * would put a subagent's edits into the working tree with nobody having read
 * them, and the caller is the one that knows whether that is wanted.
 */
/**
 * What happened to a worktree when it was released.
 *
 * The caller has to know whether work was kept, because a kept worktree is a
 * directory and a branch that outlive the call: its path is the only way to
 * find the changes, and leaving it unreported leaves it unreachable.
 */
export type WorktreeRelease =
  | { readonly outcome: "removed" }
  | { readonly outcome: "kept"; readonly worktreePath: string; readonly branch: string };

export class GitWorktreeManager {
  private readonly workspaceRoot: string;
  private readonly isGitRepo: boolean;
  private readonly activeAllocations = new Map<string, WorktreeAllocation>();

  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.isGitRepo = this.checkGitRepo();
  }

  private checkGitRepo(): boolean {
    try {
      execSync("git rev-parse --is-inside-work-tree", {
        cwd: this.workspaceRoot,
        stdio: "ignore",
      });
      return true;
    } catch {
      return false;
    }
  }

  async allocateWorktree(subtaskId: string): Promise<WorktreeAllocation> {
    if (!this.isGitRepo) {
      // Fallback to ephemeral temp directory if outside git repository
      const tempPath = path.join(
        os.tmpdir(),
        `agent-worktree-${subtaskId}-${Date.now()}`,
      );
      fs.mkdirSync(tempPath, { recursive: true });
      const allocation: WorktreeAllocation = {
        worktreeId: subtaskId,
        branch: "ephemeral",
        worktreePath: tempPath,
        workspaceRoot: this.workspaceRoot,
        isIsolated: true,
      };
      this.activeAllocations.set(subtaskId, allocation);
      return allocation;
    }

    const branch = `subagent/${subtaskId}`;
    const worktreesDir = path.join(this.workspaceRoot, ".git", "agent-worktrees");
    const worktreePath = path.join(worktreesDir, subtaskId);

    try {
      if (!fs.existsSync(worktreesDir)) {
        fs.mkdirSync(worktreesDir, { recursive: true });
      }

      execSync(`git worktree add -b "${branch}" "${worktreePath}"`, {
        cwd: this.workspaceRoot,
        stdio: "ignore",
      });

      const allocation: WorktreeAllocation = {
        worktreeId: subtaskId,
        branch,
        worktreePath,
        workspaceRoot: this.workspaceRoot,
        isIsolated: true,
        ...(this.headCommit() ? { headCommit: this.headCommit() } : {}),
      };

      this.activeAllocations.set(subtaskId, allocation);
      return allocation;
    } catch {
      // Fallback to workspaceRoot on worktree creation error
      const allocation: WorktreeAllocation = {
        worktreeId: subtaskId,
        branch: "main",
        worktreePath: this.workspaceRoot,
        workspaceRoot: this.workspaceRoot,
        isIsolated: false,
      };
      return allocation;
    }
  }

  /**
   * Release a worktree, keeping it when it holds changes.
   *
   * Nothing is merged. A subagent's edits reach the working tree only when the
   * caller puts them there, because the alternative is putting them there
   * unread — and a merge that conflicts does so silently, leaving the caller
   * believing work arrived when it did not.
   *
   * A worktree with no changes is removed along with its branch: it is an
   * allocation nobody used, and keeping it would leave the repository growing a
   * directory per call. One with changes is kept, and its path and branch are
   * returned so the caller can say where they are.
   */
  async releaseWorktree(subtaskId: string): Promise<WorktreeRelease> {
    const allocation = this.activeAllocations.get(subtaskId);
    if (!allocation) return { outcome: "removed" };

    if (!allocation.isIsolated || allocation.worktreePath === this.workspaceRoot) {
      this.activeAllocations.delete(subtaskId);
      return { outcome: "removed" };
    }

    try {
      if (this.hasChanges(allocation)) {
        this.activeAllocations.delete(subtaskId);
        return { outcome: "kept", worktreePath: allocation.worktreePath, branch: allocation.branch };
      }

      this.removeWorktree(allocation);
      this.activeAllocations.delete(subtaskId);
      return { outcome: "removed" };
    } catch {
      // Best-effort cleanup. A release that failed to remove leaves the worktree
      // where it is, which is the safe side of the two: the work is still there.
      this.activeAllocations.delete(subtaskId);
      return { outcome: "kept", worktreePath: allocation.worktreePath, branch: allocation.branch };
    }
  }

  /**
   * Whether anything in the worktree differs from the commit it was made at.
   *
   * Uncommitted edits first, then commits made on the branch. Both are needed:
   * an agent that edits and stops leaves the first, one that commits leaves the
   * second, and a check for either alone would call the other empty.
   *
   * A directory that is not a repository has no history to compare against, so
   * anything it holds counts: without that, the ephemeral fallback would be
   * deleted on the strength of a check that could not look.
   */
  private hasChanges(allocation: WorktreeAllocation): boolean {
    if (!this.isGitRepo || allocation.headCommit === undefined) return true;
    try {
      const status = execSync("git status --porcelain", {
        cwd: allocation.worktreePath,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (status.trim().length > 0) return true;
      const ahead = execSync(
        `git rev-list --count "${allocation.headCommit}..HEAD"`,
        { cwd: allocation.worktreePath, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      return Number(ahead.trim()) > 0;
    } catch {
      // A worktree that cannot be inspected is treated as holding work. Removing
      // one on the strength of a failed lookup would discard edits, and being
      // told a directory was kept is cheaper than losing what was in it.
      return true;
    }
  }

  /** The commit the repository is at, or nothing when it cannot be read. */
  private headCommit(): string | undefined {
    try {
      return execSync("git rev-parse HEAD", {
        cwd: this.workspaceRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return undefined;
    }
  }

  /** Remove a worktree and its branch, for an allocation that holds nothing. */
  private removeWorktree(allocation: WorktreeAllocation): void {
    try {
      execSync(`git worktree remove --force "${allocation.worktreePath}"`, {
        cwd: this.workspaceRoot,
        stdio: "ignore",
      });
      execSync(`git branch -D "${allocation.branch}"`, {
        cwd: this.workspaceRoot,
        stdio: "ignore",
      });
    } catch {
      // Best-effort: a worktree that will not go is reported by git itself.
    }
  }

  getActiveAllocations(): readonly WorktreeAllocation[] {
    return Array.from(this.activeAllocations.values());
  }
}
