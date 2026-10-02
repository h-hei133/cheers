import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTaskToolDefinition } from "./taskTool.js";
import { defaultHookDispatcher } from "../hooks/hookDispatcher.js";
import type { WorktreeAllocation, WorktreeRelease } from "../workflow/gitWorktreeManager.js";
import { createSubagentRunner } from "../../turn/subagent.js";
import { createCoreToolRegistry } from "./registry.js";

const workspaceRoot = process.cwd();
const allocation: WorktreeAllocation = {
  worktreeId: "id", branch: "subagent/id", worktreePath: path.join(workspaceRoot, "child"),
  workingDirectory: path.join(workspaceRoot, "child"), workspaceRoot, isIsolated: true, headCommit: "0".repeat(40),
};
const args = { description: "inspect", prompt: "inspect files", isolation: "worktree" };
const answer = { text: "child answer", failed: false, allowedTools: [], steps: 1, agentMode: "build" as const };

function setup(release: WorktreeRelease = { outcome: "removed" }) {
  const manager = { allocateWorktree: vi.fn(async () => allocation), releaseWorktree: vi.fn(async () => release) };
  const runSubagent = vi.fn(async () => answer);
  return { manager, runSubagent, tool: createTaskToolDefinition(manager), context: { workspaceRoot, taskId: "outer", runSubagent } };
}

beforeEach(() => { vi.spyOn(defaultHookDispatcher, "dispatch").mockResolvedValue({ decision: "allow" }); });
afterEach(() => { vi.restoreAllMocks(); });

it("does not allocate or announce a child when no runner is available", async () => {
  const { manager, tool } = setup();
  const result = await tool.execute(args, { workspaceRoot, taskId: "outer" });
  expect(result.success).toBe(false);
  expect(manager.allocateWorktree).not.toHaveBeenCalled();
  expect(defaultHookDispatcher.dispatch).not.toHaveBeenCalled();
  expect(result.error).toContain("not established");
});

it("rejects invalid isolation before lifecycle effects", async () => {
  const { manager, runSubagent, tool, context } = setup();
  expect((await tool.execute({ ...args, isolation: "anything" }, context)).success).toBe(false);
  expect(manager.allocateWorktree).not.toHaveBeenCalled();
  expect(runSubagent).not.toHaveBeenCalled();
  expect(defaultHookDispatcher.dispatch).not.toHaveBeenCalled();
});

it("does not fall back to a shared directory when allocation fails", async () => {
  const { manager, runSubagent, tool, context } = setup();
  manager.allocateWorktree.mockRejectedValue(new Error("checkout failed"));
  const result = await tool.execute(args, context);
  expect(runSubagent).not.toHaveBeenCalled();
  expect(result.success).toBe(false);
  expect(result.error).toContain("checkout failed");
  expect(result.error).toContain("not established");
  expect(result.error).not.toContain("Git Worktree (");
  expect(defaultHookDispatcher.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ eventName: "SubagentStop" }));
});

it("refuses a manager's non-isolated fallback without releasing the parent", async () => {
  const { manager, runSubagent, tool, context } = setup();
  manager.allocateWorktree.mockResolvedValue({ ...allocation, isIsolated: false, worktreePath: workspaceRoot });
  const result = await tool.execute(args, context);
  expect(result.success).toBe(false);
  expect(runSubagent).not.toHaveBeenCalled();
  expect(manager.releaseWorktree).not.toHaveBeenCalled();
  expect(result.error).toContain("not established");
});

it("releases after a creation hook throws and still attempts the stop hook", async () => {
  const { manager, runSubagent, tool, context } = setup();
  vi.mocked(defaultHookDispatcher.dispatch).mockImplementation(async (event) => {
    if (event.eventName === "WorktreeCreate") throw new Error("creation hook failed");
    return { decision: "allow" };
  });
  const result = await tool.execute(args, context);
  expect(result.success).toBe(false);
  expect(runSubagent).not.toHaveBeenCalled();
  expect(manager.releaseWorktree).toHaveBeenCalledOnce();
  expect(vi.mocked(defaultHookDispatcher.dispatch).mock.calls.map(([event]) => event.eventName))
    .toEqual(["SubagentStart", "WorktreeCreate", "WorktreeRemove", "SubagentStop"]);
});

