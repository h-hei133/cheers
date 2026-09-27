import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLspToolDefinition } from "./lsp.js";

const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) fs.rmSync(workspace, { recursive: true, force: true });
});

function workspaceWith(files: Readonly<Record<string, string>>): string {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-tool-"));
  workspaces.push(workspace);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(workspace, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
  }
  return workspace;
}

function executionService(files: readonly string[]) {
  return {
    async listFilesRecursive() {
      return files;
    },
    async readTextFile(input: { absolutePath: string }) {
      return fs.readFileSync(input.absolutePath, "utf8");
    },
  } as never;
}
describe("lsp symbol scanning", () => {
  it("reports AST symbols including methods and generators with their spans", async () => {
    const workspaceRoot = workspaceWith({
      "src/example.ts": [
        "export async function* streamValues() {",
        "  yield 1;",
        "}",
        "class Worker {",
        "  run() { return streamValues(); }",
        "}",
      ].join("\n"),
    });
    const tool = createLspToolDefinition(executionService(["src/example.ts"]));

    const result = await tool.execute(
      { operation: "documentSymbol", filePath: "src/example.ts" },
      { workspaceRoot, taskId: "lsp-test" },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("streamValues");
    expect(result.output).toContain("Worker");
    expect(result.output).toContain("run");
    expect(result.output).toContain("line 1");
    expect(result.output).toContain("line 5");
  });

  it("finds generator declarations through the AST instead of a declaration regex", async () => {
    const workspaceRoot = workspaceWith({
      "src/example.ts": "export async function* streamValues() { yield 1; }\n",
    });
    const tool = createLspToolDefinition(executionService(["src/example.ts"]));

    const result = await tool.execute(
      { operation: "definition", symbol: "streamValues" },
      { workspaceRoot, taskId: "lsp-test" },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("src/example.ts:1");
    expect(result.output).toContain("streamValues");
  });
});

