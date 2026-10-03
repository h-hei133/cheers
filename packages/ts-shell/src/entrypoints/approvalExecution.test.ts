import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HookDispatcher } from "../core/hooks/hookDispatcher.js";
import { ApprovalTrustPolicy } from "../core/shell/approvalTrustPolicy.js";
import { createCoreToolRegistry } from "../core/tools/registry.js";
import { StreamingRenderer } from "../presentation/terminal/streaming.js";
import { createToolHooks, type ToolGateOptions } from "../turn/tools.js";
import { createCliEscalationPromptHandler } from "./cliApprovalModule.js";

let root: string;
let workspaceRoot: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "approval-execution-"));
  workspaceRoot = path.join(root, "workspace");
  await fs.mkdir(workspaceRoot);
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

class QuietRenderer extends StreamingRenderer {
  override renderLine(): void {}
}

function setup(interactive: ReturnType<typeof vi.fn>, agentMode: "plan" | "build" = "build",
  overrides: Pick<ToolGateOptions, "permissionScope" | "denyRules"> = {}) {
  const handler = createCliEscalationPromptHandler(new QuietRenderer(), null, () => "compact",
    new ApprovalTrustPolicy(path.join(root, "policy.json")), () => workspaceRoot,
    undefined, undefined, undefined, () => "ask", interactive);
  const hooks = createToolHooks({ sessionId: "approval-execution", workspaceRoot, agentMode,
    permissionScope: "ask", escalationPromptHandler: handler,
    hooks: { dispatch: async () => ({ decision: "allow" }) } as unknown as HookDispatcher, emit() {}, ...overrides,
  });
  const registry = createCoreToolRegistry();
  return async (id: string, name: string, args: Record<string, unknown>) => {
    const decision = await hooks.beforeToolCall!({ assistantMessage: { role: "assistant", content: "" },
      call: { id, name, args }, args });
    if (decision?.block) return "blocked";
    const result = await registry.get(name)!.execute(args, { taskId: id, workspaceRoot, sessionId: "approval-execution" });
    expect(result.success, result.error).toBe(true);
    return "executed";
  };
}

it.each(["ask", "accept-edits", "allow-all"] as const)("preserves refusal rules for padded commands and file paths in %s", async permissionScope => {
  const interactive = vi.fn().mockResolvedValue("allow-always");
  const run = setup(interactive, "build", { permissionScope, denyRules: [
    { tool: "bash", pattern: "touch " }, { tool: "bash", pattern: "danger-helper" },
    { tool: "write", pattern: "protected/" }, { tool: "edit", pattern: "protected/" },
  ] });
  expect(await run("command", "bash", { command: " touch denied-marker " })).toBe("blocked");
  expect(await run("relative-command", "bash", { command: " ./danger-helper " })).toBe("blocked");
  for (const name of ["write", "edit"]) {
    for (const target of ["./protected/file ", "protected/other/../file ", "./protected/my file"]) {
      expect(await run(`${name}-${target}`, name, { path: target, content: "denied" })).toBe("blocked");
    }
  }
  expect(interactive).not.toHaveBeenCalled();
  expect(await fs.readdir(workspaceRoot)).toEqual([]);
});

it.each(["write", "edit"])("requires a new answer for byte-distinct %s paths", async name => {
  const interactive = vi.fn().mockResolvedValueOnce("allow-always").mockResolvedValue("deny");
  const run = setup(interactive);
  if (name === "edit") await fs.writeFile(path.join(workspaceRoot, "File.txt"), "original");
  expect(await run("first", name, { path: "File.txt", content: "approved" })).toBe("executed");
  for (const [index, target] of ["File.txt ", "file.txt", " File.txt"].entries()) {
    expect(await run(`next-${index}`, name, { path: target, content: "denied" })).toBe("blocked");
    expect(interactive.mock.calls[index + 1]![0].context.target).toBe(target);
  }
  expect(interactive).toHaveBeenCalledTimes(4);
  expect(await fs.readFile(path.join(workspaceRoot, "File.txt"), "utf8")).toBe("approved");
  const files = (await fs.readdir(workspaceRoot, { withFileTypes: true })).filter(entry => entry.isFile());
  expect(files.map(entry => entry.name)).toEqual(["File.txt"]);
});

it.skipIf(process.platform === "win32")("requires approval before a configured Git helper can write", async () => {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: workspaceRoot, stdio: "pipe",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(root, "absent-config") } });
  git("init", "-q");
  await fs.writeFile(path.join(workspaceRoot, "tracked.txt"), "before\n");
  git("add", "tracked.txt");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture");
  await fs.writeFile(path.join(workspaceRoot, "tracked.txt"), "after\n");
  const helper = path.join(root, "helper");
  await fs.writeFile(helper, '#!/bin/sh\nprintf touched > "$PWD/helper-marker"\n', { mode: 0o700 });
  git("config", "diff.external", helper);
  const interactive = vi.fn().mockResolvedValueOnce("deny").mockResolvedValueOnce("allow-once");
  const plan = setup(interactive, "plan");
  expect(await plan("plan", "bash", { command: "git diff" })).toBe("blocked");
  expect(interactive).not.toHaveBeenCalled();
  const run = setup(interactive);
  expect(await run("denied", "bash", { command: "git diff" })).toBe("blocked");
  await expect(fs.stat(path.join(workspaceRoot, "helper-marker"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await run("approved", "bash", { command: "git diff" })).toBe("executed");
  expect(await fs.readFile(path.join(workspaceRoot, "helper-marker"), "utf8")).toBe("touched");
  expect(interactive).toHaveBeenCalledTimes(2);
});
