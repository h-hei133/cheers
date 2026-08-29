import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createGrepToolDefinition } from "./grep.js";
import { createCoreToolRegistry } from "./registry.js";
import { createDefaultExecutionService } from "../../runtime/execution/service.js";

describe("Grep Tool & Read Pagination", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-grep-test-"));
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "src", "index.ts"),
      "export const name = 'my-project';\nfunction run() {\n  console.log('running');\n}\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "my-project", version: "1.0.0" }, null, 2),
      "utf8",
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("finds matching lines by regex pattern with grep tool", async () => {
    const executionService = createDefaultExecutionService();
    const grepTool = createGrepToolDefinition(executionService);

    const result = await grepTool.execute(
      { pattern: "running" },
      { workspaceRoot: tempDir, taskId: "test-task" },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("src/index.ts:3:   console.log('running');");
  });

  it("supports glob and path filters in grep tool", async () => {
    const executionService = createDefaultExecutionService();
    const grepTool = createGrepToolDefinition(executionService);

    const result = await grepTool.execute(
      { pattern: "my-project", glob: "*.json" },
      { workspaceRoot: tempDir, taskId: "test-task" },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("package.json:2:");
    expect(result.output).not.toContain("src/index.ts");
  });

  it("supports offset and limit pagination in read tool", async () => {
    const registry = createCoreToolRegistry();
    const readTool = registry.get("read");
    expect(readTool).toBeDefined();

    const result = await readTool!.execute(
      { path: "src/index.ts", offset: 2, limit: 2 },
      { workspaceRoot: tempDir, taskId: "test-task" },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("function run() {");
    expect(result.output).toContain("console.log('running');");
    expect(result.output).toContain("[Showing lines 2-3 of");
  });
});
