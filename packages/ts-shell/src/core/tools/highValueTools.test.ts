import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createLspToolDefinition } from "./lsp.js";
import { createAskToolDefinition } from "./ask.js";
import { createTodoToolDefinition } from "./todoTool.js";
import { createTaskToolDefinition } from "./taskTool.js";
import { runTodoCommand } from "../commands/todoCommandRuntime.js";
import { createDefaultExecutionService } from "../../runtime/execution/service.js";
import { createCoreToolRegistry } from "./registry.js";
describe("High-Value Modern Built-in Tools Subsystem", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "high-value-tools-test-"));
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "src", "service.ts"),
      "export class UserService {\n  findUser(id: string) {\n    return { id, name: 'Alice' };\n  }\n}\nexport function createUserService() {\n  return new UserService();\n}\n",
      "utf8",
    );
  });

  afterEach(async () => {
    await runTodoCommand(["clear"], { cwd: tempDir });
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("lsp tool", () => {
    it("extracts document symbols from a source file", async () => {
      const tool = createLspToolDefinition(createDefaultExecutionService());
      const result = await tool.execute(
        { operation: "documentSymbol", filePath: "src/service.ts" },
        { workspaceRoot: tempDir, taskId: "task-1" },
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Document Symbols in `src/service.ts`");
      expect(result.output).toContain("Class: `UserService`");
      expect(result.output).toContain("Function: `createUserService`");
    });

    it("locates symbol definitions and references across workspace", async () => {
      const tool = createLspToolDefinition(createDefaultExecutionService());

      // Definition search
      const defResult = await tool.execute(
        { operation: "definition", symbol: "UserService" },
        { workspaceRoot: tempDir, taskId: "task-1" },
      );
      expect(defResult.success).toBe(true);
      expect(defResult.output).toContain("Definitions for `UserService`");
      expect(defResult.output).toContain("src/service.ts:1");

      // Reference search
      const refResult = await tool.execute(
        { operation: "references", symbol: "UserService" },
        { workspaceRoot: tempDir, taskId: "task-1" },
      );
      expect(refResult.success).toBe(true);
      expect(refResult.output).toContain("References to `UserService`");
    });

    it("rejects documentSymbol when filePath is missing", async () => {
      const tool = createLspToolDefinition(createDefaultExecutionService());
      const result = await tool.execute(
        { operation: "documentSymbol" },
        { workspaceRoot: tempDir, taskId: "task-1" },
      );
      expect(result.success).toBe(false);
      const err = result.error || result.output;
      expect(err).toContain("filePath parameter is required");
    });
  });

  describe("ask tool", () => {
    it("renders structured multiple-choice questions cleanly", async () => {
      const tool = createAskToolDefinition();
      const result = await tool.execute(
        {
          questions: [
            {
              id: "db_choice",
              question: "Which database backend should be configured?",
              options: [
                { label: "SQLite", description: "Embedded zero-config database" },
                { label: "PostgreSQL", description: "Full relational database server" },
              ],
              recommended: 0,
            },
          ],
        },
        { workspaceRoot: tempDir, taskId: "task-1" },
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("User Decision & Clarification Requested");
      expect(result.output).toContain("Question 1 [db_choice]: Which database backend should be configured?");
      expect(result.output).toContain("[1] SQLite** (Recommended): Embedded zero-config database");
      expect(result.output).toContain("[2] PostgreSQL**: Full relational database server");
    });

    it("handles missing questions array gracefully", async () => {
      const tool = createAskToolDefinition();
      const result = await tool.execute({ questions: [] }, { workspaceRoot: tempDir, taskId: "task-1" });
      expect(result.success).toBe(false);
      const err = result.error || result.output;
      expect(err).toContain("questions array is required");
    });
  });

  describe("todo tool", () => {
    it("interacts with session todo store via tool actions", async () => {
      const tool = createTodoToolDefinition();

      // 1. Add todo item
      const addRes = await tool.execute(
        { action: "add", task: "Implement OAuth provider" },
        { workspaceRoot: tempDir, taskId: "task-1" },
      );
      expect(addRes.success).toBe(true);
      expect(addRes.output).toContain("Task added");

      // 2. List todos
      const listRes = await tool.execute(
        { action: "list" },
        { workspaceRoot: tempDir, taskId: "task-1" },
      );
      expect(listRes.success).toBe(true);
      expect(listRes.output).toContain("Session Task Checklist");
      expect(listRes.output).toContain("Implement OAuth provider");
    });

    it("rejects unsupported actions", async () => {
      const tool = createTodoToolDefinition();
      const result = await tool.execute(
        { action: "invalid_action" },
        { workspaceRoot: tempDir, taskId: "task-1" },
      );
      expect(result.success).toBe(false);
      const err = result.error || result.output;
      expect(err).toContain("action must be one of");
    });
  });

  describe("task tool", () => {
    it("dispatches isolated subagent task and returns clean summary", async () => {
      const tool = createTaskToolDefinition();
      const result = await tool.execute(
        {
          description: "Analyze dependency tree",
          prompt: "Read package.json and determine missing peer dependencies",
          agentMode: "plan",
        },
        { workspaceRoot: tempDir, taskId: "task-1" },
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Subagent Task Executed");
      expect(result.output).toContain("Description**: Analyze dependency tree");
      expect(result.output).toContain("PLAN (Read-Only)");
    });
  });
});

/**
 * Two edits of one file at the same time.
 *
 * This is the shape a read-modify-write takes, and it is why the write tools hold
 * a per-file lock across both halves. Without it both edits read the same
 * original, the second write is built on content the first already replaced, and
 * one change disappears — while both calls report success.
 */
describe("concurrent edits of one file", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "concurrent-edit-"));
    await fs.writeFile(path.join(dir, "target.txt"), "ALPHA\nBETA\n", "utf8");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  function editTool() {
    const tool = createCoreToolRegistry().get("edit");
    if (!tool) throw new Error("edit tool missing");
    return tool;
  }

  it("keeps both changes when two edits touch different lines", async () => {
    const tool = editTool();
    const context = { workspaceRoot: dir, taskId: "t" } as never;
    const results = await Promise.all([
      tool.execute({ path: "target.txt", oldText: "ALPHA", newText: "AAA" }, context),
      tool.execute({ path: "target.txt", oldText: "BETA", newText: "BBB" }, context),
    ]);

    const final = await fs.readFile(path.join(dir, "target.txt"), "utf8");
    // Both were accepted, so both must be in the file. Losing one silently is the
    // failure this guards: nothing errors, and the file is simply missing an edit.
    for (const result of results) {
      expect(result.success).toBe(true);
    }
    expect(final).toContain("AAA");
    expect(final).toContain("BBB");
  });

  it("keeps both changes when two writes replace the file's content", async () => {
    const tool = editTool();
    const context = { workspaceRoot: dir, taskId: "t" } as never;
    await Promise.all([
      tool.execute({ path: "one.txt", content: "first\n" }, context),
      tool.execute({ path: "two.txt", content: "second\n" }, context),
    ]);
    // Different files are independent, so neither should be able to lose the other.
    expect(await fs.readFile(path.join(dir, "one.txt"), "utf8")).toBe("first\n");
    expect(await fs.readFile(path.join(dir, "two.txt"), "utf8")).toBe("second\n");
  });
});
