import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLspToolDefinition } from "./lsp.js";
import { createDefaultExecutionService } from '../../runtime/execution/service.js';
import { adaptTools } from '../../turn/tools.js';
import { evaluateToolPermissionScope } from '../query/toolPolicy.js';

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
  it.each(['hover', 'documentSymbol', 'definition', 'references', 'workspaceSymbol'])(
    'refuses external targets for %s before touching the execution service', async operation => {
      const workspaceRoot = workspaceWith({ 'inside.ts': 'export const visible = 1;' });
      const outside = workspaceWith({ 'secret.ts': 'export const confidential = 1;' });
      fs.symlinkSync(outside, path.join(workspaceRoot, 'escape'), 'dir');
      const service = createDefaultExecutionService();
      const read = vi.spyOn(service, 'readTextFile');
      const list = vi.spyOn(service, 'listFilesRecursive');
      const tool = createLspToolDefinition(service);
      for (const filePath of [path.join(outside, 'secret.ts'), path.relative(workspaceRoot, path.join(outside, 'secret.ts')), 'escape/secret.ts']) {
        const result = await tool.execute({ operation, filePath, symbol: 'confidential' }, { workspaceRoot, taskId: 'escape' });
        expect(result.success).toBe(false);
        expect(JSON.stringify(result)).not.toContain('export const confidential');
      }
      expect(read).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
    });

  it('reads hover through the execution service and preserves filename whitespace', async () => {
    const workspaceRoot = workspaceWith({ ' module.ts ': 'export const wanted = 1;', 'module.ts': 'export const wrong = 1;' });
    const service = createDefaultExecutionService();
    const read = vi.spyOn(service, 'readTextFile');
    const tool = createLspToolDefinition(service);
    const result = await tool.execute({ operation: 'hover', filePath: ' module.ts ', symbol: 'wanted' }, { workspaceRoot, taskId: 'hover' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('wanted');
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ absolutePath: path.join(workspaceRoot, ' module.ts ') }));
  });

  it('applies canonical deny rules to explicit paths and each scanned file', async () => {
    const workspaceRoot = workspaceWith({ 'private/hidden.ts': 'export const guarded = 1;', 'public.ts': 'export const visible = 1;' });
    fs.symlinkSync(path.join(workspaceRoot, 'private/hidden.ts'), path.join(workspaceRoot, 'alias.ts'));
    const service = createDefaultExecutionService();
    vi.spyOn(service, 'listFilesRecursive').mockResolvedValue(['public.ts', 'private/hidden.ts', 'alias.ts']);
    const read = vi.spyOn(service, 'readTextFile');
    const definition = createLspToolDefinition(service);
    const denyRules = [{ tool: 'lsp', pattern: 'private/' }];
    const options = { workspaceRoot, sessionId: 'scan', permissionScope: 'allow-all' as const, denyRules,
      hooks: { dispatch: async () => ({ decision: 'allow' }) } as never, emit: () => {} };
    const [tool] = adaptTools(new Map([['lsp', definition]]), options);
    expect(evaluateToolPermissionScope('lsp', { filePath: 'alias.ts' }, 'allow-all', workspaceRoot, denyRules).denied).toBe(true);
    const denied = await tool.execute('explicit', { operation: 'hover', filePath: 'alias.ts' });
    expect(denied.isError).toBe(true);
    expect(read).not.toHaveBeenCalled();
    const scan = await tool.execute('scan', { operation: 'workspaceSymbol', symbol: 'guarded' });
    expect(scan.output).not.toContain('hidden.ts');
    expect(scan.output).not.toContain('constant guarded');
    expect(read.mock.calls.map(([input]) => input.absolutePath)).toEqual([path.join(workspaceRoot, 'public.ts')]);
  });

  it('rejects a scan entry whose symlink escapes the workspace', async () => {
    const workspaceRoot = workspaceWith({});
    const outside = workspaceWith({ 'secret.ts': 'export const concealed = 1;' });
    fs.symlinkSync(path.join(outside, 'secret.ts'), path.join(workspaceRoot, 'alias.ts'));
    const service = createDefaultExecutionService();
    vi.spyOn(service, 'listFilesRecursive').mockResolvedValue(['alias.ts', path.join(outside, 'secret.ts')]);
    const read = vi.spyOn(service, 'readTextFile');
    const result = await createLspToolDefinition(service).execute({ operation: 'definition', symbol: 'concealed' }, { workspaceRoot, taskId: 'scan' });
    expect(result.output).not.toContain('constant concealed');
    expect(read).not.toHaveBeenCalled();
  });
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


describe("lsp references", () => {
  const source = [
    "export function greet(name: string) {",
    "  return `hi ${name}`;",
    "}",
    "// greet is a nice name for a function",
    "const s = 'greet was mentioned in a string';",
    "const notGreeting = greet;",
    "export function caller() {",
    "  return greet('x');",
    "}",
  ].join("\n");

  it("counts identifier uses, not words that happen to match", async () => {
    const workspaceRoot = workspaceWith({ "src/g.ts": source });
    const tool = createLspToolDefinition(executionService(["src/g.ts"]));

    const result = await tool.execute(
      { operation: "references", symbol: "greet", filePath: "src/g.ts" },
      { workspaceRoot, taskId: "lsp-test" },
    );

    expect(result.success).toBe(true);
    // The definition line, the alias assignment, and the call site. The
    // comment on line 4 and the string on line 5 are words, not uses, and a
    // line scan would count both.
    expect(result.output).toContain("src/g.ts:6");
    expect(result.output).toContain("src/g.ts:8");
    expect(result.output).not.toContain("nice name");
    expect(result.output).not.toContain("mentioned in a string");
  });
});
