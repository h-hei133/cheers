import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import { existsSync } from 'node:fs';
import os from "node:os";
import path from "node:path";
import { forgetRipgrepBinary, ripgrepArgs, searchWithRipgrep } from "./grepRipgrep.js";
import { createGrepToolDefinition } from "./grep.js";
import { createDefaultExecutionService } from "../../runtime/execution/service.js";
import { executeLocally } from "../../runtime/execution/local.js";
import which from "which";
import { completeNativeRead } from '../../test-utils/native.js';
import { execFileSync } from 'node:child_process';

vi.mock("../../runtime/execution/local.js", async () => {
  const actual = await vi.importActual<typeof import("../../runtime/execution/local.js")>("../../runtime/execution/local.js");
  return { ...actual, executeLocally: vi.fn(actual.executeLocally) };
});

let root: string;
let workspace: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "grep-stream-"));
  workspace = path.join(root, "workspace");
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, "a.ts"), "中文 needle\n");
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ type: "commonjs" }));
  await fs.writeFile(path.join(root, "rg"), '', { mode: 0o755 });
  await fs.writeFile(path.join(root, "producer.cjs"), `
const mode = process.env.GREP_FIXTURE_MODE;
if (process.argv.includes("--version") && mode !== "probe-hang") process.exit(0);
if (process.argv.includes("--files")) { process.stdout.write("a.ts\\0"); return; }
const source = process.argv.find(arg => arg.startsWith("/proc/self/fd/")) ?? "a.ts";
const record = JSON.stringify({type:"match", data:{path:{text:source}, lines:{text:"中文 needle\\n"}, line_number:1}}) + "\\n";
if (mode === "error") { process.stdout.write(record, () => process.exit(2)); }
else if (mode === "utf8") {
  const data = Buffer.from(record); const start = data.indexOf(Buffer.from("中"));
  process.stdout.write(data.subarray(0, start + 1));
  setTimeout(() => process.stdout.write(data.subarray(start + 1)), 20);
} else if (mode === "limit") { process.stdout.write(record.repeat(5000)); setInterval(() => {}, 1000); }
else if (mode === "none") process.exit(1);
else setInterval(() => {}, 1000);
`);
  vi.stubEnv("PATH", `${root}${path.delimiter}${process.env.PATH ?? "/usr/bin:/bin"}`);
  const actual = await vi.importActual<typeof import("../../runtime/execution/local.js")>("../../runtime/execution/local.js");
  vi.mocked(executeLocally).mockImplementation(input => {
    // Run the fresh fixture as data through a stable interpreter. Executing a
    // just-written script directly can hit ETXTBSY on hosted Linux runners.
    const run = (request: typeof input) => (request.command === 'rg' || request.command === path.join(root, 'rg')) && existsSync(path.join(root, 'rg'))
      ? actual.executeLocally({ ...request, command: process.execPath, args: [path.join(root, 'producer.cjs'), ...(request.args ?? [])] })
      : actual.executeLocally(request);
    // This streaming fixture is a Node script, whose interpreter is absent
    // from the native view. Exercise its enumeration through the execution
    // owner; native.test.ts covers actual bwrap enumeration with native tools.
    if (path.basename(input.command) === "bwrap" && input.args?.includes("--files")) {
      const command = input.args.indexOf("--") + 1;
      return run({ ...input, command: input.args[command]!, args: input.args.slice(command + 1) }).then(result => {
        if (result.status === 'completed' || result.status === 'failed') completeNativeRead(input, result.exitCode!);
        return result;
      });
    }
    return run(input);
  });
  forgetRipgrepBinary();
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs(); forgetRipgrepBinary();
  await fs.rm(root, { recursive: true, force: true });
});
const input = () => ({ pattern: "needle", searchPath: "", limit: 10, workspaceRoot: workspace });

it("streams split UTF-8 without corrupting matching text", async () => {
  vi.stubEnv("GREP_FIXTURE_MODE", "utf8");
  expect(await searchWithRipgrep(input())).toEqual({ ok: true, matches: [{ path: "a.ts", lineNumber: 1, line: "中文 needle" }] });
});

it("stops a live producer at the global limit and waits for its exit", async () => {
  vi.stubEnv("GREP_FIXTURE_MODE", "limit");
  const result = await searchWithRipgrep({ ...input(), limit: 3 });
  expect(result.ok && result.matches.length).toBe(3);
  const args = ripgrepArgs({ ...input(), limit: 3 });
  expect(args[args.indexOf("--max-count") + 1]).toBe("3");
});

