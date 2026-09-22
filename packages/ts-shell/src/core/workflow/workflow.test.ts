import { afterEach, beforeEach, describe, expect, it } from "vitest";
import nodeFs from "node:fs";
import nodeOs from "node:os";
import nodePath from "node:path";
import { DAGResolver } from "./dagResolver.js";
import { WorkflowContextInjector } from "./contextInjector.js";
import { PipelineExecutor } from "./pipelineExecutor.js";
import { ParallelDispatcher } from "./parallelDispatcher.js";
import { CacheStaggeringDispatcher } from "./cacheStaggering.js";
import { BuilderValidatorPipeline } from "./builderValidator.js";
import { AdversarialRefuterPipeline } from "./adversarialRefuter.js";
import { runWorkflowCommand } from "../commands/workflowCommandRuntime.js";
import { routeSlashCommand } from "../commands/slashRouter.js";
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

  describe("WorkflowContextInjector", () => {
    it("binds relevant facts and constraints to task envelope", () => {
      const task: WorkflowTask = {
        id: "task_auth_fix",
        name: "Fix OAuth Token Expiry",
        description: "Ensure JWT expiration is strictly validated",
        dependencies: [],
        status: "pending",
      };

      const injected = WorkflowContextInjector.inject(task, "Security Compliance Goal");
      expect(injected.taskId).toBe("task_auth_fix");
      expect(injected.promptHeader).toContain("Task Context: Fix OAuth Token Expiry");
    });
  });

  describe("PipelineExecutor (Stage Barriers)", () => {
    it("executes stages sequentially with barrier synchronization", async () => {
      const executionOrder: string[] = [];

      const stages: WorkflowStage[] = [
        {
          id: "stage_1",
          name: "Preparation",
          barrier: true,
          status: "pending",
          tasks: [
            { id: "s1_t1", name: "Init Repo", dependencies: [], status: "pending" },
            { id: "s1_t2", name: "Load Rules", dependencies: [], status: "pending" },
          ],
        },
        {
          id: "stage_2",
          name: "Implementation",
          barrier: true,
          status: "pending",
          tasks: [{ id: "s2_t1", name: "Write Code", dependencies: [], status: "pending" }],
        },
      ];

      const result = await PipelineExecutor.execute(stages, async (task) => {
        executionOrder.push(task.id);
        return { completed: task.id };
      });

      expect(result.success).toBe(true);
      expect(result.completedStages).toBe(2);
      expect(executionOrder.indexOf("s1_t1")).toBeLessThan(executionOrder.indexOf("s2_t1"));
      expect(executionOrder.indexOf("s1_t2")).toBeLessThan(executionOrder.indexOf("s2_t1"));
    });
  });

  describe("ParallelDispatcher & CacheStaggeringDispatcher", () => {
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

    it("staggers dispatch to allow warm prompt cache establishment", async () => {
      const timestamps: number[] = [];
      const items = ["A", "B", "C"];

      await CacheStaggeringDispatcher.dispatchStaggered(
        items,
        async (item) => {
          timestamps.push(Date.now());
          return item;
        },
        { staggerIntervalMs: 20 },
      );

      expect(timestamps.length).toBe(3);
      expect(timestamps[2] - timestamps[0]).toBeGreaterThanOrEqual(30);
    });
  });

  describe("BuilderValidatorPipeline & AdversarialRefuterPipeline", () => {
    it("executes decoupled builder and independent validator", async () => {
      const criteria = [
        { id: "c1", description: "Must pass lint", required: true },
        { id: "c2", description: "Must have unit test", required: true },
      ];

      const outcome = await BuilderValidatorPipeline.execute(
        "Build feature",
        criteria,
        async () => ({
          solution: "const a = 1;",
          modifiedFiles: ["src/index.ts"],
        }),
        async () => ({
          passed: true,
          criteriaResults: [
            { criterionId: "c1", passed: true, observation: "Clean code" },
            { criterionId: "c2", passed: true, observation: "Test included" },
          ],
          overallFeedback: "All green",
          detectedIssues: [],
        }),
      );

      expect(outcome.success).toBe(true);
      expect(outcome.builderOutput.modifiedFiles).toContain("src/index.ts");
    });

    it("filters out refuted findings in adversarial review pipeline", async () => {
      const outcome = await AdversarialRefuterPipeline.evaluate(
        "const token = secret;",
        async () => [
          {
            id: "d1",
            title: "Hardcoded secret",
            description: "Secret is exposed",
            severity: "critical",
          },
          {
            id: "d2",
            title: "Performance issue in loop",
            description: "O(N^2) detected",
            severity: "medium",
          },
        ],
        async (defect) => {
          if (defect.id === "d2") {
            return {
              defectId: "d2",
              isRefuted: true,
              refutationReason: "Array size is strictly constant (N=3)",
              confidence: 1.0,
            };
          }
          return {
            defectId: "d1",
            isRefuted: false,
            refutationReason: "Confirmed secret token",
            confidence: 1.0,
          };
        },
      );

      expect(outcome.totalProposed).toBe(2);
      expect(outcome.totalRefuted).toBe(1);
      expect(outcome.confirmedDefects.length).toBe(1);
      expect(outcome.confirmedDefects[0].id).toBe("d1");
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

    it("still runs a workflow for a project nobody has ruled on", async () => {
      define("fine", [{ id: "ok", run: "exit 0" }]);

      const result = await runWorkflowCommand(["run", "fine"], { cwd: project });

      expect(result.output).not.toContain("untrusted");
      expect(result.output).toContain("ok");
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

    it("offers a file shape instead of built-in templates when there are none", async () => {
      const list = await runWorkflowCommand(["list"], { cwd: project });

      expect(list.output).toContain("No workflows in");
      expect(list.output).not.toMatch(/feature-delivery|adversarial-review|auto-repair/);
    });

    it("runs every step and reports the exit codes it saw", async () => {
      define("verify", [
        { id: "first", run: "exit 0" },
        { id: "second", run: "exit 0", needs: ["first"] },
      ]);
      const result = await runWorkflowCommand(["run", "verify"], { cwd: project });

      expect(result.output).toContain("passed");
      expect(result.output).toContain("Every step passed");
      expect(result.output).toContain("2 batches");
    });

    it("stops at a failing batch and reports what never ran", async () => {
      define("verify", [
        { id: "gate", run: "echo boom 1>&2; exit 3" },
        { id: "after", run: "exit 0", needs: ["gate"] },
      ]);
      const result = await runWorkflowCommand(["run", "verify"], { cwd: project });

      expect(result.output).toContain("`gate` failed (exit 3)");
      expect(result.output).toContain("`after` skipped");
      expect(result.output).toContain("boom");
      expect(result.output).toContain("never ran");
    });

    it("recalls the last run after the process that ran it is gone", async () => {
      define("verify", [{ id: "ok", run: "exit 0" }]);
      await runWorkflowCommand(["run", "verify"], { cwd: project });
      const status = await runWorkflowCommand(["status"], { cwd: project });

      expect(status.output).toContain("Workflow `verify` — passed");
    });

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
