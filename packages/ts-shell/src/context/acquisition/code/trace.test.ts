import { describe, expect, it } from "vitest";

import { normalizeCodeGraphFacts } from "./facts.js";
import { buildCodeGraphTrace } from "./trace.js";
import { buildContextGraph } from "../../graph/contextGraph.js";

describe("buildCodeGraphTrace", () => {
  it("creates deterministic trace counts with no mutation authority", () => {
    const graph = buildContextGraph({
      rootTarget: "src/app.ts",
      nodes: [
        node("root-target", "src/app.ts", 0),
        node("direct-import", "src/lib.ts", 1),
        node("nearby-test", "src/app.test.ts", 1),
      ],
      edges: [
        { fromPathLabel: "src/app.ts", toPathLabel: "src/lib.ts", kind: "imports", reason: "imports" },
        { fromPathLabel: "src/app.ts", toPathLabel: "src/app.test.ts", kind: "tests", reason: "tests" },
      ],
    });
    const facts = normalizeCodeGraphFacts({ graph });

    const trace = buildCodeGraphTrace({ graph, facts });

    expect(trace.traceId).toMatch(/^code_graph_trace_/);
    expect(trace.nodeCounts.files).toBe(3);
    expect(trace.edgeCounts.imports).toBe(1);
    expect(trace.edgeCounts.tests).toBe(1);
    expect(trace.impactReadiness).toBe("impact-ready");
    expect(trace.mutationAuthority).toBe("not-granted");
    expect(trace.evidence).toContain("code-graph-trace:mutation-authority:not-granted");
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