it.each(["hang", "probe-hang"])("keeps the event loop responsive and cancels %s", async (mode) => {
  vi.stubEnv("GREP_FIXTURE_MODE", mode);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300);
  try {
    expect(await searchWithRipgrep({ ...input(), abortSignal: controller.signal })).toEqual({ ok: false, reason: "cancelled" });
  } finally { clearTimeout(timer); }
});

it("times out instead of presenting partial output as success", async () => {
  vi.stubEnv("GREP_FIXTURE_MODE", "hang");
  expect(await searchWithRipgrep({ ...input(), timeoutMs: 300 })).toEqual({ ok: false, reason: "timeout" });
});

it("does not promote output from a failed process to success", async () => {
  vi.stubEnv("GREP_FIXTURE_MODE", "error");
  expect(await searchWithRipgrep(input())).toEqual({ ok: false, reason: "failed" });
});

it("accepts exit one as an empty successful search", async () => {
  vi.stubEnv("GREP_FIXTURE_MODE", "none");
  expect(await searchWithRipgrep(input())).toEqual({ ok: true, matches: [] });
});

it("cancellation does not start the fallback walk", async () => {
  vi.stubEnv("GREP_FIXTURE_MODE", "hang");
  const service = createDefaultExecutionService();
  const list = vi.spyOn(service, "listFilesRecursive");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300);
  try {
    const result = await createGrepToolDefinition(service).execute({ pattern: "needle" },
      { taskId: "fixture", workspaceRoot: workspace, abortSignal: controller.signal });
    expect(result.success).toBe(false);
    expect(result.error).toContain("cancelled");
    expect(list).not.toHaveBeenCalled();
  } finally { clearTimeout(timer); }
});

it("uses the existing file walk when no binary is installed", async () => {
  await fs.unlink(path.join(root, "rg"));
  for (const command of ["git", "bwrap"]) await fs.symlink(which.sync(command), path.join(root, command));
  vi.stubEnv("PATH", root);
  await fs.writeFile(path.join(workspace, "a.txt"), "fallback needle\n");
  const result = await createGrepToolDefinition(createDefaultExecutionService()).execute({ pattern: "needle" }, { taskId: "fixture", workspaceRoot: workspace });
  expect(result.success).toBe(true);
  expect(result.output).toContain("a.txt:1: fallback needle");
});

it.each(['rewrite', 'replace', 'remove'])('does not return complete fallback matches after a child %s during capture', async mutation => {
  await fs.unlink(path.join(root, 'rg'));
  for (const command of ['git', 'bwrap']) await fs.symlink(which.sync(command), path.join(root, command));
  vi.stubEnv('PATH', root);
  const file = path.join(workspace, 'a.ts');
  const open = fs.open;
  let captured: Awaited<ReturnType<typeof open>> | undefined;
  vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args);
    if (args[0] === file) {
      captured = handle; const read = handle.read.bind(handle);
      vi.spyOn(handle, 'read').mockImplementationOnce(async (...readArgs: Parameters<typeof handle.read>) => {
        const content = await read(...readArgs);
        execFileSync(process.execPath, ['-e', 'const fs=require("node:fs");const [file,mode]=process.argv.slice(1);if(mode==="replace")fs.renameSync(file,file+".old");if(mode==="remove")fs.unlinkSync(file);else fs.writeFileSync(file,"changed source")', file, mutation]);
        return content;
      });
    }
    return handle;
  });
  const result = await createGrepToolDefinition(createDefaultExecutionService()).execute({ pattern: 'needle' }, { taskId: 'fixture', workspaceRoot: workspace });
  expect(result.success).toBe(false);
  expect(result.error).toBe('Search stopped: a source file changed during reading. Retry with a stable source.');
  expect(captured?.fd).toBe(-1);
});

it("failed native execution does not conceal the failure with a fallback scan", async () => {
  vi.stubEnv("GREP_FIXTURE_MODE", "error");
  const service = createDefaultExecutionService();
  const list = vi.spyOn(service, "listFilesRecursive");
  const result = await createGrepToolDefinition(service).execute({ pattern: "needle" }, { taskId: "fixture", workspaceRoot: workspace });
  expect(result.success).toBe(false);
  expect(result.error).toContain("failed");
  expect(list).not.toHaveBeenCalled();
});
