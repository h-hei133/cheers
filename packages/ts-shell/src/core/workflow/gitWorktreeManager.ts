import { promises as fs } from "node:fs";
import * as path from "node:path";
import { createDefaultExecutionService, type ExecutionService } from "../../runtime/execution/service.js";

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

/** Git checkouts for admitted tasks. Retains observed changes without merging them. */
export class GitWorktreeManager {
  private readonly workspaceRoot: string;
  private readonly activeAllocations = new Map<string, WorktreeAllocation>();
  private readonly releases = new Map<string, WorktreeRelease>();
  private readonly releasing = new Map<string, Promise<WorktreeRelease>>();
  private readonly allocating = new Set<string>();

  constructor(
    workspaceRoot: string = process.cwd(),
    private readonly execution: Pick<ExecutionService, "runCommand"> = createDefaultExecutionService(),
  ) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  /** Called only by a prepared session operation with an approved execution port. */
  async createCheckout(target: string, branch: string, head: string, signal?: AbortSignal): Promise<void> {
    await this.git(['worktree', 'add', '-b', branch, target, head], undefined, signal);
    if (await fs.realpath(target) !== target || await this.git(['rev-parse', 'HEAD'], target, signal) !== head
      || await this.git(['rev-parse', '--abbrev-ref', 'HEAD'], target, signal) !== branch) throw new Error('Created worktree identity could not be confirmed.');
  }

  /** Non-forced Git removal preserves dirty or otherwise occupied directories. */
  async removeCheckout(target: string, signal?: AbortSignal): Promise<void> {
    await this.git(['worktree', 'remove', target], undefined, signal);
    if (!await this.missing(target)) throw new Error('Worktree removal could not be confirmed.');
  }

  private async git(args: readonly string[], cwd = this.workspaceRoot, signal?: AbortSignal): Promise<string> {
    const operation = args.slice(0, 2).join(" ");
    const allowed = ["rev-parse --show-toplevel", "rev-parse --git-common-dir", "rev-parse HEAD", "rev-parse --abbrev-ref",
      "cat-file -t", "worktree add", "worktree remove", "worktree list", "branch -d", "branch --list", "status --porcelain"];
    if (!allowed.includes(operation)) throw new Error("Unsupported internal Git operation.");
    if (signal?.aborted) throw new Error("Worktree allocation was cancelled.");
    const result = await this.execution.runCommand({
      operationKind: "command.run", command: "git", args, cwd, workspaceRoot: this.workspaceRoot,
      // The task gate admits delegation. These fixed Git operations do not
      // grant the child approval for arbitrary file writes or shell commands.
      authority: { mode: "command-allowlisted", source: "tool-runtime-approval", reason: "Git worktree lifecycle for an admitted task." },
      caller: "subagent-worktree", reason: "Manage a delegated workspace", reportSafeCommand: `git ${operation}`,
      timeoutMs: 60_000, ...(signal ? { abortSignal: signal } : {}),
    });
    if (result.status !== "completed" || result.exitCode !== 0) {
      throw new Error(`Git ${operation} ${result.status}: ${result.stderr.trim() || "command did not complete successfully"}`);
    }
    return result.stdout.trim();
  }

