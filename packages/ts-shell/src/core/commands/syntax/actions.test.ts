import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { routeSlashCommand } from "../slashRouter.js";
import { createCommandRegistry } from "../registry.js";
import { runWorkspaceShellAction, runCdShellAction, runMcpShellAction, runPermissionsShellAction, runViewShellAction } from "../shellActionRuntime.js";
import { runCliPermissionCommand } from "../../../entrypoints/cliPermissionModule.js";
import { ApprovalTrustPolicy } from "../../shell/approvalTrustPolicy.js";
import type { StreamingRenderer } from "../../../presentation/terminal/streaming.js";

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "shell-actions-")); vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it.each([
  "/workspace status extra", "/workspace recent extra", "/workspace unknown", "/workspace attach first second",
  "/cd first second", "/cd --unknown", "/mcp status extra", "/mcp reconnect server extra", "/mcp unknown",
  "/permissions list extra", "/permissions explain extra", "/permissions revoke", "/permissions revoke 1 extra",
  "/permissions reset arbitrary", "/permissions reset all extra", "/permissions unknown",
  "/view developer extra", "/view unknown",
])("rejects %s without generating a shell action", async command => {
  expect(await routeSlashCommand(command, { cwd: root })).toMatchObject({ kind: "local", output: expect.stringContaining("Invalid /") });
});

it("preserves quoted targets, real aliases and end-of-options paths", async () => {
  expect(await routeSlashCommand('/workspace use "folder with spaces"', { cwd: root })).toMatchObject({ workspaceAction: "attach", workspaceTarget: "folder with spaces" });
  expect(await runCdShellAction(["--", "-directory"], { cwd: root })).toMatchObject({ workspaceTarget: "-directory" });
  expect(await runWorkspaceShellAction(["projects"], { cwd: root })).toMatchObject({ workspaceAction: "recent" });
  expect(await runMcpShellAction(["diagnose", "my server"], { cwd: root })).toMatchObject({ mcpAction: "doctor", mcpTarget: "my server" });
  expect(await runPermissionsShellAction(["remove", "scope with spaces"], { cwd: root })).toMatchObject({ permissionAction: "revoke", permissionSelector: "scope with spaces" });
  expect(await runPermissionsShellAction(["clear", "ALL"], { cwd: root })).toMatchObject({ permissionAction: "reset", permissionSelector: "all" });
  expect(await runViewShellAction(["dev"], { cwd: root })).toMatchObject({ action: "set-view", viewMode: "verbose" });
});

it("validates the direct permission runner before touching persisted grants", () => {
  const file = path.join(root, "policy.json");
  const grant = { projectRoot: root, toolName: "bash", operation: "spawn", scopeKey: "fixture", scopeLabel: "Fixture scope",
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
  fs.writeFileSync(file, JSON.stringify({ grants: [grant, { ...grant, projectRoot: path.join(root, "other") }] }));
  const policy = new ApprovalTrustPolicy(file); const before = fs.readFileSync(file); const stamp = fs.statSync(file).mtimeMs;
  const renderLine = vi.fn(); const renderer = { renderLine } as unknown as StreamingRenderer;
  for (const permissionSelector of ["typo", "all extra", "--all", ""]) {
    runCliPermissionCommand({ renderer, trustPolicy: policy, projectRoot: root, permissionAction: "reset", permissionSelector });
    expect(renderLine.mock.lastCall?.[0]).toContain("Invalid /permissions arguments");
    expect(fs.readFileSync(file)).toEqual(before); expect(fs.statSync(file).mtimeMs).toBe(stamp);
  }
  runCliPermissionCommand({ renderer, trustPolicy: policy, projectRoot: root, permissionAction: "reset" });
  expect(policy.listGrants(root)).toEqual([]);
  expect(policy.listGrants()).toHaveLength(1);
  runCliPermissionCommand({ renderer, trustPolicy: policy, projectRoot: root, permissionAction: "reset", permissionSelector: "all" });
  expect(policy.listGrants()).toEqual([]);
});

it("uses the syntax vocabulary for alias and reset-scope suggestions", () => {
  const registry = createCommandRegistry(root);
  expect(registry.get("workspace")!.getArgumentCompletions?.("pro")?.map(item => item.value)).toEqual(["projects"]);
  expect(registry.get("mcp")!.getArgumentCompletions?.("re")?.map(item => item.value)).toEqual(["remove", "refresh", "reconnect", "reload", "resources", "read"]);
  expect(registry.get("permissions")!.getArgumentCompletions?.("reset ")?.map(item => item.value)).toEqual(["all"]);
  expect(registry.get("permissions")!.getArgumentCompletions?.("reset all ")).toBeNull();
  expect(registry.get("view")!.getArgumentCompletions?.("ver")?.map(item => item.value)).toEqual(["verbose"]);
});
