import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { HookDispatcher } from "./hookDispatcher.js";
import {
  createPostMutationLspGuard,
  createAffectedUnitTestRunner,
  createEvidenceReceiptCollector,
  getSessionReceipts,
  clearSessionReceipts,
} from "./builtin/index.js";

describe("Enterprise Hook & Verification Engine", () => {
  let tempDir: string;
  let dispatcher: HookDispatcher;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hooks-test-"));
    dispatcher = new HookDispatcher();
    clearSessionReceipts();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    clearSessionReceipts();
  });

  describe("Lifecycle Event Dispatching", () => {
    it("dispatches in-process hooks and captures allow decisions", async () => {
      let visited = false;
      dispatcher.registerInProcessHook({
        event: "UserPromptSubmit",
        name: "test-prompt-hook",
        handler: async (payload) => {
          visited = true;
          expect((payload as any).prompt).toBe("Hello world");
          return { decision: "allow" };
        },
      });

      const decision = await dispatcher.dispatch({
        eventName: "UserPromptSubmit",
        sessionId: "sess_1",
        workspaceRoot: tempDir,
        timestamp: new Date().toISOString(),
        prompt: "Hello world",
      });

      expect(visited).toBe(true);
      expect(decision).toBeNull();
    });

    it("blocks tool execution when a PreToolUse hook returns block", async () => {
      dispatcher.registerInProcessHook({
        event: "PreToolUse",
        name: "block-rm-hook",
        matcher: "rm|destroy",
        handler: async () => ({
          decision: "block",
          reason: "Destructive command rejected by security policy.",
        }),
      });

      const decision = await dispatcher.dispatch({
        eventName: "PreToolUse",
        sessionId: "sess_1",
        workspaceRoot: tempDir,
        timestamp: new Date().toISOString(),
        toolName: "rm",
        toolCallId: "call_1",
        args: { path: "important.txt" },
      });

      expect(decision?.decision).toBe("block");
      expect(decision?.reason).toContain("Destructive command rejected");
    });
  });

  describe("Built-in Verification Hooks", () => {
    it("detects syntax errors via PostMutationLspGuard and returns self-healing feedback", async () => {
      const guard = createPostMutationLspGuard();
      dispatcher.registerInProcessHook(guard);

      // Create a file with unmatched braces
      await fs.writeFile(path.join(tempDir, "broken.ts"), "export function test() { const x = 1;", "utf8");

      const decision = await dispatcher.dispatch({
        eventName: "PostToolUse",
        sessionId: "sess_1",
        workspaceRoot: tempDir,
        timestamp: new Date().toISOString(),
        toolName: "write",
        toolCallId: "call_2",
        args: { path: "broken.ts" },
        output: "broken.ts",
        success: true,
      });

      expect(decision?.decision).toBe("retry");
      expect(decision?.feedback).toContain("Unbalanced Braces");
      expect(decision?.feedback).toContain("broken.ts");
    });

    it("identifies matching test files via AffectedUnitTestRunner", async () => {
      const runner = createAffectedUnitTestRunner();
      dispatcher.registerInProcessHook(runner);

      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "src", "math.ts"), "export const add = (a, b) => a + b;", "utf8");
      await fs.writeFile(path.join(tempDir, "src", "math.test.ts"), "it('adds', () => {});", "utf8");

      const decision = await dispatcher.dispatch({
        eventName: "PostToolUse",
        sessionId: "sess_1",
        workspaceRoot: tempDir,
        timestamp: new Date().toISOString(),
        toolName: "edit",
        toolCallId: "call_3",
        args: { path: "src/math.ts" },
        output: "src/math.ts",
        success: true,
      });

      expect(decision?.decision).toBe("allow");
      expect(decision?.hookSpecificOutput?.affectedUnitTest).toContain("src/math.test.ts");
    });

    it("gathers deterministic execution receipts via EvidenceReceiptCollector", async () => {
      const collector = createEvidenceReceiptCollector();
      dispatcher.registerInProcessHook(collector);

      await dispatcher.dispatch({
        eventName: "PostToolUse",
        sessionId: "sess_1",
        workspaceRoot: tempDir,
        timestamp: new Date().toISOString(),
        toolName: "grep",
        toolCallId: "call_4",
        args: { pattern: "test" },
        output: "src/math.ts:1: export",
        success: true,
      });

      const receipts = getSessionReceipts();
      expect(receipts.length).toBe(1);
      expect(receipts[0].toolName).toBe("grep");
      expect(receipts[0].success).toBe(true);
    });
  });
});
