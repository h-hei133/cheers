import { describe, it, expect, beforeEach } from "vitest";
import { DAGResolver } from "./dagResolver.js";
import { WorkflowContextInjector } from "./contextInjector.js";
import { PipelineExecutor } from "./pipelineExecutor.js";
import { ParallelDispatcher } from "./parallelDispatcher.js";
import { CacheStaggeringDispatcher } from "./cacheStaggering.js";
import { BuilderValidatorPipeline } from "./builderValidator.js";
import { AdversarialRefuterPipeline } from "./adversarialRefuter.js";
import {
  runWorkflowCommand,
  getActiveWorkflow,
  resetActiveWorkflow,
} from "../commands/workflowCommandRuntime.js";
import { routeSlashCommand } from "../commands/slashRouter.js";
import type { WorkflowTask, WorkflowStage } from "./types.js";

describe("Workflow & Agentic SDLC Subsystem Test Suite", () => {
  beforeEach(() => {
    resetActiveWorkflow();
  });

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

  describe("/workflow Slash Command Integration", () => {
    it("runs, inspects, and cancels workflow execution", async () => {
      // 1. Initial status
      const initialStatus = await runWorkflowCommand(["status"], { cwd: process.cwd() });
      expect(initialStatus.output).toContain("No active workflow is currently running");

      // 2. Templates
      const listRes = await runWorkflowCommand(["list"], { cwd: process.cwd() });
      expect(listRes.output).toContain("feature-delivery");
      expect(listRes.output).toContain("adversarial-review");

      // 3. Start workflow
      const runRes = await runWorkflowCommand(["run", "feature-delivery"], { cwd: process.cwd() });
      expect(runRes.output).toContain("Workflow `feature-delivery` initiated");
      expect(getActiveWorkflow()).not.toBeNull();

      // 4. Status active
      const activeStatus = await runWorkflowCommand(["status"], { cwd: process.cwd() });
      expect(activeStatus.output).toContain("RUNNING");
      expect(activeStatus.output).toContain("Batch Progress");

      // 5. Cancel
      const cancelRes = await runWorkflowCommand(["cancel"], { cwd: process.cwd() });
      expect(cancelRes.output).toContain("cancelled");
      expect(getActiveWorkflow()).toBeNull();
    });

    it("routes /workflow through slashRouter", async () => {
      const routed = await routeSlashCommand("/workflow list", { cwd: process.cwd() });
      expect(routed?.kind).toBe("local");
      if (routed?.kind === "local") {
        expect(routed.output).toContain("feature-delivery");
      }
    });
  });
});
