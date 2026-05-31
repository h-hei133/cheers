import { describe, expect, it } from "vitest";

import { normalizeCodeGraphFacts } from "./facts.js";
import { buildContextGraph } from "../../../orchestration/contextGraph.js";
import { scoreContextGraph } from "../../../orchestration/contextGraphScore.js";
import { buildTestImpactPlan } from "../../../orchestration/testImpactPlan.js";

describe("normalizeCodeGraphFacts", () => {
  it("normalizes context graph nodes edges and verification candidates without raw content", () => {
    const graph = buildContextGraph({
      rootTarget: "src/app.ts",
      rootPacketId: "ctx_packet_189",
      nodes: [
        node("root-target", "src/app.ts", 0),
        node("direct-import", "src/lib.ts", 1),
        node("direct-export", "src/app.ts#runApp", 0),
        node("nearby-test", "src/app.test.ts", 1),
        node("docs-readme", "README.md", 1),
        node("reverse-call-site", "src/main.ts", 1),
      ],
      edges: [
        edge("src/app.ts", "src/lib.ts", "imports"),
        edge("src/app.ts", "src/app.test.ts", "tests"),
        edge("src/app.ts", "README.md", "documents"),
        edge("src/app.ts", "src/main.ts", "calls-or-references"),
      ],
    });
    const score = scoreContextGraph(graph);
    const testImpact = buildTestImpactPlan({ graph, score });

    const facts = normalizeCodeGraphFacts({
      graph,
      testImpactPlan: testImpact,
      staleLabels: ["src/main.ts"],
    });

    expect(facts.facts.map((fact) => fact.kind)).toEqual(
      expect.arrayContaining([
        "file-node",
        "symbol-node",
        "import-edge",
        "test-edge",
        "docs-edge",
        "call-reference-edge",
        "verification-candidate-edge",
        "staleness-fact",
      ]),
    );
    expect(facts.facts.some((fact) => fact.freshness === "stale")).toBe(true);
    expect(facts.mutationAuthority).toBe("not-granted");
    expect(JSON.stringify(facts)).not.toContain("function runApp");
  });
});

function node(
  kind: Parameters<typeof buildContextGraph>[0]["nodes"][number]["kind"],
  pathLabel: string,
  depth: 0 | 1 | 2,
): Parameters<typeof buildContextGraph>[0]["nodes"][number] {
  return {
    kind,
    pathLabel,
    relation: kind,
    sourceKind: "target-packet",
    depth,
    reason: kind,
    budgetStatus: "included",
    confidence: "high",
    redactionStatus: "redacted-and-budgeted",
  };
}

function edge(
  fromPathLabel: string,
  toPathLabel: string,
  kind: Parameters<typeof buildContextGraph>[0]["edges"][number]["kind"],
): Parameters<typeof buildContextGraph>[0]["edges"][number] {
  return {
    fromPathLabel,
    toPathLabel,
    kind,
    reason: kind,
  };
}
