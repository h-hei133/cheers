import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runGoalCommand, getActiveSessionGoal, setActiveSessionGoal } from "./goalCommandRuntime.js";
import { runLoopCommand } from "./loopCommandRuntime.js";
import { runTodoCommand, getSessionTodos } from "./todoCommandRuntime.js";
import { runFastCommand, isFastModeEnabled, setFastModeEnabled } from "./fastCommandRuntime.js";
import { runContextCommand } from "./contextCommandRuntime.js";
import { runBtwCommand } from "./btwCommandRuntime.js";
import { routeSlashCommand } from "./slashRouter.js";

describe("Phase 5 High-Level Workflow Commands Subsystem", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slash-workflow-test-"));
    setActiveSessionGoal(null);
    setFastModeEnabled(false);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("/goal command", () => {
    it("creates, pauses, resumes, and completes goal state", async () => {
      // 1. Create goal
      const createRes = await runGoalCommand(["Build", "authentication", "system"], { cwd: tempDir });
      expect(createRes.output).toContain("Goal Established & Armed");
      expect(getActiveSessionGoal()?.objective).toBe("Build authentication system");
      expect(getActiveSessionGoal()?.phase).toBe("active");

      // 2. Pause goal
      const pauseRes = await runGoalCommand(["pause"], { cwd: tempDir });
      expect(pauseRes.output).toContain("Goal paused");
      expect(getActiveSessionGoal()?.phase).toBe("paused");

      // 3. Resume goal
      const resumeRes = await runGoalCommand(["resume"], { cwd: tempDir });
      expect(resumeRes.output).toContain("Goal resumed (active)");
      expect(getActiveSessionGoal()?.phase).toBe("active");

      // 4. Complete goal
      const completeRes = await runGoalCommand(["complete"], { cwd: tempDir });
      expect(completeRes.output).toContain("COMPLETE");
      expect(getActiveSessionGoal()?.phase).toBe("complete");

      // 5. Clear goal
      const clearRes = await runGoalCommand(["clear"], { cwd: tempDir });
      expect(clearRes.output).toContain("cleared");
      expect(getActiveSessionGoal()).toBeNull();
    });
  });

  describe("/loop command", () => {
    it("configures autonomous loop with verify command and preflight status", async () => {
      const result = await runLoopCommand(["3", "echo 'hello'"], { cwd: tempDir });
      expect(result.kind).toBe("local");
      expect(result.output).toContain("Autonomous Loop Session Configured");
      expect(result.output).toContain("Max Iterations**: 3");
      expect(result.output).toContain("Verification command is **already passing**");
    });
  });

  describe("/todo command", () => {
    it("adds tasks, marks them in_progress and done, and visualizes checklist", async () => {
      await runTodoCommand(["clear"], { cwd: tempDir });

      // Add tasks
      await runTodoCommand(["add", "Write unit tests"], { cwd: tempDir });
      await runTodoCommand(["add", "Refactor session manager"], { cwd: tempDir });

      expect(getSessionTodos().length).toBe(2);

      // Start task 1
      await runTodoCommand(["start", "1"], { cwd: tempDir });
      expect(getSessionTodos()[0].status).toBe("in_progress");

      // Complete task 1
      await runTodoCommand(["done", "1"], { cwd: tempDir });
      expect(getSessionTodos()[0].status).toBe("done");

      // Render checklist
      const viewRes = await runTodoCommand([], { cwd: tempDir });
      expect(viewRes.output).toContain("Session Task Checklist");
      expect(viewRes.output).toContain("[X] **#1**: Write unit tests *(done)*");
      expect(viewRes.output).toContain("[ ] **#2**: Refactor session manager *(pending)*");
      expect(viewRes.output).toContain("Progress: **1/2** (50%)");
    });
  });

  describe("/fast command", () => {
    it("toggles fast mode on and off", async () => {
      const onRes = await runFastCommand(["on"], { cwd: tempDir });
      expect(onRes.output).toContain("Fast Mode Activated");
      expect(isFastModeEnabled()).toBe(true);

      const offRes = await runFastCommand(["off"], { cwd: tempDir });
      expect(offRes.output).toContain("Fast Mode Deactivated");
      expect(isFastModeEnabled()).toBe(false);
    });
  });

  describe("/context command", () => {
    it("renders ASCII token bar and category breakdown", async () => {
      const result = await runContextCommand([], { cwd: tempDir, sessionId: "sess_ctx_test" });
      expect(result.kind).toBe("local");
      expect(result.output).toContain("Context Window Telemetry & Token Map");
      expect(result.output).toContain("Token Usage Bar");
      expect(result.output).toContain("64,000 Tokens");
      expect(result.output).toContain("Autocompact Buffer");
      expect(result.output).toContain("Microcompact**: `ACTIVE`");
    });
  });

  describe("/btw command", () => {
    it("handles out of band side questions cleanly", async () => {
      const result = await runBtwCommand(["what is typescript?"], { cwd: tempDir });
      expect(result.kind).toBe("local");
      expect(result.output).toContain("Side Question (/btw)");
      expect(result.output).toContain("what is typescript?");
      expect(result.output).toContain("100% excluded from your main session history");
    });
  });

  describe("Slash Router Dispatch for Phase 5 Commands", () => {
    it("routes all 6 workflow commands through routeSlashCommand", async () => {
      expect((await routeSlashCommand("/goal Fix memory leaks", { cwd: tempDir }))?.kind).toBe("local");
      expect((await routeSlashCommand("/todo add Clean up logs", { cwd: tempDir }))?.kind).toBe("local");
      expect((await routeSlashCommand("/fast toggle", { cwd: tempDir }))?.kind).toBe("local");
      expect((await routeSlashCommand("/context", { cwd: tempDir }))?.kind).toBe("local");
      expect((await routeSlashCommand("/btw explain git merge", { cwd: tempDir }))?.kind).toBe("local");
      expect((await routeSlashCommand("/loop 2 npm test", { cwd: tempDir }))?.kind).toBe("local");
    });
  });
});
