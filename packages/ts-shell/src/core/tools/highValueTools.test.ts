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
  it("states the multi-file failure and explicit recovery boundary in the edit tool contract", () => {
    const edit = createCoreToolRegistry().get("edit");
    expect(edit?.description).toContain("Each file commits independently");
    expect(edit?.description).toContain("multi-file edits are not atomic");
    expect(edit?.description).toContain("earlier changes remain");
    expect(edit?.description).toContain("/restore to explicitly restore individual recorded edits");
  });
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

    it("declares no position arguments, because it takes none", async () => {
      // It advertised `line` and `character` and never read either, so a caller
      // following the schema would believe it could ask about a position and get
      // the precision of a language server. It cannot: the answers come from
      // parsing source. A schema promising what the tool does not do is worse
      // than a smaller schema, because the caller cannot tell the difference.
      const tool = createLspToolDefinition(createDefaultExecutionService());
      const properties = (tool.argsSchema as { properties: Record<string, unknown> }).properties;

      expect(Object.keys(properties)).not.toContain("line");
      expect(Object.keys(properties)).not.toContain("character");
    });

    it("says it is a symbol scanner rather than a language server", async () => {
      const tool = createLspToolDefinition(createDefaultExecutionService());

      expect(tool.description).toMatch(/symbol scanner/i);
      expect(tool.description).toMatch(/not a language server/i);
    });

    it("answers a hover from the symbol name alone", async () => {
      // The operation survives without a position, which is the evidence that
      // the position was never used.
      const tool = createLspToolDefinition(createDefaultExecutionService());
      const result = await tool.execute(
        { operation: "hover", filePath: "src/service.ts", symbol: "UserService" },
        { workspaceRoot: tempDir, taskId: "task-1" },
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("UserService");
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
    it("prepares the subagent and reports that nothing was dispatched without a provider", async () => {
      // No credential is configured in the test environment, so no request is
      // sent. The tool used to answer "All delegated instructions have been
      // completed" on the strength of an empty response string — a claim nothing
      // supported, and one a caller has no way to tell from real work.
      const tool = createTaskToolDefinition();
      const result = await tool.execute(
        {
          description: "Analyze dependency tree",
          prompt: "Read package.json and determine missing peer dependencies",
          agentMode: "plan",
        },
        { workspaceRoot: tempDir, taskId: "task-1" },
      );

      expect(result.success).toBe(false);
      // The report is in `error`: a failed result carries no `output`, so a caller
      // cannot read a success story out of a run that never happened.
      const report = result.error ?? "";
      expect(report).toContain("Subagent Task Executed");
      expect(report).toContain("Description**: Analyze dependency tree");
      expect(report).toContain("PLAN (Read-Only)");
      expect(report).toContain("was not started");
      expect(report).not.toContain("have been completed");
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

  it("applies every segment of one multi-segment edit", async () => {
    const tool = editTool();
    const context = { workspaceRoot: dir, taskId: "t" } as never;

    const result = await tool.execute(
      {
        path: "target.txt",
        edits: [
          { oldText: "ALPHA", newText: "AAA" },
          { oldText: "BETA", newText: "BBB" },
        ],
      },
      context,
    );

    expect(result.success).toBe(true);
    expect(await fs.readFile(path.join(dir, "target.txt"), "utf8")).toBe("AAA\nBBB\n");
  });

  it("writes nothing when one segment of a multi-segment edit does not match", async () => {
    const tool = editTool();
    const context = { workspaceRoot: dir, taskId: "t" } as never;

    await expect(
      tool.execute(
        {
          path: "target.txt",
          edits: [
            { oldText: "ALPHA", newText: "AAA" },
            { oldText: "NOT THERE", newText: "X" },
          ],
        },
        context,
      ),
    ).rejects.toThrow(/edits\[1\]/);

    // The first segment must not have been written: a partial edit leaves a file
    // that matches neither the old state nor the requested one.
    expect(await fs.readFile(path.join(dir, "target.txt"), "utf8")).toBe("ALPHA\nBETA\n");
  });

  it("refuses an edit that both replaces content and names segments", async () => {
    const tool = editTool();
    const context = { workspaceRoot: dir, taskId: "t" } as never;

    await expect(
      tool.execute(
        { path: "target.txt", content: "wholesale", edits: [{ oldText: "ALPHA", newText: "AAA" }] },
        context,
      ),
    ).rejects.toThrow(/not both/);
    expect(await fs.readFile(path.join(dir, "target.txt"), "utf8")).toBe("ALPHA\nBETA\n");
  });

  it("refuses an empty edits array rather than doing nothing quietly", async () => {
    const tool = editTool();
    const context = { workspaceRoot: dir, taskId: "t" } as never;

    await expect(tool.execute({ path: "target.txt", edits: [] }, context)).rejects.toThrow(/empty/);
  });

  it("refuses an edit that names both segments and a single replacement", async () => {
    // The branch for `edits` ran first and the legacy pair was never read, so
    // the call reported success for an edit that dropped half of what was asked
    // for — an outcome the caller had no way to notice.
    const tool = editTool();
    const context = { workspaceRoot: dir, taskId: "t" } as never;

    await expect(
      tool.execute(
        { path: "target.txt", edits: [{ oldText: "ALPHA", newText: "AAA" }], oldText: "BETA", newText: "BBB" },
        context,
      ),
    ).rejects.toThrow(/not both/);
    expect(await fs.readFile(path.join(dir, "target.txt"), "utf8")).toBe("ALPHA\nBETA\n");
  });

  it("refuses an edit that replaces content and names a single replacement", async () => {
    // Same silent-drop shape, in the other direction: the content branch ran and
    // the named replacement was ignored.
    const tool = editTool();
    const context = { workspaceRoot: dir, taskId: "t" } as never;

    await expect(
      tool.execute(
        { path: "target.txt", content: "wholesale", oldText: "BETA", newText: "BBB" },
        context,
      ),
    ).rejects.toThrow(/not both/);
    expect(await fs.readFile(path.join(dir, "target.txt"), "utf8")).toBe("ALPHA\nBETA\n");
  });

  it("refuses replaceAll alongside segments rather than ignoring it", async () => {
    // The segments path never reads `replaceAll`, so accepting it would leave the
    // caller believing every occurrence was replaced.
    const tool = editTool();
    const context = { workspaceRoot: dir, taskId: "t" } as never;

    await expect(
      tool.execute(
        { path: "target.txt", edits: [{ oldText: "ALPHA", newText: "AAA" }], replaceAll: true },
        context,
      ),
    ).rejects.toThrow(/replaceAll/);
    expect(await fs.readFile(path.join(dir, "target.txt"), "utf8")).toBe("ALPHA\nBETA\n");
  });
});

/**
 * A file's stored shape — its byte order mark and its line endings — outlives an
 * edit of it.
 *
 * Neither is something a model types, so leaving either out of the read would
 * produce a pattern that cannot be found, and leaving it out of the write would
 * quietly convert the file to another convention. Nothing shows this in a diff,
 * which is why it is tested rather than assumed.
 */
describe("editing a file keeps its stored shape", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "file-shape-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function editTo(content: string, oldText: string, newText: string): Promise<string> {
    const file = path.join(dir, "target.txt");
    await fs.writeFile(file, content, "utf8");
    const tool = createCoreToolRegistry().get("edit");
    if (!tool) throw new Error("edit tool missing");
    await tool.execute({ path: "target.txt", oldText, newText }, { workspaceRoot: dir, taskId: "t" } as never);
    return fs.readFile(file, "utf8");
  }

  it("writes every line with the file's own line ending", async () => {
    // The replacement text carries Unix endings because that is what a model
    // writes. Inserting them verbatim leaves the file mixing the two.
    const after = await editTo("ALPHA\r\nBETA\r\n", "BETA", "B1\nB2");
    expect(after).toBe("ALPHA\r\nB1\r\nB2\r\n");
    expect(after).not.toMatch(/[^\r]\n/);
  });

  it("matches a pattern written with the file's line ending too", async () => {
    // Both forms have to be findable, or the model has to guess what the file uses.
    const after = await editTo("ALPHA\r\nBETA\r\nGAMMA\r\n", "BETA\r\nGAMMA", "X");
    expect(after).toBe("ALPHA\r\nX\r\n");
  });

  it("keeps the byte order mark when the edit touches the first line", async () => {
    const after = await editTo("\uFEFFALPHA\nBETA\n", "ALPHA", "FIRST");
    expect(after.startsWith("\uFEFF")).toBe(true);
    expect(after).toBe("\uFEFFFIRST\nBETA\n");
  });

  it("keeps the byte order mark when the edit is elsewhere", async () => {
    const after = await editTo("\uFEFFALPHA\nBETA\n", "BETA", "BBB");
    expect(after).toBe("\uFEFFALPHA\nBBB\n");
  });

  it("leaves a Unix file alone", async () => {
    const after = await editTo("ALPHA\nBETA\n", "BETA", "B1\nB2");
    expect(after).toBe("ALPHA\nB1\nB2\n");
  });
});
