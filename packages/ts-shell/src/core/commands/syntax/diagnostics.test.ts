import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runLogCommand } from "../logCommandRuntime.js";
import { runMetricsCommand } from "../metricsCommandRuntime.js";
import { runReportCommand } from "../reportCommandRuntime.js";
import { runCrashCommand } from "../crashCommandRuntime.js";
import { RotatingFileSink, setGlobalRotatingFileSink } from "../../../observability/rotatingFileSink.js";
import { createCommandRegistry } from "../registry.js";

let root: string;
let sink: RotatingFileSink;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "diagnostic-args-"));
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root);
  sink = new RotatingFileSink({ logDir: root, filePrefix: "fixture" });
  setGlobalRotatingFileSink(sink);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it.each(["0", "-1", "1.5", "1e3", "Infinity", "NaN", "1junk", "9007199254740992"])("rejects invalid record count %s", async value => {
  const read = vi.spyOn(sink, "getRecentLines");
  expect((await runLogCommand(["tail", value], { cwd: root })).output).toContain("Invalid /log arguments");
  expect((await runMetricsCommand([value], { cwd: root })).output).toContain("Invalid /metrics arguments");
  expect(read).not.toHaveBeenCalled();
});

it("keeps the log numeric shorthand and default count", async () => {
  const read = vi.spyOn(sink, "getRecentLines").mockReturnValue([]);
  await runLogCommand(["12"], { cwd: root }); expect(read).toHaveBeenLastCalledWith(12);
  await runLogCommand([], { cwd: root }); expect(read).toHaveBeenLastCalledWith(30);
});

it("rejects extra log arguments before deleting or exporting", async () => {
  const source = sink.getCurrentFilePath(); fs.writeFileSync(source, "retained\n");
  const stamp = fs.statSync(source).mtimeMs;
  for (const args of [["clear", "extra"], ["export", "copy.jsonl", "extra"], ["path", "extra"], ["12", "extra"]]) {
    expect((await runLogCommand(args, { cwd: root })).output).toContain("Invalid /log arguments");
    expect(fs.readFileSync(source, "utf8")).toBe("retained\n"); expect(fs.statSync(source).mtimeMs).toBe(stamp);
    expect(fs.existsSync(path.join(root, "copy.jsonl"))).toBe(false);
  }
});

it("rejects report flags and extra paths without creating or overwriting any archive", async () => {
  const target = path.join(root, "existing.zip"); fs.writeFileSync(target, "retained");
  const before = fs.readdirSync(root); const stamp = fs.statSync(target).mtimeMs;
  for (const args of [[target, "extra"], ["--unknown"], [target, "--outside=false"], [target, "--outside", "--outside"]]) {
    expect((await runReportCommand(args, { cwd: root })).output).toContain("Invalid /report arguments");
    expect(fs.readFileSync(target, "utf8")).toBe("retained"); expect(fs.statSync(target).mtimeMs).toBe(stamp);
    expect(fs.readdirSync(root)).toEqual(before);
  }
  const result = await runReportCommand(["--", "-literal.zip"], { cwd: root });
  expect(result.output).toContain("Report written"); expect(fs.readFileSync(path.join(root, "-literal.zip")).subarray(0, 2).toString()).toBe("PK");
});

it.each([["extra", "--stack"], ["--stack=false"], ["--unknown"], ["--stack", "--stack"]])("rejects crash arguments %j", async (...args) => {
  expect((await runCrashCommand(args, { cwd: root })).output).toContain("Invalid /crash arguments");
});

it("suggests only legal flags at direct argument positions", () => {
  const registry = createCommandRegistry(root);
  const suggest = (name: string, prefix: string) => registry.get(name)!.getArgumentCompletions?.(prefix)?.map(item => item.value) ?? [];
  expect(suggest("crash", "")).toEqual(["--stack"]);
  expect(suggest("crash", "--stack ")).toEqual([]);
  expect(suggest("crash", "extra ")).toEqual([]);
  expect(suggest("report", "out.zip --o")).toEqual(["--outside"]);
  expect(suggest("report", "out.zip extra ")).toEqual([]);
  expect(suggest("report", "-- -file ")).toEqual([]);
  expect(suggest("metrics", "")).toEqual([]);
  expect(suggest("log", "clear ")).toEqual([]);
});
