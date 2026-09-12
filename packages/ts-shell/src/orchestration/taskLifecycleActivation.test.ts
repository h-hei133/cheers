import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  activateTaskLifecycle,
  formatTaskLifecycleActivationOutput,
} from "./taskLifecycleActivation.js";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "task-lifecycle-activation-"));
  await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await fs.writeFile(
    path.join(workspaceRoot, "src", "helper.ts"),
    "export function helperValue() { return 1; }\n",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "target.ts"),
    "import { helperValue } from './helper.js';\nexport function targetThing() { return helperValue(); }\n",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "target.test.ts"),
    "import { targetThing } from '../session/continuation/target.js';\nexpect(targetThing()).toBe(1);\n",
  );
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("activateTaskLifecycle", () => {
  it("creates lifecycle, analysis brief, execution plan, result, and harness facts from targeted prompts", async () => {
    const workflowPlan: WorkflowTaskPlan = {
      taskKind: "read-file",
      reason: "analyze target",
      targetPath: "src/target.ts",
      contextPlanningRequested: true,
      contextPlanningReason: "explicit-context-packet",
      inspectFirst: true,
      verifyAfterEdit: false,
    };

    const activation = await activateTaskLifecycle({
      workspaceRoot,
      prompt: "Analyze src/target.ts and make an execution plan.",
      workflowPlan,
    });

    expect(activation).toBeDefined();
    expect(activation?.taskLifecycle.lifecycleId).toMatch(/^task_lifecycle_/);
    expect(activation?.analysisBrief.briefId).toMatch(/^analysis_brief_/);
    expect(activation?.taskExecutionPlan.executionPlanId).toMatch(/^task_execution_plan_/);
    expect(activation?.agentPlan.taskLifecycleId).toBe(activation?.taskLifecycle.lifecycleId);
    expect(activation?.taskLifecycleTrace.planQualityId).toBe(activation?.planQuality.qualityId);
    expect(activation?.harnessScorecard.evidence).toContain(
      "harness-scorecard:mutation-authority:not-granted",
    );
    expect(activation?.runtimeOutcome.codingResult.changedFiles).toEqual([]);
    expect(activation?.runtimeOutcome.codingResult.evidence).toContain(
      "task-lifecycle-activation:provider-call:not-run",
    );
    expect(formatTaskLifecycleActivationOutput({ activation: activation! })).toContain("Current stage:");
  });

  it("stops broad missing-context prompts at read and analyze stages", async () => {
    const workflowPlan: WorkflowTaskPlan = {
      taskKind: "edit-file",
      reason: "write/edit intent without resolvable target",
      blockedReason: "The edit request did not identify one unique in-workspace target file.",
      targetMissing: true,
      contextPlanningRequested: true,
      contextPlanningReason: "missing-edit-context",
      inspectFirst: true,
      verifyAfterEdit: false,
    };

    const activation = await activateTaskLifecycle({
      workspaceRoot,
      prompt: "Fix it",
      workflowPlan,
    });

    expect(activation?.taskLifecycle.overallStatus).toBe("stopped");
    expect(activation?.taskLifecycle.currentStage).toBe("read");
    expect(activation?.analysisBrief.confidence).toBe("low");
    expect(activation?.taskExecutionPlan.proposalReadiness).toBe("needs-evidence");
    expect(activation?.taskLifecycleResult.output).toContain("Suggested reads:");
  });

});
