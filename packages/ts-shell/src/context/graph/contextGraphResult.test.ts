import { describe, expect, it } from "vitest";

import type { ContextGraph } from "./contextGraph.js";
import type { ContextGraphScore } from "./contextGraphScore.js";
import { buildContextGraphResult } from "./contextGraphResult.js";
import type { TestImpactPlan } from "../../planning/task/testImpactPlan.js";

describe("buildContextGraphResult", () => {
  it("projects graph and test-impact facts without raw content", () => {
    const graph: ContextGraph = {
      graphId: "ctx_graph_result",
      rootTarget: "src/target.ts",
      nodes: [],
      edges: [],
      includedCandidates: [
        {
          nodeId: "node-root",
          kind: "root-target",
          pathLabel: "src/target.ts",
          relation: "target",
          sourceKind: "target-packet",
          depth: 0,
          reason: "target",
          budgetStatus: "included",
          confidence: "high",
          redactionStatus: "redacted-and-budgeted",
        },
      ],
      omittedCandidates: [],
      mutationAuthority: "not-granted",
      redactionStatus: "redacted-and-budgeted",
      replaySafeSummary: "context-graph ctx_graph_result",
      evidence: ["context-graph:raw-content-excluded"],
    };
    const score: ContextGraphScore = {
      graphId: graph.graphId,
      rootTargetConfidence: "high",
      importCoverage: 0,
      testCoverage: 0,
      docsCoverage: 0,
      callSiteCoverage: 0,
      omittedRiskLevel: "none",
      planningReadiness: "needs-more-context",
      coverageScore: 0,
      evidence: ["context-graph-score:readiness:needs-more-context"],
    };
    const testImpact: TestImpactPlan = {
      impactPlanId: "test_impact_result",
      graphId: graph.graphId,
      likelyTestFiles: [],
      likelyVerificationCommandCandidates: [],
      confidence: "low",
      missingTestContext: ["no nearby test files included"],
      suggestedReads: ["src/target.test.ts"],
      commandReadiness: "missing-verification",
      noWriteEvidence: ["test-impact:mutation-authority:not-granted"],
      replaySafeSummary: "test-impact test_impact_result",
      evidence: ["test-impact:commands:not-executed"],
    };

    const result = buildContextGraphResult({ graph, score, testImpact });

    expect(result.outcome).toBe("no-related-context-found");
    expect(result.output).toContain("Mutation authority: not-granted");
    expect(result.output).toContain("Raw content: excluded");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "context-graph-result:mutation-authority:not-granted",
        "context-graph-result:raw-content-excluded",
      ]),
    );
  });
});
