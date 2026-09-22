import { describe, expect, it } from "vitest";
import { buildContextGraph } from "./contextGraph.js";
import { buildContextGraphReadinessFacts } from "./contextGraphReadiness.js";
import { scoreContextGraph } from "./contextGraphScore.js";
import { buildTestImpactPlan } from "../../planning/task/testImpactPlan.js";

describe("contextGraphReadiness", () => {
  it("projects graph and test-impact facts without raw content", () => {
    const graph = buildContextGraph({
      rootTarget: "src/app.ts",
      rootPacketId: "ctx_packet_188",
      nodes: [
        node("root-target", "src/app.ts", "target", 0, "high"),
        node("direct-import", "src/lib.ts", "import", 1, "high"),
        node("nearby-test", "src/app.test.ts", "test", 1, "high"),
        node("docs-readme", "README.md", "docs", 1, "medium"),
        node("reverse-call-site", "src/main.ts", "call-site", 1, "medium"),
        node("second-hop-candidate", "src/helper.ts", "second-hop", 2, "medium"),
      ],
      edges: [],
    });
    const score = scoreContextGraph(graph);
    const testImpact = buildTestImpactPlan({ graph, score });

    const readiness = buildContextGraphReadinessFacts({ graph, score, testImpactPlan: testImpact });

    expect(readiness.graphReadiness).toBe("ready");
    expect(readiness.testImpactReadiness).toBe("ready");
    expect(readiness.reverseCallSiteConfidence).toBe("medium");
    expect(readiness.evidence).toEqual(
      expect.arrayContaining([
        "context-graph-readiness:graph-state:ready",
        "context-graph-readiness:test-impact:ready",
        "context-graph-readiness:raw-content-excluded",
      ]),
    );
  });
});

function node(
  kind: Parameters<typeof buildContextGraph>[0]["nodes"][number]["kind"],
  pathLabel: string,
  relation: string,
  depth: 0 | 1 | 2,
  confidence: "high" | "medium" | "low",
): Parameters<typeof buildContextGraph>[0]["nodes"][number] {
  return {
    kind,
    pathLabel,
    relation,
    sourceKind: "target-packet",
    depth,
    reason: relation,
    budgetStatus: "included",
    confidence,
    redactionStatus: "redacted-and-budgeted",
  };
}