  async allocateWorktree(subtaskId: string, signal?: AbortSignal): Promise<WorktreeAllocation> {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(subtaskId)) throw new Error("Invalid worktree task identifier.");
    if (this.allocating.has(subtaskId) || this.activeAllocations.has(subtaskId) || this.releases.has(subtaskId)) {
      throw new Error("A worktree already belongs to this task identifier.");
    }
    this.allocating.add(subtaskId);
    try {
      // Git determines its metadata location; linked worktrees have a .git file.
      const repository = await this.git(["rev-parse", "--show-toplevel"], undefined, signal);
      const selected = await fs.realpath(this.workspaceRoot);
      const relative = path.relative(repository, selected);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error("Selected workspace is outside the Git checkout.");
      }
      const headCommit = await this.git(["rev-parse", "HEAD"], undefined, signal);
      if (relative && await this.git(["cat-file", "-t", `${headCommit}:${relative.split(path.sep).join("/")}`], undefined, signal) !== "tree") {
        throw new Error("Selected workspace is not a directory in the current commit.");
      }
      const commonDir = await fs.realpath(path.resolve(this.workspaceRoot, await this.git(["rev-parse", "--git-common-dir"], undefined, signal)));
      const worktreesDir = path.join(commonDir, "agent-worktrees");
      const worktreePath = path.join(worktreesDir, subtaskId);
      const branch = `subagent/${subtaskId}`;
      await fs.mkdir(worktreesDir, { recursive: true });
      if (!(await fs.lstat(worktreesDir)).isDirectory() || await fs.realpath(worktreesDir) !== worktreesDir) {
        throw new Error("Worktree container is redirected; creation was not attempted.");
      }
      try {
        await this.git(["worktree", "add", "-b", branch, worktreePath, headCommit], undefined, signal);
        const workingDirectory = await fs.realpath(path.join(worktreePath, relative));
        const allocation: WorktreeAllocation = {
          worktreeId: subtaskId, branch, worktreePath, workspaceRoot: this.workspaceRoot,
          workingDirectory, isIsolated: true, headCommit,
        };
        await this.verifyAllocation(allocation, commonDir, signal);
        this.activeAllocations.set(subtaskId, allocation);
        return allocation;
      } catch (error) {
        // Failed or cancelled creation may have left resources. Report their
        // location without deleting a possible pre-existing collision.
        throw new Error(`Worktree creation could not be confirmed: ${error instanceof Error ? error.message : String(error)}. Inspect ${worktreePath} and branch ${branch} for possible remnants.`);
      }
    } finally {
      this.allocating.delete(subtaskId);
    }
  }

  private async verifyAllocation(allocation: WorktreeAllocation, commonDir: string, signal?: AbortSignal): Promise<void> {
    const root = await fs.realpath(allocation.worktreePath);
    if (root !== allocation.worktreePath) throw new Error("Created worktree root is redirected.");
    const relative = path.relative(root, allocation.workingDirectory);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("Delegated workspace escapes its worktree.");
    }
    const top = await this.git(["rev-parse", "--show-toplevel"], root, signal);
    const common = await this.git(["rev-parse", "--git-common-dir"], root, signal);
    const head = await this.git(["rev-parse", "HEAD"], root, signal);
    const branch = await this.git(["rev-parse", "--abbrev-ref", "HEAD"], root, signal);
    if (await fs.realpath(top) !== root || await fs.realpath(path.resolve(root, common)) !== commonDir
      || head !== allocation.headCommit || branch !== allocation.branch) {
      throw new Error("Created worktree identity does not match its allocation.");
    }
  }

  /** Call after writers settle; filesystem inspection and Git cleanup are not atomic. */
  async releaseWorktree(subtaskId: string): Promise<WorktreeRelease> {
    const earlier = this.releases.get(subtaskId);
    if (earlier) return earlier;
    const pending = this.releasing.get(subtaskId);
    if (pending) return pending;
    const allocation = this.activeAllocations.get(subtaskId);
    if (!allocation) return { outcome: "unverified", reason: "No owned worktree allocation is known for this task.",
      worktreeStatus: "unknown", branchStatus: "unknown" };
    const release = this.releaseAllocation(allocation).then((result) => {
      this.releases.set(subtaskId, result);
      this.activeAllocations.delete(subtaskId);
      return result;
    });
    this.releasing.set(subtaskId, release);
    try { return await release; }
    finally { this.releasing.delete(subtaskId); }
  }

  private async releaseAllocation(allocation: WorktreeAllocation): Promise<WorktreeRelease> {
    let worktreeStatus: "present" | "removed" | "unknown" = "unknown";
    let branchStatus: "present" | "removed" | "unknown" = "unknown";
    try {
      if (!await this.missing(allocation.worktreePath)) worktreeStatus = "present";
      if (await this.git(["branch", "--list", allocation.branch])) branchStatus = "present";
      const root = await fs.realpath(allocation.worktreePath);
      const common = await this.git(["rev-parse", "--git-common-dir"], allocation.worktreePath);
      const expectedCommon = path.dirname(path.dirname(allocation.worktreePath));
      if (root !== allocation.worktreePath || await fs.realpath(path.resolve(root, common)) !== expectedCommon) {
        throw new Error("Owned worktree identity changed; cleanup was not attempted.");
      }
      const currentBranch = await this.git(["rev-parse", "--abbrev-ref", "HEAD"], allocation.worktreePath);
      const head = await this.git(["rev-parse", "HEAD"], allocation.worktreePath);
      const status = await this.git(["status", "--porcelain", "--untracked-files=normal", "--ignored=matching"], allocation.worktreePath);
      if (status || head !== allocation.headCommit || currentBranch !== allocation.branch) {
        return { outcome: "kept", worktreePath: allocation.worktreePath, branch: allocation.branch, currentBranch,
          reason: status ? "The checkout contains file changes." : "The checkout's commit or branch changed." };
      }
      // Release assumes writers have settled. Non-forced Git removal is an
      // additional check, not an atomic guard against concurrent writers (in
      // particular, ignored output created after status can still be removed).
      await this.git(["worktree", "remove", allocation.worktreePath]);
      const registered = (await this.git(["worktree", "list", "--porcelain", "-z"])).split("\0");
      if (!await this.missing(allocation.worktreePath) || registered.includes(`worktree ${allocation.worktreePath}`)) {
        throw new Error("Git worktree removal could not be verified.");
      }
      worktreeStatus = "removed";
      // Safe deletion refuses a branch that acquired unmerged work meanwhile.
      await this.git(["branch", "-d", allocation.branch]);
      if (await this.git(["branch", "--list", allocation.branch])) throw new Error("Git branch removal could not be verified.");
      branchStatus = "removed";
      return { outcome: "removed" };
    } catch (error) {
      // Re-observe after a failed command; the earlier observations may already
      // be stale, especially when only part of cleanup completed.
      worktreeStatus = await this.observeWorktree(allocation.worktreePath).catch(() => "unknown" as const);
      branchStatus = await this.git(["branch", "--list", allocation.branch])
        .then((value) => value ? "present" as const : "removed" as const, () => "unknown" as const);
      return { outcome: "unverified", worktreePath: allocation.worktreePath, branch: allocation.branch,
        worktreeStatus, branchStatus, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  private async observeWorktree(worktreePath: string): Promise<"present" | "removed" | "unknown"> {
    const missing = await this.missing(worktreePath);
    const registered = (await this.git(["worktree", "list", "--porcelain", "-z"])).split("\0").includes(`worktree ${worktreePath}`);
    if (missing && !registered) return "removed";
    return !missing && registered ? "present" : "unknown";
  }

  private async missing(target: string): Promise<boolean> {
    try { await fs.lstat(target); return false; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return true; throw error; }
  }

  getActiveAllocations(): readonly WorktreeAllocation[] {
    return [...this.activeAllocations.values()];
  }
}
