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
}

/**
 * GitWorktreeManager
 * Manages isolated physical worktrees (`git worktree add -b <branch> <path>`) for parallel subagents.
 * Prevents file mutation collisions and git index lock contention.
 * Automatically cleans up worktree directories and branches upon task completion.
 */
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

  async releaseWorktree(subtaskId: string, options?: { readonly squashMerge?: boolean }): Promise<void> {
    const allocation = this.activeAllocations.get(subtaskId);
    if (!allocation) return;

    if (!allocation.isIsolated || allocation.worktreePath === this.workspaceRoot) {
      this.activeAllocations.delete(subtaskId);
      return;
    }

    try {
      if (this.isGitRepo) {
        if (options?.squashMerge && allocation.branch.startsWith("subagent/")) {
          try {
            execSync(`git merge --squash "${allocation.branch}"`, {
              cwd: this.workspaceRoot,
              stdio: "ignore",
            });
          } catch {
            // Conflict or clean merge skip
          }
        }

        execSync(`git worktree remove --force "${allocation.worktreePath}"`, {
          cwd: this.workspaceRoot,
          stdio: "ignore",
        });

        execSync(`git branch -D "${allocation.branch}"`, {
          cwd: this.workspaceRoot,
          stdio: "ignore",
        });
      } else {
        if (fs.existsSync(allocation.worktreePath)) {
          fs.rmSync(allocation.worktreePath, { recursive: true, force: true });
        }
      }
    } catch {
      // Best-effort cleanup
    } finally {
      this.activeAllocations.delete(subtaskId);
    }
  }

  getActiveAllocations(): readonly WorktreeAllocation[] {
    return Array.from(this.activeAllocations.values());
  }
}
