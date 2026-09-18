import { describe, expect, it } from "vitest";

import type { ContextGraph } from "./contextGraph.js";
import { scoreContextGraph } from "./contextGraphScore.js";

describe("scoreContextGraph", () => {
  it("scores coverage and classifies planning readiness", () => {
    const graph: ContextGraph = {
      graphId: "ctx_graph_score",
      rootTarget: "src/target.ts",
      rootPacketId: "ctx_packet",
      nodes: [],
      edges: [],
      includedCandidates: [
        node("root-target", "src/target.ts", "high"),
        node("direct-import", "src/helper.ts", "high"),
        node("nearby-test", "src/target.test.ts", "high"),
        node("docs-readme", "README.md", "low"),
        node("reverse-call-site", "src/consumer.ts", "medium"),
        node("second-hop-candidate", "src/leaf.ts", "medium"),
      ],
      omittedCandidates: [],
      mutationAuthority: "not-granted",
      redactionStatus: "redacted-and-budgeted",
      replaySafeSummary: "context-graph ctx_graph_score",
      evidence: [],
    };

    const score = scoreContextGraph(graph);

    expect(score.coverageScore).toBe(100);
    expect(score.planningReadiness).toBe("context-ready");
    expect(score.evidence).toContain("context-graph-score:readiness:context-ready");
  });

  it("marks budget-limited graphs when omitted candidates hit budgets", () => {
    const graph: ContextGraph = {
      graphId: "ctx_graph_budget",
      rootTarget: "src/target.ts",
      nodes: [],
      edges: [],
      includedCandidates: [node("root-target", "src/target.ts", "high")],
      omittedCandidates: [
        {
          ...node("omitted-candidate", "src/target.test.ts", "low"),
          budgetStatus: "omitted",
          omissionReason: "over-node-budget",
        },
      ],
      mutationAuthority: "not-granted",
      redactionStatus: "redacted-and-budgeted",
      replaySafeSummary: "context-graph ctx_graph_budget",
      evidence: [],
    };

    expect(scoreContextGraph(graph).planningReadiness).toBe("budget-limited");
  });
});

function node(
  kind: ContextGraph["includedCandidates"][number]["kind"],
  pathLabel: string,
  confidence: "high" | "medium" | "low",
): ContextGraph["includedCandidates"][number] {
  return {
    nodeId: `node-${pathLabel}`,
    kind,
    pathLabel,
    relation: "test",
    sourceKind: "target-packet",
    depth: kind === "second-hop-candidate" ? 2 : 1,
    reason: "test",
    budgetStatus: "included",
    confidence,
    redactionStatus: "redacted-and-budgeted",
  };
}
