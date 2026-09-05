import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SandboxEnforcer } from "../../sandbox/sandboxEnforcer.js";
import { ToolRuntime } from "./runtime.js";

const workspaceRoot = path.join(os.tmpdir(), "private-agents-edit-diff-test");
const auditLogPath = path.join(os.tmpdir(), "private-agents-edit-diff-audit.jsonl");

describe("edit and write diff generation", () => {
  beforeEach(async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
    await fs.rm(auditLogPath, { force: true });
  });

  it("produces unified diff on edit", async () => {
    const filePath = path.join(workspaceRoot, "sample.ts");
    await fs.writeFile(filePath, "const a = 1;\nconst b = 2;\n", "utf8");

    const runtime = new ToolRuntime(new SandboxEnforcer({ workspaceRoot, auditLogPath }));
    const result = await runtime.execute(
      "edit",
      { path: "sample.ts", oldText: "const b = 2;", newText: "const b = 20;\nconst c = 30;" },
      { taskId: "task_edit_1", workspaceRoot },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("```diff");
    expect(result.output).toContain("-const b = 2;");
    expect(result.output).toContain("+const b = 20;");
    expect(result.output).toContain("+const c = 30;");
  });

  it("produces unified diff on write update", async () => {
    const filePath = path.join(workspaceRoot, "write-target.txt");
    await fs.writeFile(filePath, "line 1\nline 2\n", "utf8");

    const runtime = new ToolRuntime(new SandboxEnforcer({ workspaceRoot, auditLogPath }));
    const result = await runtime.execute(
      "write",
      { path: "write-target.txt", content: "line 1\nline 2 modified\n" },
      { taskId: "task_write_1", workspaceRoot },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("```diff");
    expect(result.output).toContain("-line 2");
    expect(result.output).toContain("+line 2 modified");
  });
});
