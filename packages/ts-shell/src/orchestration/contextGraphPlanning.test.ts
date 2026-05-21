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
    expect(bundle.testImpact.likelyTestFiles).toContain("src/target.test.ts");
    expect(bundle.agentPlan.contextGraphIds).toEqual([bundle.graph.graphId]);
    expect(bundle.agentPlan.suggestedVerification).toContain("npm test -- --help");
    expect(bundle.graphResult.evidence).toContain(
      "context-graph-result:mutation-authority:not-granted",
    );
  });
});
