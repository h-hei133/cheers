export interface WorktreeAllocation {
  readonly worktreeId: string;
  readonly branch: string;
  readonly worktreePath: string;
  readonly workspaceRoot: string;
  /** The selected workspace's corresponding directory inside the checkout. */
  readonly workingDirectory: string;
  readonly isIsolated: boolean;
  readonly headCommit: string;
}

export type WorktreeRelease =
  | { readonly outcome: "removed" }
  | { readonly outcome: "kept"; readonly worktreePath: string; readonly branch: string; readonly currentBranch: string; readonly reason: string }
  | { readonly outcome: "unverified"; readonly worktreePath?: string; readonly branch?: string; readonly reason: string;
      readonly worktreeStatus: "present" | "removed" | "unknown"; readonly branchStatus: "present" | "removed" | "unknown" };

export interface TaskWorktree {
  allocateWorktree(taskId: string, signal?: AbortSignal): Promise<WorktreeAllocation>;
  releaseWorktree(taskId: string): Promise<WorktreeRelease>;
}

export type TaskWorktreeFactory = (workspaceRoot: string) => TaskWorktree | Promise<TaskWorktree>;
