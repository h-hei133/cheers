import { afterEach, beforeEach, describe, expect, it } from "vitest";
import nodeFs from "node:fs";
import nodeOs from "node:os";
import nodePath from "node:path";
import { DAGResolver } from "./dagResolver.js";
import { ParallelDispatcher } from "./parallelDispatcher.js";
import { runWorkflowCommand } from "../commands/workflowCommandRuntime.js";
import { routeSlashCommand } from "../commands/slashRouter.js";
import { readWorkflow } from './definition.js';
import { runRecordPath } from './runStore.js';
import type { WorkflowTask, WorkflowStage } from "./types.js";

describe("Workflow & Agentic SDLC Subsystem Test Suite", () => {

  describe("DAGResolver (Kahn's Algorithm & Cycle Detection)", () => {
    it("computes topological execution batches for parallel-ready tasks", () => {
      const tasks: WorkflowTask[] = [
        { id: "A", name: "Task A", dependencies: [], status: "pending" },
        { id: "B", name: "Task B", dependencies: ["A"], status: "pending" },
        { id: "C", name: "Task C", dependencies: ["A"], status: "pending" },
        { id: "D", name: "Task D", dependencies: ["B", "C"], status: "pending" },
      ];

      const res = DAGResolver.resolve(tasks);
      expect(res.isValid).toBe(true);
      expect(res.executionBatches).toEqual([["A"], ["B", "C"], ["D"]]);
    });

    it("detects duplicate task IDs and returns clear error", () => {
      const duplicateTasks: WorkflowTask[] = [
        { id: "A", name: "Task A", dependencies: [], status: "pending" },
        { id: "A", name: "Task A Duplicate", dependencies: [], status: "pending" },
      ];

      const res = DAGResolver.resolve(duplicateTasks);
      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toContain("Duplicate task ID detected");
    });

    it("detects circular dependencies and returns cycle path", () => {
      const cyclicTasks: WorkflowTask[] = [
        { id: "X", name: "Task X", dependencies: ["Z"], status: "pending" },
        { id: "Y", name: "Task Y", dependencies: ["X"], status: "pending" },
        { id: "Z", name: "Task Z", dependencies: ["Y"], status: "pending" },
      ];

      const res = DAGResolver.resolve(cyclicTasks);
      expect(res.isValid).toBe(false);
      expect(res.cycleDetected).toBe(true);
      expect(res.errorMessage).toContain("Circular dependency detected");
    });
  });

  describe("ParallelDispatcher", () => {
    it("executes tasks in parallel pool with bounded concurrency", async () => {
      const thunks = [
        async () => 1 * 10,
        async () => 2 * 10,
        async () => 3 * 10,
        async () => 4 * 10,
      ];

      const results = await ParallelDispatcher.run(thunks, { maxConcurrency: 2 });
      expect(results).toEqual([10, 20, 30, 40]);
    });

  });

  describe("/workflow, end to end", () => {
    let project: string;
    let home: string;
    let realHome: string | undefined;
    let realProfile: string | undefined;

    function define(name: string, steps: unknown, extra: Record<string, unknown> = {}): void {
      const dir = nodePath.join(project, ".agents", "workflows");
      nodeFs.mkdirSync(dir, { recursive: true });
      nodeFs.writeFileSync(
        nodePath.join(dir, `${name}.json`),
        JSON.stringify({ name, steps, ...extra }),
        "utf8",
      );
    }

    beforeEach(() => {
      project = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "wf-project-"));
      home = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "wf-home-"));
      nodeFs.mkdirSync(nodePath.join(project, ".git"), { recursive: true });
      realHome = process.env.HOME;
      realProfile = process.env.USERPROFILE;
      process.env.HOME = home;
      delete process.env.USERPROFILE;
    });

    afterEach(() => {
      if (realHome === undefined) delete process.env.HOME;
      else process.env.HOME = realHome;
      if (realProfile !== undefined) process.env.USERPROFILE = realProfile;
      nodeFs.rmSync(project, { recursive: true, force: true });
      nodeFs.rmSync(home, { recursive: true, force: true });
    });

    it("refuses to run a workflow when the project is marked untrusted", async () => {
      // A workflow is a list of commands this process runs. Asking for one by name
      // says nothing about what is inside it, so an untrusted project does not get
      // to supply them.
      define("danger", [{ id: "boom", run: "touch " + nodePath.join(project, "ran.txt") }]);

      const result = await runWorkflowCommand(["run", "danger"], { cwd: project }, false);

      expect(result.output).toContain("untrusted");
      expect(nodeFs.existsSync(nodePath.join(project, "ran.txt"))).toBe(false);
    });

    it("refuses unbound execution even for a project nobody has ruled on", async () => {
      define("fine", [{ id: "ok", run: "touch UNBOUND" }]);

      const result = await runWorkflowCommand(["run", "fine"], { cwd: project });

      expect(result.output).not.toContain("untrusted");
      expect(result.output).toContain("bound session runtime and ordinary command approval");
      expect(nodeFs.existsSync(nodePath.join(project, "UNBOUND"))).toBe(false);
    });

    it("says nothing has run rather than showing progress it never observed", async () => {
      const status = await runWorkflowCommand(["status"], { cwd: project });

      expect(status.output).toContain("No workflow has run in this project yet");
      expect(status.output).not.toMatch(/RUNNING|Batch Progress/);
    });

    it("lists the workflows the project actually has", async () => {
      define("verify", [{ id: "ok", run: "exit 0" }], { description: "a real one" });
      const list = await runWorkflowCommand(["list"], { cwd: project });

      expect(list.output).toContain("`verify` (1 steps) — a real one");
    });

    it('hashes exact UTF-8 source and refuses invalid byte encodings and oversized definitions', () => {
      define('bytes', [{ id: 'one', run: 'exit 0' }]); const source = nodePath.join(project, '.agents/workflows/bytes.json');
      const before = readWorkflow(project, 'bytes'); nodeFs.appendFileSync(source, '\n'); const after = readWorkflow(project, 'bytes');
      expect(before).toHaveProperty('workflow'); expect(after).toHaveProperty('workflow');
      if ('workflow' in before && 'workflow' in after) expect(after.workflow.fingerprint).not.toBe(before.workflow.fingerprint);
      nodeFs.writeFileSync(source, Buffer.concat([Buffer.from('{"description":"'), Buffer.from([0x80]), Buffer.from('","steps":[{"id":"one","run":"exit 0"}]}')]));
      expect(readWorkflow(project, 'bytes')).toHaveProperty('error');
      nodeFs.writeFileSync(source, ' '.repeat(512 * 1024 + 1)); expect(readWorkflow(project, 'bytes')).toHaveProperty('error');
    });

    it('keeps legacy inspection read-only, report-safe and resilient to malformed nested records', async () => {
      const record = runRecordPath(project); nodeFs.mkdirSync(nodePath.dirname(record), { recursive: true });
      const legacy = { name: 'verify', startedAt: 'legacy', finishedAt: 'legacy', status: 'failed', batches: [['one']],
        steps: [{ id: 'one', status: 'failed', exitCode: 3, output: 'Authorization: Bearer SYNTHETIC_WORKFLOW_SECRET' }] };
      nodeFs.writeFileSync(record, JSON.stringify(legacy)); const before = nodeFs.readFileSync(record);
      const result = await runWorkflowCommand(['status'], { cwd: project });
      expect(result.output).toContain('failed (exit 3)'); expect(result.output).not.toContain('SYNTHETIC_WORKFLOW_SECRET');
      expect(nodeFs.readFileSync(record)).toEqual(before);
      nodeFs.writeFileSync(record, JSON.stringify({ ...legacy, steps: [null], batches: [null] }));
      expect((await runWorkflowCommand(['status'], { cwd: project })).output).toContain('No workflow has run');
    });

    it("offers a file shape instead of built-in templates when there are none", async () => {
      const list = await runWorkflowCommand(["list"], { cwd: project });

      expect(list.output).toContain("No workflows in");
      expect(list.output).not.toMatch(/feature-delivery|adversarial-review|auto-repair/);
    });

    // Native execution, failure output and restart inspection are exercised by
    // cli/jobs/dag/command.test.ts through the bound ordinary tool gates.

    it("refuses a graph with a cycle instead of running half of it", async () => {
      define("cyclic", [
        { id: "a", run: "exit 0", needs: ["b"] },
        { id: "b", run: "exit 0", needs: ["a"] },
      ]);
      const result = await runWorkflowCommand(["run", "cyclic"], { cwd: project });

      expect(result.output).toMatch(/circular dependency/i);
    });

    it("names a dependency that does not exist", async () => {
      define("broken", [{ id: "a", run: "exit 0", needs: ["ghost"] }]);
      const result = await runWorkflowCommand(["run", "broken"], { cwd: project });

      expect(result.output).toContain("non-existent task 'ghost'");
    });

    it("reports a malformed definition rather than skipping it", async () => {
      const dir = nodePath.join(project, ".agents", "workflows");
      nodeFs.mkdirSync(dir, { recursive: true });
      nodeFs.writeFileSync(nodePath.join(dir, "bad.json"), "{ not json", "utf8");
      const result = await runWorkflowCommand(["run", "bad"], { cwd: project });

      expect(result.output).toContain("not valid JSON");
    });

    it("requires each step to carry a command", async () => {
      define("empty", [{ id: "a" }]);
      const result = await runWorkflowCommand(["run", "empty"], { cwd: project });

      expect(result.output).toContain('step "a" needs a "run" command');
    });

    it("asks which workflow when told to run nothing", async () => {
      const result = await runWorkflowCommand(["run"], { cwd: project });

      expect(result.output).toContain("Which workflow?");
    });

    it("routes /workflow through slashRouter", async () => {
      const routed = await routeSlashCommand("/workflow list", { cwd: project });

      expect(routed?.kind).toBe("local");
      if (routed?.kind === "local") expect(routed.output).toContain("No workflows in");
    });
  });
});
