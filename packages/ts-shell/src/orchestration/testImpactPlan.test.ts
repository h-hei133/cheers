import { describe, expect, it } from "vitest";

import type { ContextGraph } from "./contextGraph.js";
import type { ContextGraphScore } from "./contextGraphScore.js";
import { buildTestImpactPlan } from "./testImpactPlan.js";

describe("buildTestImpactPlan", () => {
  it("suggests likely tests and keeps targeted test commands outside the ready allowlist", () => {
    const graph = graphWithTests();
    const score: ContextGraphScore = {
      graphId: graph.graphId,
      rootTargetConfidence: "high",
      importCoverage: 1,
      testCoverage: 1,
      docsCoverage: 1,
      callSiteCoverage: 1,
      omittedRiskLevel: "none",
      planningReadiness: "context-ready",
      coverageScore: 100,
      evidence: [],
    };

    const plan = buildTestImpactPlan({ graph, score });

    expect(plan.likelyTestFiles).toEqual(["src/target.test.ts"]);
    expect(plan.commandReadiness).toBe("ready");
    expect(plan.likelyVerificationCommandCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: "npm test -- --help",
          readiness: "ready",
        }),
        expect.objectContaining({
          command: "npm test -- src/target.test.ts",
          readiness: "not-allowlisted",
        }),
      ]),
    );
    expect(plan.noWriteEvidence).toContain("test-impact:commands:not-executed");
  });
});

function graphWithTests(): ContextGraph {
  return {
    graphId: "ctx_graph_test",
    rootTarget: "src/target.ts",
    nodes: [],
    edges: [],
    includedCandidates: [
      {
        nodeId: "node-root",
        kind: "root-target",
        pathLabel: "src/target.ts",
        relation: "explicit target",
        sourceKind: "target-packet",
        depth: 0,
        reason: "target",
        budgetStatus: "included",
        confidence: "high",
        redactionStatus: "redacted-and-budgeted",
      },
      {
        nodeId: "node-test",
        kind: "nearby-test",
        pathLabel: "src/target.test.ts",
        relation: "nearby test",
        sourceKind: "test-convention",
        depth: 1,
        reason: "test convention",
        budgetStatus: "included",
        confidence: "high",
        redactionStatus: "redacted-and-budgeted",
      },
    ],
    omittedCandidates: [],
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    replaySafeSummary: "context-graph ctx_graph_test",
    evidence: [],
  };
}
