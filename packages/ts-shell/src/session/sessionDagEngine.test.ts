import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SessionDagEngine } from "./sessionDagEngine.js";

describe("Unified JSONL SessionDagEngine", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-dag-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  });

  it("creates, persists, and reconstructs DAG messages correctly", () => {
    const engine = SessionDagEngine.createNew(tempDir, "/test/workspace");
    expect(engine.header.type).toBe("session");
    expect(engine.header.version).toBe(3);

    const m1 = engine.appendMessage({ role: "user", content: "Hello DAG" });
    const m2 = engine.appendMessage({ role: "assistant", content: "Hi! How can I help?" });
    expect(m2.parentId).toBe(m1.id);

    const loaded = SessionDagEngine.load(engine.filePath);
    expect(loaded.getActiveLeafId()).toBe(m2.id);

    const ctx = loaded.buildSessionContext();
    expect(ctx.messages.length).toBe(2);
    expect(ctx.messages[0].content).toBe("Hello DAG");
    expect(ctx.messages[1].content).toBe("Hi! How can I help?");
  });

  it("handles branch switching and branch summaries seamlessly", () => {
    const engine = SessionDagEngine.createNew(tempDir, "/test/workspace");

    const m1 = engine.appendMessage({ role: "user", content: "Approach 1" });
    engine.appendMessage({ role: "assistant", content: "Trying Approach 1..." });

    // Branch from m1 to try Approach 2
    engine.branchWithSummary(m1.id, "Approach 1 failed tests; backtracking to try Approach 2.");
    engine.appendMessage({ role: "assistant", content: "Trying Approach 2..." });

    const ctx = engine.buildSessionContext();
    expect(ctx.messages.length).toBe(3);
    expect(ctx.messages[0].content).toBe("Approach 1");
    expect(ctx.messages[1].content).toContain("Approach 1 failed tests");
    expect(ctx.messages[2].content).toBe("Trying Approach 2...");
  });

  it("trims context accurately using CompactionEntry firstKeptEntryId", () => {
    const engine = SessionDagEngine.createNew(tempDir, "/test/workspace");

    engine.appendMessage({ role: "user", content: "Old message 1" });
    engine.appendMessage({ role: "assistant", content: "Old message 2" });
    const m3 = engine.appendMessage({ role: "user", content: "Preserved message 3" });

    engine.appendCompaction("Summarized earlier turns 1 & 2", m3.id, 50000);
    engine.appendMessage({ role: "assistant", content: "New response 4" });

    const ctx = engine.buildSessionContext();
    expect(ctx.messages.length).toBe(3);
    expect(ctx.messages[0].content).toContain("[Context Checkpoint]");
    expect(ctx.messages[1].content).toBe("Preserved message 3");
    expect(ctx.messages[2].content).toBe("New response 4");
  });
});

describe("corrupt DAG lines", () => {
  it("skips malformed entries but rejects a corrupt header", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-dag-corrupt-"));
    try {
      const file = path.join(root, "dag.jsonl");
      const header = JSON.stringify({ type: "session", version: 3, id: "s1", timestamp: "t0", cwd: "/tmp" });
      const good = JSON.stringify({ type: "message", id: "m1", parentId: null, message: { role: "user", content: "hi" }, timestamp: "t1" });
      fs.writeFileSync(file, [header, "{bad", good, JSON.stringify({ type: "nope", id: "x" })].join("\n"), "utf8");
      const engine = SessionDagEngine.load(file);
      expect(engine.getActiveLeafId()).toBe("m1");
      const badHeader = path.join(root, "bad.jsonl");
      fs.writeFileSync(badHeader, "{bad", "utf8");
      expect(() => SessionDagEngine.load(badHeader)).toThrow();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