it("preserves the child failure and partial answer when cleanup and stop hooks also fail", async () => {
  const { manager, runSubagent, tool, context } = setup();
  runSubagent.mockResolvedValue({ ...answer, failed: true, failure: "child failure" });
  manager.releaseWorktree.mockRejectedValue(new Error("cleanup failure"));
  vi.mocked(defaultHookDispatcher.dispatch).mockImplementation(async (event) => {
    if (event.eventName === "SubagentStop") throw new Error("stop failure");
    return { decision: "allow" };
  });
  const result = await tool.execute(args, context);
  expect(result.success).toBe(false);
  for (const text of ["child failure", "cleanup failure", "stop failure", "Partial response:", "child answer", allocation.worktreePath]) {
    expect(result.error).toContain(text);
  }
  expect(result.error).not.toContain("The subagent changed files");
  expect(vi.mocked(defaultHookDispatcher.dispatch).mock.calls.some(([event]) => event.eventName === "WorktreeRemove")).toBe(false);
});

it("does not skip the stop hook when the removal hook throws", async () => {
  const { tool, context } = setup();
  vi.mocked(defaultHookDispatcher.dispatch).mockImplementation(async (event) => {
    if (event.eventName === "WorktreeRemove") throw new Error("remove hook failure");
    return { decision: "allow" };
  });
  const result = await tool.execute(args, context);
  expect(result.success).toBe(false);
  expect(result.error).toContain("WorktreeRemove hook failed");
  expect(result.error).toContain("child answer");
  expect(defaultHookDispatcher.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ eventName: "SubagentStop" }));
});

it("announces verified directory removal while retaining branch cleanup failure", async () => {
  const { tool, context } = setup({ outcome: "unverified", worktreePath: allocation.worktreePath, branch: allocation.branch,
    worktreeStatus: "removed", branchStatus: "present", reason: "branch deletion refused" });
  const result = await tool.execute(args, context);
  expect(result.success).toBe(false);
  expect(result.error).toContain("Worktree: removed; branch: present");
  expect(defaultHookDispatcher.dispatch).toHaveBeenCalledWith(expect.objectContaining({ eventName: "WorktreeRemove" }));
});

it("cleans up an allocated worktree after cancellation without launching the child", async () => {
  const { manager, runSubagent, tool, context } = setup();
  const controller = new AbortController();
  manager.allocateWorktree.mockImplementation(async () => { controller.abort(); return allocation; });
  const result = await tool.execute(args, { ...context, abortSignal: controller.signal });
  expect(result.success).toBe(false);
  expect(runSubagent).not.toHaveBeenCalled();
  expect(manager.releaseWorktree.mock.calls[0]).toHaveLength(1);
  expect(result.error).toContain("cancelled before the subagent started");
});

it("allocates from the task workspace and leaves actual child writes outside the parent checkout", async () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".task-worktree-"));
  const git = (...argv: string[]) => execFileSync("git", argv, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  try {
    git("init", "-q"); git("config", "user.email", "test@example.test"); git("config", "user.name", "Test");
    fs.writeFileSync(path.join(root, "tracked.txt"), "parent contents");
    git("add", "tracked.txt"); git("commit", "-qm", "initial");
    const head = git("rev-parse", "HEAD");
    let count = 0;
    let child = "";
    const run = createSubagentRunner({ defaultMaxSteps: 2, step: async () => ++count === 1 ? {
      text: "write", toolCalls: [{ id: "write", name: "write", args: { path: "tracked.txt", content: "child contents" } }], stopReason: "stop",
    } : { text: "done", toolCalls: [], stopReason: "stop" } }, createCoreToolRegistry(), {
      workspaceRoot: root, sessionId: "worktree", agentMode: "build", permissionScope: "allow-all", hooks: defaultHookDispatcher, emit: () => {},
    });
    const result = await createTaskToolDefinition().execute(args, { workspaceRoot: root, taskId: "worktree", runSubagent: async (input) => {
      expect(input.workspace.startsWith(path.join(root, ".git", "agent-worktrees") + path.sep)).toBe(true);
      child = input.workspace;
      return run(input);
    } });
    expect(result.success).toBe(true);
    expect(result.output).toContain("Worktree Retained");
    expect(fs.readFileSync(path.join(child, "tracked.txt"), "utf8")).toBe("child contents");
    expect(fs.readFileSync(path.join(root, "tracked.txt"), "utf8")).toBe("parent contents");
    expect(git("rev-parse", "HEAD")).toBe(head);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
