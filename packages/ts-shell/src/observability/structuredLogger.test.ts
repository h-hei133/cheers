import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { RotatingFileSink } from "./rotatingFileSink.js";
import {
  createComponentLogger,
  setStructuredLogSink,
} from "./structuredLogger.js";

describe("Observability & RotatingFileSink Test Suite", () => {
  let tempLogDir: string;

  beforeEach(() => {
    tempLogDir = path.join(os.tmpdir(), `test-logs-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tempLogDir, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempLogDir)) {
        fs.rmSync(tempLogDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  it("creates and writes structured log entries to dated file sink", () => {
    const sink = new RotatingFileSink({
      logDir: tempLogDir,
      filePrefix: "test-agent",
      pid: 12345,
    });

    const filePath = sink.getCurrentFilePath();
    expect(filePath).toContain("test-agent.");
    expect(filePath).toContain("12345.log");

    sink.write({
      timestamp: new Date().toISOString(),
      level: "info",
      traceId: "trace-123",
      spanId: "span-456",
      component: "TestRunner",
      message: "Test execution initiated",
      fields: { suite: "observability" },
    });

    sink.flushAndClose();

    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf8");
    expect(content).toContain("Test execution initiated");
    expect(content).toContain("trace-123");

    const recent = sink.getRecentLines(10);
    expect(recent.length).toBe(1);
  });

  it("redacts sensitive API keys and secrets automatically", () => {
    let capturedEntry: any = null;
    setStructuredLogSink((entry) => {
      capturedEntry = entry;
    });

    const logger = createComponentLogger("SecurityTest");
    logger.info("Connecting to OpenAI with sk-1234567890abcdef123456", {
      apiKey: "sk-secret-key-1234567890",
      password: "admin_password",
      safeKey: "public_value",
    });

    expect(capturedEntry).not.toBeNull();
    expect(capturedEntry.message).toContain("[REDACTED]");
    expect(capturedEntry.message).not.toContain("sk-1234567890abcdef123456");
    expect(capturedEntry.fields.apiKey).toBe("[REDACTED]");
    expect(capturedEntry.fields.password).toBe("[REDACTED]");
    expect(capturedEntry.fields.safeKey).toBe("public_value");

    setStructuredLogSink(null);
  });

  it("rotates log files when exceeding configured maximum file size", () => {
    const sink = new RotatingFileSink({
      logDir: tempLogDir,
      filePrefix: "rotate-test",
      maxFileSizeMb: 0.0001, // ~100 bytes limit to force rapid rotation
      pid: 99999,
    });

    for (let i = 0; i < 20; i++) {
      sink.write({
        timestamp: new Date().toISOString(),
        level: "debug",
        traceId: `trace-${i}`,
        spanId: `span-${i}`,
        component: "LoadTest",
        message: `High frequency event payload line number ${i} with extra padding bytes`,
        fields: { index: i },
      });
    }

    sink.flushAndClose();

    const createdFiles = fs.readdirSync(tempLogDir).filter((f) => f.startsWith("rotate-test"));
    expect(createdFiles.length).toBeGreaterThan(1);
  });

  it("prunes logs written under a prefix an earlier name left behind", () => {
    // Retention is a bound on disk use, so it has to see every file this tool
    // wrote. A file from before the rename that the pattern does not match is
    // never pruned, and it is the oldest one — exactly what the bound is for.
    const stale = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const stamp = `${stale.getFullYear()}-${String(stale.getMonth() + 1).padStart(2, "0")}-${String(stale.getDate()).padStart(2, "0")}`;
    const legacyFile = path.join(tempLogDir, `coding-agent.${stamp}.999999.log`);
    fs.writeFileSync(legacyFile, "old entry\n", "utf8");

    const sink = new RotatingFileSink({ logDir: tempLogDir, pid: 12345 });
    sink.write({
      timestamp: new Date().toISOString(),
      level: "info",
      traceId: "t",
      spanId: "s",
      component: "Prune",
      message: "trigger pruning",
      fields: {},
    });
    sink.flushAndClose();

    expect(fs.existsSync(legacyFile)).toBe(false);
  });
});
