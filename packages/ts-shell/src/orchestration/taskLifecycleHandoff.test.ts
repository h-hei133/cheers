import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { activateTaskLifecycle } from "./taskLifecycleActivation.js";
import { buildTaskLifecycleHandoff } from "./taskLifecycleHandoff.js";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "task-lifecycle-handoff-"));
  await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, "src", "target.ts"), "export const value = 1;\n");
  await fs.writeFile(path.join(workspaceRoot, "src", "target.test.ts"), "expect(1).toBe(1);\n");
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("buildTaskLifecycleHandoff", () => {
  it("passes lifecycle ids to provider, verification, and repair handoff without running them", async () => {
    const workflowPlan: WorkflowTaskPlan = {
      taskKind: "read-file",
      reason: "plan target",
      targetPath: "src/target.ts",
      contextPlanningRequested: true,
      contextPlanningReason: "explicit-context-packet",
      inspectFirst: true,
      verifyAfterEdit: false,
      verifyCommand: "npm test -- --help",
    };
    const activation = await activateTaskLifecycle({
      workspaceRoot,
      prompt: "Plan src/target.ts and include verification readiness.",
      workflowPlan,
    });

    const handoff = buildTaskLifecycleHandoff({
      activation: activation!,
      verification: {
        status: "failed",
        command: "npm test -- --help",
        reason: "expected failure fixture",
        nextAction: "repair after failed verification",
      },
      failedFiles: [{ path: "src/target.ts", reason: "expected failure fixture" }],
      changedFiles: [],
      runtimeReceiptMarkers: ["runtime-receipt:failed"],
      failureExcerpt: "expected failure fixture",
    });

    expect(handoff.providerProposal.lifecycleId).toBe(activation?.taskLifecycle.lifecycleId);
    expect(handoff.providerProposal.analysisBriefId).toBe(activation?.analysisBrief.briefId);
    expect(handoff.providerProposal.providerCall).toBe("not-run");
    expect(handoff.verificationCommandPlan.sourceTaskLifecycleId).toBe(activation?.taskLifecycle.lifecycleId);
    expect(handoff.verificationCommandPlan.sourceTaskExecutionPlanId).toBe(
      activation?.taskExecutionPlan.executionPlanId,
    );
    expect(handoff.repairContext?.sourceTaskLifecycleId).toBe(activation?.taskLifecycle.lifecycleId);
    expect(handoff.repairContext?.sourceAnalysisBriefId).toBe(activation?.analysisBrief.briefId);
    expect(handoff.evidence).toContain("task-lifecycle-handoff:command-dispatch:not-run");
  });
});
