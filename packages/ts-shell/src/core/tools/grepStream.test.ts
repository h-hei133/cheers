import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { forgetRipgrepBinary, ripgrepArgs, searchWithRipgrep } from "./grepRipgrep.js";
import { createGrepToolDefinition } from "./grep.js";
import { createDefaultExecutionService } from "../../runtime/execution/service.js";

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "grep-stream-"));
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ type: "commonjs" }));
  await fs.writeFile(path.join(root, "rg"), `#!${process.execPath}
const fs = require("node:fs");
const mode = process.env.GREP_FIXTURE_MODE;
if (process.argv.includes("--version") && mode !== "probe-hang") process.exit(0);
fs.writeFileSync(${JSON.stringify(path.join(root, "pid"))}, String(process.pid));
const record = JSON.stringify({type:"match", data:{path:{text:"a.ts"}, lines:{text:"中文 needle\\n"}, line_number:1}}) + "\\n";
if (mode === "error") { process.stdout.write(record, () => process.exit(2)); }
else if (mode === "utf8") {
  const data = Buffer.from(record); const start = data.indexOf(Buffer.from("中"));
  process.stdout.write(data.subarray(0, start + 1));
  setTimeout(() => process.stdout.write(data.subarray(start + 1)), 20);
} else if (mode === "limit") { process.stdout.write(record.repeat(5000)); setInterval(() => {}, 1000); }
else if (mode === "none") process.exit(1);
else setInterval(() => {}, 1000);
`, { mode: 0o755 });
  vi.stubEnv("PATH", root);
  forgetRipgrepBinary();
});
afterEach(async () => {
  vi.unstubAllEnvs(); forgetRipgrepBinary();
  await fs.rm(root, { recursive: true, force: true });
});
const input = () => ({ pattern: "needle", searchPath: "", limit: 10, workspaceRoot: root });

it("streams split UTF-8 without corrupting matching text", async () => {
  vi.stubEnv("GREP_FIXTURE_MODE", "utf8");
  expect(await searchWithRipgrep(input())).toEqual({ ok: true, matches: [{ path: "a.ts", lineNumber: 1, line: "中文 needle" }] });
});

it("stops a live producer at the global limit and waits for its exit", async () => {
  vi.stubEnv("GREP_FIXTURE_MODE", "limit");
  const result = await searchWithRipgrep({ ...input(), limit: 3 });
  expect(result.ok && result.matches.length).toBe(3);
  const pid = Number(await fs.readFile(path.join(root, "pid"), "utf8"));
  expect(() => process.kill(pid, 0)).toThrow();
  const args = ripgrepArgs({ ...input(), limit: 3 });
  expect(args[args.indexOf("--max-count") + 1]).toBe("3");
});

it.each(["hang", "probe-hang"])("keeps the event loop responsive and cancels %s", async (mode) => {
  vi.stubEnv("GREP_FIXTURE_MODE", mode);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300);
  try {
    expect(await searchWithRipgrep({ ...input(), abortSignal: controller.signal })).toEqual({ ok: false, reason: "cancelled" });
    const pid = Number(await fs.readFile(path.join(root, "pid"), "utf8"));
    expect(() => process.kill(pid, 0)).toThrow();
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
      { taskId: "fixture", workspaceRoot: root, abortSignal: controller.signal });
    expect(result.success).toBe(false);
    expect(result.error).toContain("cancelled");
    expect(list).not.toHaveBeenCalled();
  } finally { clearTimeout(timer); }
});

it("uses the existing file walk when no binary is installed", async () => {
  await fs.unlink(path.join(root, "rg"));
  await fs.writeFile(path.join(root, "a.txt"), "fallback needle\n");
  const result = await createGrepToolDefinition(createDefaultExecutionService()).execute({ pattern: "needle" }, { taskId: "fixture", workspaceRoot: root });
  expect(result.success).toBe(true);
  expect(result.output).toContain("a.txt:1: fallback needle");
});

it("failed native execution does not conceal the failure with a fallback scan", async () => {
  vi.stubEnv("GREP_FIXTURE_MODE", "error");
  const service = createDefaultExecutionService();
  const list = vi.spyOn(service, "listFilesRecursive");
  const result = await createGrepToolDefinition(service).execute({ pattern: "needle" }, { taskId: "fixture", workspaceRoot: root });
  expect(result.success).toBe(false);
  expect(result.error).toContain("failed");
  expect(list).not.toHaveBeenCalled();
});
