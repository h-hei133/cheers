import { describe, expect, it } from "vitest";

import { buildCodeGraphImpact } from "./impact.js";
import { normalizeCodeGraphFacts } from "./facts.js";
import { buildCodeGraphTrace } from "./trace.js";
import { buildContextGraph } from "../../graph/contextGraph.js";
import { scoreContextGraph } from "../../graph/contextGraphScore.js";
import { buildTestImpactPlan } from "../../../orchestration/testImpactPlan.js";

describe("buildCodeGraphImpact", () => {
  it("summarizes tests docs call-sites verification and plan-quality contribution", () => {
    const graph = buildContextGraph({
      rootTarget: "src/app.ts",
      nodes: [
        node("root-target", "src/app.ts", 0),
        node("direct-import", "src/lib.ts", 1),
        node("nearby-test", "src/app.test.ts", 1),
        node("docs-readme", "README.md", 1),
        node("reverse-call-site", "src/main.ts", 1),
      ],
      edges: [
        { fromPathLabel: "src/app.ts", toPathLabel: "src/lib.ts", kind: "imports", reason: "imports" },
        { fromPathLabel: "src/app.ts", toPathLabel: "src/app.test.ts", kind: "tests", reason: "tests" },
        { fromPathLabel: "src/app.ts", toPathLabel: "README.md", kind: "documents", reason: "docs" },
        { fromPathLabel: "src/app.ts", toPathLabel: "src/main.ts", kind: "calls-or-references", reason: "uses" },
      ],
    });
    const testImpact = buildTestImpactPlan({ graph, score: scoreContextGraph(graph) });
    const trace = buildCodeGraphTrace({
      graph,
      facts: normalizeCodeGraphFacts({ graph, testImpactPlan: testImpact }),
    });

    const impact = buildCodeGraphImpact({ trace });

    expect(impact.readiness).toBe("impact-ready");
    expect(impact.likelyTests).toContain("src/app.test.ts");
    expect(impact.docsReferences).toContain("README.md");
    expect(impact.likelyCallSites).toContain("src/main.ts");
    expect(impact.suggestedVerification).toContain("npm test -- --help");
    expect(impact.planQualityContribution.impactConfidenceScore).toBeGreaterThan(60);
    expect(impact.evidence).toContain("code-graph-impact:mutation-authority:not-granted");
  });

  it("downgrades stale trace facts to a stale warning", () => {
    const graph = buildContextGraph({
      rootTarget: "src/app.ts",
      nodes: [
        node("root-target", "src/app.ts", 0),
        node("nearby-test", "src/app.test.ts", 1),
      ],
      edges: [
        { fromPathLabel: "src/app.ts", toPathLabel: "src/app.test.ts", kind: "tests", reason: "tests" },
      ],
    });
    const trace = buildCodeGraphTrace({
      graph,
      facts: normalizeCodeGraphFacts({ graph, staleLabels: ["src/app.ts"] }),
    });

    const impact = buildCodeGraphImpact({ trace });

    expect(impact.readiness).toBe("stale-warning");
    expect(impact.confidence).toBe("low");
    expect(impact.planQualityContribution.staleRisk).toBe("high");
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
