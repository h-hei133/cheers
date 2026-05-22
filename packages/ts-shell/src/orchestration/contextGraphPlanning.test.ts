import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildContextGraphPlanningBundle } from "./contextGraphPlanning.js";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "context-graph-planning-"));
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
    "import { targetThing } from './target.js';\nexpect(targetThing()).toBe(1);\n",
  );
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("buildContextGraphPlanningBundle", () => {
  it("feeds graph and test-impact facts into Agent Plan without mutation", async () => {
    const workflowPlan: WorkflowTaskPlan = {
      taskKind: "read-file",
      reason: "context graph planning test",
      targetPath: "src/target.ts",
      contextPlanningRequested: true,
      contextPlanningReason: "explicit-context-packet",
      inspectFirst: false,
      verifyAfterEdit: false,
    };

    const bundle = await buildContextGraphPlanningBundle({
      workspaceRoot,
      targetPath: "src/target.ts",
      workflowPlan,
    });

    expect(bundle.packet.packetId).toMatch(/^ctx_/);
    expect(bundle.graph.graphId).toMatch(/^ctx_graph_/);
    expect(bundle.codeGraphTrace.traceId).toMatch(/^code_graph_trace_/);
    expect(bundle.codeGraphImpact.impactQueryId).toMatch(/^code_graph_impact_/);
    expect(bundle.testImpact.likelyTestFiles).toContain("src/target.test.ts");
    expect(bundle.agentPlan.contextGraphIds).toEqual([bundle.graph.graphId]);
    expect(bundle.agentPlan.codeGraphTraceIds).toEqual([bundle.codeGraphTrace.traceId]);
    expect(bundle.agentPlan.impactQueryId).toBe(bundle.codeGraphImpact.impactQueryId);
    expect(bundle.agentPlan.likelyAffectedTests).toContain("src/target.test.ts");
    expect(bundle.agentPlan.suggestedVerification).toContain("npm test -- --help");
    expect(bundle.taskLifecycle.lifecycleId).toMatch(/^task_lifecycle_/);
    expect(bundle.taskReadPlan.requiredReads).toContain("src/target.ts");
    expect(bundle.analysisBrief.supportingEvidenceIds).toContain(bundle.taskReadPlan.readPlanId);
    expect(bundle.taskExecutionPlan.analysisBriefId).toBe(bundle.analysisBrief.briefId);
    expect(bundle.agentPlan.taskLifecycleId).toBe(bundle.taskLifecycle.lifecycleId);
    expect(bundle.agentPlan.analysisBriefId).toBe(bundle.analysisBrief.briefId);
    expect(bundle.agentPlan.taskExecutionPlanId).toBe(bundle.taskExecutionPlan.executionPlanId);
    expect(bundle.planQuality.taskLifecycleId).toBe(bundle.taskLifecycle.lifecycleId);
    expect(bundle.planQuality.analysisBriefId).toBe(bundle.analysisBrief.briefId);
    expect(bundle.harnessTrace.taskLifecycleId).toBe(bundle.taskLifecycle.lifecycleId);
    expect(bundle.harnessTrace.lifecycleStages).toContain("analyze");
    expect(bundle.taskLifecycleTrace.planQualityId).toBe(bundle.planQuality.qualityId);
    expect(bundle.taskLifecycleResult.evidence).toContain(
      "task-lifecycle-result:mutation-authority:not-granted",
    );
    expect(bundle.planQuality.impactQueryId).toBe(bundle.codeGraphImpact.impactQueryId);
    expect(bundle.codeGraphResult.evidence).toContain(
      "code-graph-result:mutation-authority:not-granted",
    );
    expect(bundle.graphResult.evidence).toContain(
      "context-graph-result:mutation-authority:not-granted",
    );
  });
});
