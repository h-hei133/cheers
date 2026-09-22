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
});
