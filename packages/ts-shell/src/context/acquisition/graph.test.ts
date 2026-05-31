import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildContextGraphPlanningBundle } from "./graph.js";
import type { WorkflowTaskPlan } from "../../orchestration/workflowTaskPlanner.js";

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
    "import { helperValue } from '../../orchestration/helper.js';\nexport function targetThing() { return helperValue(); }\n",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "target.test.ts"),
    "import { targetThing } from '../../orchestration/target.js';\nexpect(targetThing()).toBe(1);\n",
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
    expect(bundle.stagedContextAcquisition.acquisitionFactsId).toMatch(/^staged_context_acquisition_/);
    expect(bundle.stagedContextAcquisition.stagedReadPlan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "src/target.ts",
          readStage: "initial-high-value-read",
          readPriority: "high",
          rawContentPolicy: "raw-content-excluded",
          expectedDownstreamConsumer: "context-graph-planning",
          notProvenClaims: expect.arrayContaining([
            "read-planned-is-not-read-completed",
            "read-completed-is-not-enough-context",
          ]),
        }),
      ]),
    );
    expect(bundle.stagedContextAcquisition.readBudget).toMatchObject({
      budgetKind: "bounded-context-packet",
      filesRead: bundle.packet.readBudget.filesRead,
      filesSkipped: bundle.packet.omittedCandidateSummaries.length,
      nextReadAvailable: bundle.taskReadPlan.suggestedNextReads.length > 0,
    });
    expect(bundle.stagedContextAcquisition.packetProvenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packetId: bundle.packet.packetId,
          sourceFilePath: "src/target.ts",
          readStage: "initial-high-value-read",
          rawContentRedactionStatus: "raw-content-excluded",
          derivedSummaryStatus: "summary-derived",
          downstreamUse: "context-graph-planning",
          notProvenClaims: expect.arrayContaining([
            "context-packet-exists-is-not-repository-understanding",
          ]),
        }),
      ]),
    );
    expect(bundle.stagedContextAcquisition.graphScoring.components).toMatchObject({
      taskTokenRelevance: "unavailable",
      symbolHintRelevance: "unavailable",
      packageOrModuleProximity: "unavailable",
      fileRole: "unavailable",
    });
    expect(bundle.stagedContextAcquisition.graphScoring.unavailableComponents).toEqual(
      expect.arrayContaining(["task-token-relevance", "symbol-hint-relevance"]),
    );
    expect(bundle.stagedContextAcquisition.impactTrace.factClassifications.map((fact) => fact.classification)).toEqual(
      expect.arrayContaining(["observed", "inferred"]),
    );
    expect(bundle.stagedContextAcquisition.staleContext).toMatchObject({
      status: "fresh",
      sufficiencyDowngrade: false,
    });
    expect(bundle.stagedContextAcquisition.sufficiencyDecision.notProvenClaims).toEqual(
      expect.arrayContaining([
        "sufficient-for-review-only-planning-is-not-edit-authority",
        "sufficient-for-review-only-planning-is-not-task-success",
      ]),
    );
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

  it("keeps partial context, next reads, and redaction facts visible without success inflation", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "src", "largeContext.ts"),
      `export const largeContext = "${"x".repeat(8_200)}";\n`,
    );
    const workflowPlan: WorkflowTaskPlan = {
      taskKind: "edit-file",
      reason: "Fix targetThing token=secret oldText=before newText=after raw provider output: nope hidden reasoning",
      targetPath: "src/target.ts",
      contextPlanningRequested: true,
      contextPlanningReason: "explicit-context-packet",
      inspectFirst: true,
      verifyAfterEdit: true,
    };

    const bundle = await buildContextGraphPlanningBundle({
      workspaceRoot,
      targetPath: "src/target.ts",
      workflowPlan,
    });
    const facts = bundle.stagedContextAcquisition;
    const serialized = JSON.stringify(facts);

    expect(facts.readBudget.filesSkipped).toBeGreaterThan(0);
    expect(facts.readBudget.skippedReasonCategories).toEqual(
      expect.arrayContaining(["file byte budget exceeded"]),
    );
    expect(facts.readBudget.budgetExhausted).toBe(true);
    expect(facts.nextReadSuggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "src/largeContext.ts",
          notProvenClaims: expect.arrayContaining(["next-read-suggestion-is-not-completed-read"]),
        }),
      ]),
    );
    expect(facts.sufficiencyDecision.status).toBe("budget_exhausted");
    expect(facts.requiredMissingFacts.length + facts.optionalMissingFacts.length).toBeGreaterThan(0);
    expect(facts.evidence).toEqual(
      expect.arrayContaining([
        "staged-context-acquisition:mutation-authority:not-granted",
        "staged-context-acquisition:provider-call:not-run",
        "staged-context-acquisition:command-dispatch:not-run",
        "staged-context-acquisition:raw-content-excluded",
      ]),
    );
    expect(facts.notProvenClaims).toEqual(
      expect.arrayContaining([
        "context-packet-exists-is-not-repository-understanding",
        "graph-edge-observed-is-not-full-impact-proof",
        "next-read-suggestion-is-not-completed-read",
      ]),
    );
    expect(serialized).not.toMatch(/token=secret|oldText=before|newText=after|raw provider output: nope|hidden reasoning/i);
  });
});
