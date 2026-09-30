import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runLogCommand } from "./logCommandRuntime.js";
import { setGlobalRotatingFileSink, RotatingFileSink } from "../../observability/rotatingFileSink.js";
import type { CommandContext } from "./types.js";

describe("/log Slash Command Test Suite", () => {
  let tempLogDir: string;
  let sink: RotatingFileSink;

  beforeEach(() => {
    tempLogDir = path.join(os.tmpdir(), `test-log-cmd-${Date.now()}`);
    fs.mkdirSync(tempLogDir, { recursive: true });
    sink = new RotatingFileSink({
      logDir: tempLogDir,
      filePrefix: "cmd-test",
      pid: 77777,
    });
    setGlobalRotatingFileSink(sink);
  });

  afterEach(() => {
    sink.flushAndClose();
    setGlobalRotatingFileSink(null);
    try {
      if (fs.existsSync(tempLogDir)) {
        fs.rmSync(tempLogDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore
    }
  });

  const dummyContext: CommandContext = {
    cwd: process.cwd(),
    sessionId: "test-session",
    rawCommandName: "log",
  };

  it("handles /log path and /log help commands", async () => {
    const pathRes = await runLogCommand(["path"], dummyContext);
    expect(pathRes.output).toContain("Current session log file:");
    expect(pathRes.output).toContain("cmd-test");

    const helpRes = await runLogCommand(["help"], dummyContext);
    expect(helpRes.output).toContain("/log Command Reference");
  });

  it("displays formatted tail logs", async () => {
    sink.write({
      timestamp: new Date().toISOString(),
      level: "info",
      traceId: "t-1",
      spanId: "s-1",
      component: "AgentLoop",
      message: "Agent turn 1 completed successfully",
      fields: {},
    });

    const tailRes = await runLogCommand(["tail", "10"], dummyContext);
    expect(tailRes.output).toContain("Agent Runtime Logs");
    expect(tailRes.output).toContain("[INFO]");
    expect(tailRes.output).toContain("[AgentLoop]");
    expect(tailRes.output).toContain("Agent turn 1 completed successfully");
  });

  it("exports logs to destination file", async () => {
    sink.write({
      timestamp: new Date().toISOString(),
      level: "warn",
      traceId: "t-2",
      spanId: "s-2",
      component: "ShellManager",
      message: "Fallback backend active",
      fields: {},
    });

    const exportDest = path.join(tempLogDir, "exported-debug.jsonl");
    const exportRes = await runLogCommand(["export", exportDest], dummyContext);
    expect(exportRes.output).toContain("Successfully exported agent runtime logs to:");
    expect(fs.existsSync(exportDest)).toBe(true);
  });

  it("tails, exports and clears every part of only the current log family", async () => {
    sink = new RotatingFileSink({ logDir: tempLogDir, filePrefix: "rotation", pid: 77777, maxFileSizeMb: 0.0003 });
    setGlobalRotatingFileSink(sink);
    for (let index = 0; index < 60; index++) sink.write({
      timestamp: "2026-09-30T12:00:00Z", level: "info", traceId: "trace", spanId: "span",
      component: "test", message: `line-${index}`, fields: {},
    });
    const files = sink.getFiles();
    expect(files.length).toBeGreaterThan(10);
    // Filesystem timestamps may tie; suffixes must still follow their numeric order.
    for (const file of files) fs.utimesSync(file, 100, 100);
    const other = path.join(tempLogDir, "rotation.2026-09-30.88888.log");
    fs.writeFileSync(other, "other process\n");
    expect(sink.getRecentLines(50).map((line) => JSON.parse(line).message))
      .toEqual(Array.from({ length: 50 }, (_, index) => `line-${index + 10}`));
    const exported = await runLogCommand(["export", "export.jsonl"], { cwd: tempLogDir });
    expect(exported.output).toContain("Successfully exported");
    expect(fs.readFileSync(path.join(tempLogDir, "export.jsonl"), "utf8").trim().split("\n")).toHaveLength(60);
    await runLogCommand(["clear"], dummyContext);
    expect(sink.getRecentLines()).toEqual([]);
    expect(fs.readFileSync(other, "utf8")).toBe("other process\n");
  });

  it.each(["same", "symlink", "hardlink"])("rejects a %s export destination before changing source bytes", async (alias) => {
    const source = sink.getCurrentFilePath();
    const content = '{"message":"retained"}\n';
    fs.writeFileSync(source, content);
    const target = alias === "same" ? source : path.join(tempLogDir, alias);
    if (alias === "symlink") fs.symlinkSync(source, target);
    if (alias === "hardlink") fs.linkSync(source, target);
    const result = await runLogCommand(["export", target], dummyContext);
    expect(result.output).toContain("Failed to export logs: Export destination is an input log file");
    expect(fs.readFileSync(source, "utf8")).toBe(content);
  });
});
