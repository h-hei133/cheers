import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runGoalCommand } from "./goalCommandRuntime.js";
import { runLoopCommand } from "./loopCommandRuntime.js";
import { runTodoCommand, getSessionTodos } from "./todoCommandRuntime.js";
import { runFastCommand } from "./fastCommandRuntime.js";
import { readProjectState } from '../state/projectState.js';
import { runContextCommand } from "./contextCommandRuntime.js";
import { runBtwCommand } from "./btwCommandRuntime.js";
import { routeSlashCommand } from "./slashRouter.js";

describe("Phase 5 High-Level Workflow Commands Subsystem", () => {
  let tempDir: string;
  let realHome: string | undefined;
  let realProfile: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "slash-workflow-test-"));
    // Durable per-project state lands under the home directory, so the home is
    // moved into the temp tree for the duration: a test must not write into the
    // state of the machine running it.
    realHome = process.env.HOME;
    realProfile = process.env.USERPROFILE;
    process.env.HOME = tempDir;
    delete process.env.USERPROFILE;
  });

  afterEach(async () => {
    if (realHome === undefined) delete process.env.HOME;
    else process.env.HOME = realHome;
    if (realProfile !== undefined) process.env.USERPROFILE = realProfile;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("/goal command", () => {
    it("delegates goal semantics to the session host and refuses off-session writes", async () => {
      expect((await runGoalCommand(["set", "Build authentication system"], { cwd: tempDir })).output).toContain('unavailable');
      const calls: string[][] = [];
      const context = { cwd: tempDir, goalCommand: async (args: string[]) => {
        calls.push(args); return { kind: 'local' as const, output: 'session owner result' };
      } };
      expect(await routeSlashCommand('/goal set Build authentication system', context)).toMatchObject({ output: 'session owner result' });
      expect(calls).toEqual([['set', 'Build', 'authentication', 'system']]);
    });
  });

  describe("/loop command", () => {
    it("spends no turn on a gate that already passes", async () => {
      const result = await runLoopCommand(["3", "echo 'hello'"], { cwd: tempDir });

      expect(result.kind).toBe("local");
      if (result.kind === "local") {
        expect(result.output).toContain("already passes");
        expect(result.output).not.toMatch(/will now drive|Armed autonomous/);
      }
    });

    it("hands a failing gate to the model with its own output as the evidence", async () => {
      const result = await runLoopCommand(["2", "echo 'boom' 1>&2; exit 1"], { cwd: tempDir });

      expect(result.kind).toBe("prompt");
      if (result.kind === "prompt") {
        expect(result.prompt).toContain("boom");
        expect(result.prompt).toContain("at most 2 attempts");
      }
    });
  });

  describe("/todo command", () => {
    it("lists the current tasks without creating one named list", async () => {
      const context = { cwd: tempDir, sessionId: "sess_todo_list" };
      await routeSlashCommand("/todo clear", context);
      await routeSlashCommand("/todo add existing task", context);
      const listed = await routeSlashCommand("/todo list", context);
      expect(listed).toMatchObject({ kind: "local", output: expect.stringContaining("Session Task Checklist") });
      expect(getSessionTodos(context.sessionId).map((item) => item.text)).toEqual(["existing task"]);
    });

    it.each(["lits", "some task text", "clear unexpected", "list unexpected"])("rejects /todo %s without changing the checklist", async (args) => {
      const context = { cwd: tempDir, sessionId: "sess_todo_unknown" };
      await routeSlashCommand("/todo clear", context);
      await routeSlashCommand("/todo add existing task", context);
      const result = await routeSlashCommand(`/todo ${args}`, context);
      expect(result).toMatchObject({ kind: "local", output: expect.stringContaining("Usage: /todo list") });
      expect(getSessionTodos(context.sessionId).map((item) => item.text)).toEqual(["existing task"]);
    });

    it("adds tasks, marks them in_progress and done, and visualizes checklist", async () => {
      // The list is per session now, so the test drives one session the way
      // the surface does: named, and read back through the same id.
      const session = "sess_todo_workflow";
      await runTodoCommand(["clear"], { cwd: tempDir }, session);

      // Add tasks
      await runTodoCommand(["add", "Write unit tests"], { cwd: tempDir }, session);
      await runTodoCommand(["add", "Refactor session manager"], { cwd: tempDir }, session);

      expect(getSessionTodos(session).length).toBe(2);

      // Start task 1
      await runTodoCommand(["start", "1"], { cwd: tempDir }, session);
      expect(getSessionTodos(session)[0].status).toBe("in_progress");

      // Complete task 1
      await runTodoCommand(["done", "1"], { cwd: tempDir }, session);
      expect(getSessionTodos(session)[0].status).toBe("done");

      // Render checklist
      const viewRes = await runTodoCommand([], { cwd: tempDir }, session);
      expect(viewRes.output).toContain("Session Task Checklist");
      expect(viewRes.output).toContain("[X] **#1**: Write unit tests *(done)*");
      expect(viewRes.output).toContain("[ ] **#2**: Refactor session manager *(pending)*");
      expect(viewRes.output).toContain("Progress: **1/2** (50%)");
    });
  });

  describe("/fast command", () => {
    it("requires a selected session model before changing a provider tier", async () => {
      const onRes = await runFastCommand(["on"], { cwd: tempDir });
      expect(onRes.output).toContain('requires an active session');

      const offRes = await runFastCommand(["off"], { cwd: tempDir });
      expect(offRes.output).toContain('requires an active session');
      expect(readProjectState(tempDir).fastSampling).toBeUndefined();
    });
  });

  describe("/context command", () => {
    it("says nothing has been measured yet instead of inventing a footprint", async () => {
      const result = await runContextCommand([], { cwd: tempDir, sessionId: "sess_ctx_test" });

      // The old version fell back to a literal 2,500-token footprint and split it
      // 35/1200/remainder under a heading that called the numbers measured.
      expect(result.kind).toBe("local");
      expect(result.output).toContain("Current prompt usage is unknown");
      expect(result.output).toContain("64,000 tokens");
      expect(result.output).toMatch(/Current tool schema estimate: ~\d/);
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
      // A passing gate answers locally; a failing one expands into a repair prompt.
      expect((await routeSlashCommand("/loop 2 exit 0", { cwd: tempDir }))?.kind).toBe("local");
      expect((await routeSlashCommand("/loop 2 exit 1", { cwd: tempDir }))?.kind).toBe("prompt");
    });
  });
});
